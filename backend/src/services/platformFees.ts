import Stripe from 'stripe'
import { query as dbQuery } from '../config/database.js'
import { v4 as uuidv4 } from 'uuid'
import { notifyAuctionWon, notifyAuctionLost } from './notifications.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
})

// Platform fee per item (taken from proceeds, invisible to bidder)
export const PLATFORM_FEE_PER_ITEM = 1.00 // $1 per item sold

// Stripe fee estimate (for informational purposes)
// Actual Stripe fees are: 2.9% + $0.30 per transaction
export const STRIPE_FEE_PERCENT = 2.9
export const STRIPE_FEE_FIXED = 0.30

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
 * Calculate platform fee for a sold item
 * Fixed $1 per item, taken from proceeds
 */
export function calculatePlatformFee(_amount: number): number {
  return PLATFORM_FEE_PER_ITEM
}

/**
 * Calculate estimated Stripe fees for a transaction
 */
export function calculateStripeFee(amount: number): number {
  return (amount * STRIPE_FEE_PERCENT / 100) + STRIPE_FEE_FIXED
}

/**
 * Calculate net proceeds for organization after all fees
 * Fees are deducted from proceeds, not charged to bidder
 */
export function calculateNetProceeds(winningBid: number): {
  grossAmount: number
  platformFee: number
  stripeFee: number
  netAmount: number
} {
  const platformFee = PLATFORM_FEE_PER_ITEM
  const stripeFee = calculateStripeFee(winningBid)
  const netAmount = winningBid - platformFee - stripeFee

  return {
    grossAmount: winningBid,
    platformFee,
    stripeFee,
    netAmount: Math.max(0, netAmount), // Ensure non-negative
  }
}

/**
 * Process auction completion and calculate fees
 * Called when an event ends
 * Handles both integrated (Stripe) and self-managed payment modes
 */
export async function processEventCompletion(
  eventId: string
): Promise<EventCompletionResult> {
  // Get event details including payment mode
  const eventResult = await dbQuery(
    `SELECT * FROM auction_events WHERE id = @eventId`,
    { eventId }
  )

  if (eventResult.recordset.length === 0) {
    throw new Error('Event not found')
  }

  const event = eventResult.recordset[0]
  const isSelfManaged = event.payment_mode === 'self_managed'

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
      platformFee: isSelfManaged ? 0 : calculatePlatformFee(row.amount),
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
      platformFee: isSelfManaged ? 0 : calculatePlatformFee(row.amount),
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
    // For self-managed payments, set payment_status to 'pending' and fulfillment_status to 'pending'
    // For integrated payments, the existing flow handles it via Stripe webhooks
    await dbQuery(
      `UPDATE event_items
       SET status = 'won',
           current_bid = @amount,
           winner_id = @winnerId,
           won_at = GETUTCDATE(),
           payment_status = ${isSelfManaged ? "'pending'" : "payment_status"},
           fulfillment_status = ${isSelfManaged ? "'pending'" : "fulfillment_status"}
       WHERE id = @itemId`,
      {
        itemId: bid.itemId,
        amount: bid.winningAmount,
        winnerId: bid.winnerId,
      }
    )

    // Only create platform fee records for integrated payments
    if (!isSelfManaged) {
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
  // For self-managed payments, the notification will include payment instructions
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
 * Get pricing information
 */
export function getPricingInfo() {
  return {
    platformFeePerItem: PLATFORM_FEE_PER_ITEM,
    stripeFeePercent: STRIPE_FEE_PERCENT,
    stripeFeeFixed: STRIPE_FEE_FIXED,
    description: `$${PLATFORM_FEE_PER_ITEM.toFixed(2)} per item sold (deducted from proceeds). Payment processing fees also apply.`,
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
 * Publish an event (no upfront fee - fees are taken from proceeds)
 */
export async function publishEvent(
  eventId: string,
  userId: string
): Promise<{
  success: boolean
  eventName: string
  message: string
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

  // Update event status to scheduled (no payment required)
  await dbQuery(
    `UPDATE auction_events
     SET status = 'scheduled',
         updated_at = GETUTCDATE()
     WHERE id = @eventId`,
    { eventId }
  )

  console.log(`Event ${eventId} published (fees will be collected from proceeds)`)

  return {
    success: true,
    eventName: event.name,
    message: 'Event published successfully. Platform fees will be deducted from proceeds when items sell.',
  }
}

/**
 * Process event cancellation
 * No refunds needed since fees are taken from proceeds
 */
export async function processEventCancellation(
  eventId: string,
  userId: string
): Promise<{
  cancelled: boolean
  message: string
}> {
  // Get event details
  const eventResult = await dbQuery(
    `SELECT * FROM auction_events WHERE id = @eventId`,
    { eventId }
  )

  if (eventResult.recordset.length === 0) {
    throw new Error('Event not found')
  }

  const event = eventResult.recordset[0]

  // Verify user has permission (must be org admin/owner or event owner)
  let hasPermission = event.owner_id === userId

  if (!hasPermission && event.organization_id) {
    const permissionResult = await dbQuery(
      `SELECT role FROM organization_members
       WHERE organization_id = @orgId AND user_id = @userId AND role IN ('admin', 'owner')`,
      { orgId: event.organization_id, userId }
    )
    hasPermission = permissionResult.recordset.length > 0
  }

  if (!hasPermission) {
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
      message: 'Event cancelled. All bids have been cancelled and bidders notified.',
    }
  }

  // Event hasn't started - just cancel it
  return {
    cancelled: true,
    message: 'Event cancelled successfully.',
  }
}

export { stripe }
