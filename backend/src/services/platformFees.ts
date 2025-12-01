import Stripe from 'stripe'
import { query as dbQuery } from '../config/database.js'
import { v4 as uuidv4 } from 'uuid'
import { notifyAuctionWon, notifyAuctionLost } from './notifications.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
})

// Tier limits and flat fees configuration
export const TIER_LIMITS = {
  small: { maxItems: 25, flatFee: 49 },
  medium: { maxItems: 100, flatFee: 99 },
  large: { maxItems: 500, flatFee: 199 },
  unlimited: { maxItems: null, flatFee: 399 },
} as const

// Platform fee percentage (collected from winning bids)
export const PLATFORM_FEE_PERCENT = 5 // 5% of winning bid amount

// Minimum platform fee per item
export const PLATFORM_FEE_MIN = 0.50 // $0.50 minimum

export type EventTier = keyof typeof TIER_LIMITS

/**
 * Get the flat fee for publishing an event tier
 */
export function getTierFlatFee(tier: EventTier): number {
  return TIER_LIMITS[tier].flatFee
}

interface WinningBidSummary {
  itemId: string
  itemTitle: string
  winnerId: string
  winnerEmail: string
  winnerName: string
  winningAmount: number
  platformFee: number
}

interface EventCompletionResult {
  eventId: string
  totalRaised: number
  totalPlatformFees: number
  winningBids: WinningBidSummary[]
}

/**
 * Calculate platform fee for a winning bid amount
 */
export function calculatePlatformFee(amount: number): number {
  const percentageFee = amount * (PLATFORM_FEE_PERCENT / 100)
  return Math.max(percentageFee, PLATFORM_FEE_MIN)
}

/**
 * Process auction completion and calculate fees
 * Called when an event ends
 */
export async function processEventCompletion(
  eventId: string
): Promise<EventCompletionResult> {
  // Get event details
  const eventResult = await dbQuery(
    `SELECT * FROM auction_events WHERE id = @eventId`,
    { eventId }
  )

  if (eventResult.recordset.length === 0) {
    throw new Error('Event not found')
  }

  const event = eventResult.recordset[0]

  // Determine winners based on auction type
  let winningBids: WinningBidSummary[] = []

  if (event.auction_type === 'silent') {
    // For silent auctions, highest bidder wins each item
    const winnersResult = await dbQuery(
      `WITH RankedBids AS (
        SELECT
          sb.item_id,
          sb.bidder_id,
          sb.amount,
          u.email as winner_email,
          u.display_name as winner_name,
          ei.title as item_title,
          ROW_NUMBER() OVER (PARTITION BY sb.item_id ORDER BY sb.amount DESC, sb.created_at ASC) as rank
        FROM event_item_silent_bids sb
        INNER JOIN event_items ei ON sb.item_id = ei.id
        INNER JOIN users u ON sb.bidder_id = u.id
        WHERE ei.event_id = @eventId
          AND ei.status = 'active'
          AND ei.submission_status = 'approved'
      )
      SELECT * FROM RankedBids WHERE rank = 1`,
      { eventId }
    )

    winningBids = winnersResult.recordset.map((row: any) => ({
      itemId: row.item_id,
      itemTitle: row.item_title,
      winnerId: row.bidder_id,
      winnerEmail: row.winner_email,
      winnerName: row.winner_name,
      winningAmount: row.amount,
      platformFee: calculatePlatformFee(row.amount),
    }))
  } else {
    // For standard auctions, highest visible bid wins
    const winnersResult = await dbQuery(
      `WITH RankedBids AS (
        SELECT
          b.item_id,
          b.bidder_id,
          b.amount,
          u.email as winner_email,
          u.display_name as winner_name,
          ei.title as item_title,
          ROW_NUMBER() OVER (PARTITION BY b.item_id ORDER BY b.amount DESC, b.created_at ASC) as rank
        FROM event_item_bids b
        INNER JOIN event_items ei ON b.item_id = ei.id
        INNER JOIN users u ON b.bidder_id = u.id
        WHERE ei.event_id = @eventId
          AND ei.status = 'active'
          AND ei.submission_status = 'approved'
      )
      SELECT * FROM RankedBids WHERE rank = 1`,
      { eventId }
    )

    winningBids = winnersResult.recordset.map((row: any) => ({
      itemId: row.item_id,
      itemTitle: row.item_title,
      winnerId: row.bidder_id,
      winnerEmail: row.winner_email,
      winnerName: row.winner_name,
      winningAmount: row.amount,
      platformFee: calculatePlatformFee(row.amount),
    }))
  }

  // Calculate totals
  const totalRaised = winningBids.reduce((sum, bid) => sum + bid.winningAmount, 0)
  const totalPlatformFees = winningBids.reduce((sum, bid) => sum + bid.platformFee, 0)

  // Update event with final totals
  await dbQuery(
    `UPDATE auction_events
     SET status = 'ended',
         total_raised = @totalRaised
     WHERE id = @eventId`,
    { eventId, totalRaised }
  )

  // Update item statuses and store winners
  for (const bid of winningBids) {
    await dbQuery(
      `UPDATE event_items
       SET status = 'won',
           current_bid = @amount,
           winner_id = @winnerId
       WHERE id = @itemId`,
      {
        itemId: bid.itemId,
        amount: bid.winningAmount,
        winnerId: bid.winnerId,
      }
    )

    // Create platform fee record for each winning item
    await dbQuery(
      `INSERT INTO platform_fees (
        id, user_id, organization_id, event_id, fee_type, amount, status, created_at
      ) VALUES (
        @id, @userId, @organizationId, @eventId, 'item_sale', @amount, 'pending', GETUTCDATE()
      )`,
      {
        id: uuidv4(),
        userId: event.owner_id || null,
        organizationId: event.organization_id || null,
        eventId,
        amount: bid.platformFee,
      }
    )
  }

  // Mark items with no bids as unsold
  await dbQuery(
    `UPDATE event_items
     SET status = 'unsold'
     WHERE event_id = @eventId
       AND status = 'active'
       AND id NOT IN (SELECT item_id FROM event_item_bids UNION SELECT item_id FROM event_item_silent_bids)`,
    { eventId }
  )

  // Send notifications to winners
  for (const bid of winningBids) {
    await notifyAuctionWon(bid.winnerId, bid.itemTitle, bid.winningAmount, eventId, bid.itemId)
  }

  // Send notifications to losers (bidders who didn't win)
  // Get all bidders who bid on items but didn't win
  const losersResult = await dbQuery(
    `SELECT DISTINCT b.bidder_id, ei.title as item_title, ei.id as item_id
     FROM (
       SELECT item_id, bidder_id FROM event_item_bids WHERE item_id IN (
         SELECT id FROM event_items WHERE event_id = @eventId AND status = 'won'
       )
       UNION
       SELECT item_id, bidder_id FROM event_item_silent_bids WHERE item_id IN (
         SELECT id FROM event_items WHERE event_id = @eventId AND status = 'won'
       )
     ) b
     INNER JOIN event_items ei ON b.item_id = ei.id
     WHERE b.bidder_id NOT IN (SELECT winner_id FROM event_items WHERE event_id = @eventId AND status = 'won' AND winner_id IS NOT NULL)
       OR b.item_id NOT IN (SELECT id FROM event_items WHERE event_id = @eventId AND status = 'won' AND winner_id = b.bidder_id)`,
    { eventId }
  )

  for (const loser of losersResult.recordset) {
    await notifyAuctionLost(loser.bidder_id, loser.item_title, eventId, loser.item_id)
  }

  return {
    eventId,
    totalRaised,
    totalPlatformFees,
    winningBids,
  }
}

/**
 * Create payment intent for winning bid (item purchase)
 * Winner pays: winning bid amount + platform fee
 */
export async function createWinnerPaymentIntent(
  itemId: string,
  userId: string
): Promise<{
  clientSecret: string
  paymentIntentId: string
  amount: number
  platformFee: number
  itemTotal: number
}> {
  // Get item details
  const itemResult = await dbQuery(
    `SELECT ei.*, ae.name as event_name, ae.organization_id
     FROM event_items ei
     INNER JOIN auction_events ae ON ei.event_id = ae.id
     WHERE ei.id = @itemId AND ei.winner_id = @userId`,
    { itemId, userId }
  )

  if (itemResult.recordset.length === 0) {
    throw new Error('Item not found or you are not the winner')
  }

  const item = itemResult.recordset[0]

  if (item.status !== 'won') {
    throw new Error('This item has not been won or is already paid')
  }

  const winningAmount = item.current_bid
  const platformFee = calculatePlatformFee(winningAmount)
  const totalAmount = winningAmount + platformFee

  // Get user's Stripe customer ID
  const userResult = await dbQuery(
    'SELECT stripe_customer_id FROM users WHERE id = @userId',
    { userId }
  )

  const stripeCustomerId = userResult.recordset[0]?.stripe_customer_id

  // Create payment intent
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(totalAmount * 100), // Convert to cents
    currency: 'usd',
    customer: stripeCustomerId || undefined,
    automatic_payment_methods: {
      enabled: true,
    },
    metadata: {
      type: 'auction_win',
      itemId,
      eventId: item.event_id,
      userId,
      winningAmount: winningAmount.toString(),
      platformFee: platformFee.toString(),
    },
    // For connected accounts (organizations), use transfer_data
    // This would transfer the winning amount minus fees to the org's Stripe account
    // Uncomment when Stripe Connect is fully set up:
    // transfer_data: item.organization_id ? {
    //   destination: 'org_stripe_account_id',
    //   amount: Math.round(winningAmount * 100),
    // } : undefined,
  })

  return {
    clientSecret: paymentIntent.client_secret!,
    paymentIntentId: paymentIntent.id,
    amount: winningAmount,
    platformFee,
    itemTotal: totalAmount,
  }
}

/**
 * Handle payment completion webhook for auction wins
 */
export async function handleWinnerPaymentWebhook(
  paymentIntent: Stripe.PaymentIntent
): Promise<void> {
  if (paymentIntent.metadata?.type !== 'auction_win') {
    return
  }

  const { itemId, userId, platformFee } = paymentIntent.metadata

  if (!itemId || !userId) {
    console.error('Missing metadata in payment intent:', paymentIntent.id)
    return
  }

  // Update item status to sold
  await dbQuery(
    `UPDATE event_items SET status = 'sold' WHERE id = @itemId`,
    { itemId }
  )

  // Update platform fee status
  await dbQuery(
    `UPDATE platform_fees
     SET status = 'paid',
         stripe_payment_intent_id = @paymentIntent
     WHERE event_id = (SELECT event_id FROM event_items WHERE id = @itemId)
       AND amount = @feeAmount
       AND status = 'pending'`,
    {
      paymentIntent: paymentIntent.id,
      itemId,
      feeAmount: parseFloat(platformFee),
    }
  )

  console.log(`Payment completed for item ${itemId}`)
}

/**
 * Get pricing information (tier limits + fee percentage)
 */
export function getPricingInfo() {
  return {
    tiers: TIER_LIMITS,
    platformFeePercent: PLATFORM_FEE_PERCENT,
    minimumFee: PLATFORM_FEE_MIN,
    description: `${PLATFORM_FEE_PERCENT}% platform fee on winning bids (minimum $${PLATFORM_FEE_MIN.toFixed(2)} per item)`,
  }
}

/**
 * Get event summary with fee calculations
 */
export async function getEventFeeSummary(eventId: string): Promise<{
  totalRaised: number
  totalPlatformFees: number
  pendingPayments: number
  completedPayments: number
  items: {
    id: string
    title: string
    winningBid: number | null
    platformFee: number | null
    paymentStatus: 'pending' | 'paid' | null
  }[]
}> {
  const itemsResult = await dbQuery(
    `SELECT
      ei.id,
      ei.title,
      ei.current_bid as winning_bid,
      ei.status,
      pf.amount as platform_fee,
      pf.status as fee_status
     FROM event_items ei
     LEFT JOIN platform_fees pf ON pf.event_id = ei.event_id
       AND pf.amount = @feeCalc
     WHERE ei.event_id = @eventId
       AND ei.submission_status = 'approved'
     ORDER BY ei.created_at`,
    {
      eventId,
      // This is a simplified version - in production you'd join properly
    }
  )

  const items: {
    id: string
    title: string
    winningBid: number | null
    platformFee: number | null
    paymentStatus: 'pending' | 'paid' | null
  }[] = itemsResult.recordset.map((row: any) => ({
    id: row.id,
    title: row.title,
    winningBid: row.status === 'won' || row.status === 'sold' ? row.winning_bid : null,
    platformFee: row.winning_bid ? calculatePlatformFee(row.winning_bid) : null,
    paymentStatus: row.status === 'sold' ? 'paid' as const : row.status === 'won' ? 'pending' as const : null,
  }))

  const totalRaised = items.reduce((sum, item) => sum + (item.winningBid || 0), 0)
  const totalPlatformFees = items.reduce((sum, item) => sum + (item.platformFee || 0), 0)
  const pendingPayments = items.filter(i => i.paymentStatus === 'pending').length
  const completedPayments = items.filter(i => i.paymentStatus === 'paid').length

  return {
    totalRaised,
    totalPlatformFees,
    pendingPayments,
    completedPayments,
    items,
  }
}

/**
 * Create payment intent for publishing an event
 * Charges the flat tier fee upfront
 */
export async function createPublishPaymentIntent(
  eventId: string,
  userId: string
): Promise<{
  clientSecret: string
  paymentIntentId: string
  amount: number
  tier: EventTier
  eventName: string
}> {
  // Get event details
  const eventResult = await dbQuery(
    `SELECT ae.*, o.name as org_name
     FROM auction_events ae
     LEFT JOIN organizations o ON ae.organization_id = o.id
     WHERE ae.id = @eventId`,
    { eventId }
  )

  if (eventResult.recordset.length === 0) {
    throw new Error('Event not found')
  }

  const event = eventResult.recordset[0]

  if (event.status !== 'draft') {
    throw new Error('Only draft events can be published')
  }

  // Verify user has permission to publish this event
  const isOwner = event.owner_id === userId

  let isOrgAdmin = false
  if (event.organization_id) {
    const memberResult = await dbQuery(
      `SELECT role FROM organization_members
       WHERE organization_id = @orgId AND user_id = @userId AND role IN ('owner', 'admin')`,
      { orgId: event.organization_id, userId }
    )
    isOrgAdmin = memberResult.recordset.length > 0
  }

  if (!isOwner && !isOrgAdmin) {
    throw new Error('You do not have permission to publish this event')
  }

  const tier = event.tier as EventTier
  const flatFee = getTierFlatFee(tier)

  // Get user's Stripe customer ID if exists
  const userResult = await dbQuery(
    'SELECT stripe_customer_id, email, display_name FROM users WHERE id = @userId',
    { userId }
  )

  const user = userResult.recordset[0]
  const stripeCustomerId = user?.stripe_customer_id

  // Create payment intent
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(flatFee * 100), // Convert to cents
    currency: 'usd',
    customer: stripeCustomerId || undefined,
    automatic_payment_methods: {
      enabled: true,
    },
    metadata: {
      type: 'event_publish',
      eventId,
      userId,
      tier,
      eventName: event.name,
      organizationId: event.organization_id || '',
    },
  })

  return {
    clientSecret: paymentIntent.client_secret!,
    paymentIntentId: paymentIntent.id,
    amount: flatFee,
    tier,
    eventName: event.name,
  }
}

/**
 * Handle payment completion webhook for event publishing
 */
export async function handlePublishPaymentWebhook(
  paymentIntent: Stripe.PaymentIntent
): Promise<void> {
  if (paymentIntent.metadata?.type !== 'event_publish') {
    return
  }

  const { eventId, userId, tier, organizationId } = paymentIntent.metadata

  if (!eventId || !userId || !tier) {
    console.error('Missing metadata in publish payment intent:', paymentIntent.id)
    return
  }

  const flatFee = getTierFlatFee(tier as EventTier)

  // Create platform fee record
  const feeId = uuidv4()
  await dbQuery(
    `INSERT INTO platform_fees (
      id, user_id, organization_id, event_id, fee_type, amount,
      stripe_payment_intent_id, status, created_at
    ) VALUES (
      @feeId, @userId, @organizationId, @eventId, @feeType, @amount,
      @paymentIntentId, 'paid', GETUTCDATE()
    )`,
    {
      feeId,
      userId,
      organizationId: organizationId || null,
      eventId,
      feeType: `event_${tier}`,
      amount: flatFee,
      paymentIntentId: paymentIntent.id,
    }
  )

  // Update event status to scheduled and link to fee
  await dbQuery(
    `UPDATE auction_events
     SET status = 'scheduled',
         fee_id = @feeId,
         updated_at = GETUTCDATE()
     WHERE id = @eventId`,
    { eventId, feeId }
  )

  console.log(`Event ${eventId} published after payment ${paymentIntent.id}`)
}

/**
 * Process event cancellation and determine refund eligibility
 */
export async function processEventCancellation(
  eventId: string,
  userId: string
): Promise<{
  cancelled: boolean
  refunded: boolean
  refundAmount: number | null
  message: string
}> {
  // Get event with fee info
  const eventResult = await dbQuery(
    `SELECT ae.*, pf.id as fee_id, pf.amount as fee_amount, pf.stripe_payment_intent_id,
            pf.status as fee_status
     FROM auction_events ae
     LEFT JOIN platform_fees pf ON ae.fee_id = pf.id
     WHERE ae.id = @eventId`,
    { eventId }
  )

  if (eventResult.recordset.length === 0) {
    throw new Error('Event not found')
  }

  const event = eventResult.recordset[0]

  // Verify user has permission (must be org admin or owner)
  const permissionResult = await dbQuery(
    `SELECT om.role FROM organization_members om
     JOIN auction_events ae ON ae.organization_id = om.organization_id
     WHERE ae.id = @eventId AND om.user_id = @userId AND om.role IN ('admin', 'owner')`,
    { eventId, userId }
  )

  if (permissionResult.recordset.length === 0) {
    throw new Error('You do not have permission to cancel this event')
  }

  // Check if event has already started (active)
  const now = new Date()
  const startTime = new Date(event.start_time)
  const hasStarted = now >= startTime || event.status === 'active'

  // Mark event as cancelled
  await dbQuery(
    `UPDATE auction_events
     SET status = 'cancelled',
         updated_at = GETUTCDATE()
     WHERE id = @eventId`,
    { eventId }
  )

  // If event has started, cancel all bids and notify bidders
  if (hasStarted) {
    // Get all bidders to notify
    const biddersResult = await dbQuery(
      `SELECT DISTINCT b.bidder_id, ei.title as item_title, ei.id as item_id
       FROM (
         SELECT bidder_id, item_id FROM event_item_bids WHERE item_id IN (
           SELECT id FROM event_items WHERE event_id = @eventId
         )
         UNION
         SELECT bidder_id, item_id FROM event_item_silent_bids WHERE item_id IN (
           SELECT id FROM event_items WHERE event_id = @eventId
         )
       ) b
       INNER JOIN event_items ei ON b.item_id = ei.id`,
      { eventId }
    )

    // Notify all bidders about cancellation
    for (const bidder of biddersResult.recordset) {
      try {
        const { notifyBidCancelled } = await import('./notifications.js')
        await notifyBidCancelled(
          bidder.bidder_id,
          bidder.item_title,
          eventId,
          bidder.item_id
        )
      } catch (err) {
        console.error('Failed to notify bidder:', err)
      }
    }

    // Cancel all items
    await dbQuery(
      `UPDATE event_items SET status = 'cancelled' WHERE event_id = @eventId`,
      { eventId }
    )

    return {
      cancelled: true,
      refunded: false,
      refundAmount: null,
      message: 'Event cancelled. All bids have been cancelled and bidders notified. No refund issued as auction had already started.',
    }
  }

  // Event hasn't started - process refund if payment was made
  if (event.fee_id && event.fee_status === 'paid' && event.stripe_payment_intent_id) {
    try {
      // Create refund via Stripe
      await stripe.refunds.create({
        payment_intent: event.stripe_payment_intent_id,
      })

      // Update fee record
      await dbQuery(
        `UPDATE platform_fees
         SET status = 'refunded',
             refunded_at = GETUTCDATE(),
             refund_reason = 'Event cancelled before start'
         WHERE id = @feeId`,
        { feeId: event.fee_id }
      )

      return {
        cancelled: true,
        refunded: true,
        refundAmount: event.fee_amount,
        message: `Event cancelled and $${event.fee_amount.toFixed(2)} refunded to your payment method.`,
      }
    } catch (err) {
      console.error('Refund failed:', err)
      return {
        cancelled: true,
        refunded: false,
        refundAmount: null,
        message: 'Event cancelled but refund failed. Please contact support.',
      }
    }
  }

  return {
    cancelled: true,
    refunded: false,
    refundAmount: null,
    message: 'Event cancelled successfully.',
  }
}

/**
 * Confirm payment and publish event (called from frontend after successful payment)
 * This is an alternative to webhook-based confirmation
 */
export async function confirmPublishPayment(
  eventId: string,
  paymentIntentId: string,
  userId: string
): Promise<{ success: boolean; message: string }> {
  // Verify the payment intent from Stripe
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

  // Verify payment succeeded
  if (paymentIntent.status !== 'succeeded') {
    return {
      success: false,
      message: `Payment not completed. Status: ${paymentIntent.status}`,
    }
  }

  // Verify this is an event_publish payment for the correct event
  // Use case-insensitive comparison for UUIDs
  if (
    paymentIntent.metadata?.type !== 'event_publish' ||
    paymentIntent.metadata?.eventId?.toLowerCase() !== eventId.toLowerCase()
  ) {
    return {
      success: false,
      message: 'Payment does not match this event',
    }
  }

  // Check if event is already published (idempotency)
  const eventResult = await dbQuery(
    `SELECT status, fee_id FROM auction_events WHERE id = @eventId`,
    { eventId }
  )

  if (eventResult.recordset.length === 0) {
    return { success: false, message: 'Event not found' }
  }

  const event = eventResult.recordset[0]

  // Already published - return success (idempotent)
  if (event.status === 'scheduled' && event.fee_id) {
    return { success: true, message: 'Event already published' }
  }

  // Check if fee record already exists for this payment (webhook might have processed it)
  const existingFee = await dbQuery(
    `SELECT id FROM platform_fees WHERE stripe_payment_intent_id = @paymentIntentId`,
    { paymentIntentId }
  )

  if (existingFee.recordset.length > 0) {
    // Fee exists, just make sure event is updated
    await dbQuery(
      `UPDATE auction_events
       SET status = 'scheduled',
           fee_id = @feeId,
           updated_at = GETUTCDATE()
       WHERE id = @eventId AND status = 'draft'`,
      { eventId, feeId: existingFee.recordset[0].id }
    )
    return { success: true, message: 'Event published successfully' }
  }

  // Create platform fee record and publish event
  const { tier, organizationId } = paymentIntent.metadata
  const flatFee = getTierFlatFee(tier as EventTier)

  const feeId = uuidv4()
  await dbQuery(
    `INSERT INTO platform_fees (
      id, user_id, organization_id, event_id, fee_type, amount,
      stripe_payment_intent_id, status, created_at
    ) VALUES (
      @feeId, @userId, @organizationId, @eventId, @feeType, @amount,
      @paymentIntentId, 'paid', GETUTCDATE()
    )`,
    {
      feeId,
      userId,
      organizationId: organizationId || null,
      eventId,
      feeType: `event_${tier}`,
      amount: flatFee,
      paymentIntentId,
    }
  )

  // Update event status to scheduled
  await dbQuery(
    `UPDATE auction_events
     SET status = 'scheduled',
         fee_id = @feeId,
         updated_at = GETUTCDATE()
     WHERE id = @eventId`,
    { eventId, feeId }
  )

  console.log(`Event ${eventId} published after payment confirmation ${paymentIntentId}`)

  return { success: true, message: 'Event published successfully' }
}

export { stripe }
