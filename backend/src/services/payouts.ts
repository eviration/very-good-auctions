import { query as dbQuery } from '../config/database.js'
import { v4 as uuidv4 } from 'uuid'
import { transferToOrganization } from './stripeConnect.js'
import { PLATFORM_FEE_PER_ITEM } from './platformFees.js'
import { getOrganizationTaxInfo } from './taxForms.js'
import { logComplianceEvent } from './complianceAudit.js'

// Payout configuration
export const PAYOUT_CONFIG = {
  HOLD_PERIOD_DAYS: 7,              // Days after event end before payout eligible
  RESERVE_PERCENT: 10,              // Percentage held back
  RESERVE_HOLD_DAYS: 30,            // Days reserve is held after payout
  STRIPE_FEE_PERCENT: 2.9,          // Stripe fee percentage
  STRIPE_FEE_FIXED: 0.30,           // Stripe fixed fee per transaction
}

// Trust level auto-payout limits
export const AUTO_PAYOUT_LIMITS: Record<string, number> = {
  new: 500,
  established: 2500,
  trusted: 10000,
  verified_np: 25000,
  flagged: 0,
}

export type TrustLevel = 'new' | 'established' | 'trusted' | 'verified_np' | 'flagged'
export type PayoutStatus = 'pending' | 'eligible' | 'processing' | 'completed' | 'held' | 'failed'

export interface PayoutSummary {
  id: string
  eventId: string
  eventName: string
  organizationId: string
  organizationName: string
  grossAmount: number
  stripeFees: number
  platformFee: number
  reserveAmount: number
  netPayout: number
  status: PayoutStatus
  eligibleAt: Date
  flags: string[]
  requiresReview: boolean
}

export interface FraudFlags {
  flags: string[]
  requiresReview: boolean
}

/**
 * Calculate estimated Stripe fees for an amount
 */
export function calculateStripeFees(amount: number): number {
  return amount * (PAYOUT_CONFIG.STRIPE_FEE_PERCENT / 100) + PAYOUT_CONFIG.STRIPE_FEE_FIXED
}

/**
 * Calculate payout amounts for an event
 */
export function calculatePayoutAmounts(grossAmount: number, itemCount: number = 1): {
  grossAmount: number
  stripeFees: number
  platformFee: number
  reserveAmount: number
  netPayout: number
} {
  const stripeFees = calculateStripeFees(grossAmount)
  // Platform fee is $1 per item sold
  const platformFee = itemCount * PLATFORM_FEE_PER_ITEM
  const afterFees = grossAmount - stripeFees - platformFee
  const reserveAmount = afterFees * (PAYOUT_CONFIG.RESERVE_PERCENT / 100)
  const netPayout = afterFees - reserveAmount

  return {
    grossAmount,
    stripeFees: Math.round(stripeFees * 100) / 100,
    platformFee: Math.round(platformFee * 100) / 100,
    reserveAmount: Math.round(reserveAmount * 100) / 100,
    netPayout: Math.max(0, Math.round(netPayout * 100) / 100),
  }
}

/**
 * Check for fraud flags on an event/organization
 */
export async function checkFraudFlags(
  eventId: string,
  organizationId: string
): Promise<FraudFlags> {
  const flags: string[] = []

  // Get event and org details
  const eventResult = await dbQuery(
    `SELECT ae.*, o.created_at as org_created_at
     FROM auction_events ae
     JOIN organizations o ON ae.organization_id = o.id
     WHERE ae.id = @eventId`,
    { eventId }
  )

  if (eventResult.recordset.length === 0) {
    throw new Error('Event not found')
  }

  const event = eventResult.recordset[0]

  // Flag 1: First event for organization
  const eventCountResult = await dbQuery(
    `SELECT COUNT(*) as count FROM auction_events
     WHERE organization_id = @organizationId AND status = 'ended'`,
    { organizationId }
  )
  if (eventCountResult.recordset[0].count <= 1) {
    flags.push('first_event')
  }

  // Flag 2: High value event (over $5,000)
  if (event.total_raised > 5000) {
    flags.push('high_value')
  }

  // Flag 3: New organization (created within 14 days of event start)
  const orgCreated = new Date(event.org_created_at)
  const eventCreated = new Date(event.created_at)
  const daysSinceOrgCreation = Math.floor(
    (eventCreated.getTime() - orgCreated.getTime()) / (1000 * 60 * 60 * 24)
  )
  if (daysSinceOrgCreation < 14) {
    flags.push('new_organization')
  }

  // Flag 4: Check for suspicious bidding patterns (same users bidding on multiple items)
  const biddingPatternResult = await dbQuery(
    `SELECT bidder_id, COUNT(DISTINCT item_id) as item_count
     FROM (
       SELECT bidder_id, item_id FROM event_item_bids WHERE item_id IN (
         SELECT id FROM event_items WHERE event_id = @eventId
       )
       UNION ALL
       SELECT bidder_id, item_id FROM event_item_silent_bids WHERE item_id IN (
         SELECT id FROM event_items WHERE event_id = @eventId
       )
     ) bids
     GROUP BY bidder_id
     HAVING COUNT(DISTINCT item_id) > 5`,
    { eventId }
  )

  const totalWonItems = await dbQuery(
    `SELECT COUNT(*) as count FROM event_items WHERE event_id = @eventId AND status = 'won'`,
    { eventId }
  )

  // If someone bid on more than 50% of won items, flag it
  if (
    biddingPatternResult.recordset.length > 0 &&
    totalWonItems.recordset[0].count > 0
  ) {
    const maxItemCount = Math.max(
      ...biddingPatternResult.recordset.map((r: { item_count: number }) => r.item_count)
    )
    if (maxItemCount / totalWonItems.recordset[0].count > 0.5) {
      flags.push('suspicious_bidding')
    }
  }

  // Flag 5: High percentage of single-bidder items (>70%)
  const singleBidderResult = await dbQuery(
    `SELECT
       COUNT(CASE WHEN bid_count = 1 THEN 1 END) as single_bidder_items,
       COUNT(*) as total_items
     FROM (
       SELECT ei.id, COUNT(DISTINCT COALESCE(b.bidder_id, sb.bidder_id)) as bid_count
       FROM event_items ei
       LEFT JOIN event_item_bids b ON ei.id = b.item_id
       LEFT JOIN event_item_silent_bids sb ON ei.id = sb.item_id
       WHERE ei.event_id = @eventId AND ei.status = 'won'
       GROUP BY ei.id
     ) item_bids`,
    { eventId }
  )

  const { single_bidder_items, total_items } = singleBidderResult.recordset[0]
  if (total_items > 0 && single_bidder_items / total_items > 0.7) {
    flags.push('low_competition')
  }

  // Flag 6: Check org chargeback history
  const chargebackResult = await dbQuery(
    `SELECT COUNT(*) as count FROM chargebacks
     WHERE organization_id = @organizationId AND status = 'lost'`,
    { organizationId }
  )
  if (chargebackResult.recordset[0].count > 0) {
    flags.push('chargeback_history')
  }

  // Determine if review is required
  const reviewRequired =
    flags.includes('suspicious_bidding') ||
    flags.includes('chargeback_history') ||
    (flags.includes('first_event') && flags.includes('high_value'))

  return { flags, requiresReview: reviewRequired }
}

/**
 * Create payout record after event ends
 */
export async function createPayoutRecord(eventId: string): Promise<string> {
  // Get event with org details
  const eventResult = await dbQuery(
    `SELECT ae.*, o.stripe_account_id, o.stripe_payouts_enabled
     FROM auction_events ae
     JOIN organizations o ON ae.organization_id = o.id
     WHERE ae.id = @eventId`,
    { eventId }
  )

  if (eventResult.recordset.length === 0) {
    throw new Error('Event not found')
  }

  const event = eventResult.recordset[0]

  if (event.status !== 'ended') {
    throw new Error('Event has not ended yet')
  }

  // Check if payout already exists
  const existingPayout = await dbQuery(
    `SELECT id FROM organization_payouts WHERE event_id = @eventId`,
    { eventId }
  )

  if (existingPayout.recordset.length > 0) {
    return existingPayout.recordset[0].id
  }

  // Get count of sold items for this event
  const soldItemsResult = await dbQuery(
    `SELECT COUNT(*) as item_count FROM event_items
     WHERE event_id = @eventId AND status IN ('won', 'sold')`,
    { eventId }
  )
  const itemCount = soldItemsResult.recordset[0]?.item_count || 0

  // Calculate amounts ($1 per item sold)
  const grossAmount = event.total_raised || 0
  const amounts = calculatePayoutAmounts(grossAmount, itemCount)

  // Calculate eligibility date (7 days after event end)
  const eligibleAt = new Date(event.end_time)
  eligibleAt.setDate(eligibleAt.getDate() + PAYOUT_CONFIG.HOLD_PERIOD_DAYS)

  // Check for fraud flags
  const { flags, requiresReview } = await checkFraudFlags(
    eventId,
    event.organization_id
  )

  // Create payout record
  const payoutId = uuidv4()
  await dbQuery(
    `INSERT INTO organization_payouts (
      id, organization_id, event_id, gross_amount, stripe_fees, platform_fee,
      reserve_amount, net_payout, status, flags, requires_review, eligible_at, created_at
    ) VALUES (
      @payoutId, @organizationId, @eventId, @grossAmount, @stripeFees, @platformFee,
      @reserveAmount, @netPayout, @status, @flags, @requiresReview, @eligibleAt, GETUTCDATE()
    )`,
    {
      payoutId,
      organizationId: event.organization_id,
      eventId,
      grossAmount: amounts.grossAmount,
      stripeFees: amounts.stripeFees,
      platformFee: amounts.platformFee,
      reserveAmount: amounts.reserveAmount,
      netPayout: amounts.netPayout,
      status: requiresReview ? 'held' : 'pending',
      flags: JSON.stringify(flags),
      requiresReview,
      eligibleAt,
    }
  )

  // Update event with payout info
  await dbQuery(
    `UPDATE auction_events
     SET payout_eligible_at = @eligibleAt,
         payout_status = @status,
         payout_amount = @netPayout,
         payout_held_reason = CASE WHEN @requiresReview = 1 THEN 'Flagged for review' ELSE NULL END
     WHERE id = @eventId`,
    {
      eventId,
      eligibleAt,
      status: requiresReview ? 'held' : 'pending',
      netPayout: amounts.netPayout,
      requiresReview,
    }
  )

  return payoutId
}

/**
 * Get organization trust level
 */
export async function getOrganizationTrust(
  organizationId: string
): Promise<{
  trustLevel: TrustLevel
  autoPayoutLimit: number
  successfulEvents: number
  totalPayouts: number
  chargebackCount: number
}> {
  const trustResult = await dbQuery(
    `SELECT * FROM organization_trust WHERE organization_id = @organizationId`,
    { organizationId }
  )

  if (trustResult.recordset.length === 0) {
    // Create default trust record
    await dbQuery(
      `INSERT INTO organization_trust (id, organization_id, trust_level, auto_payout_limit)
       VALUES (@id, @organizationId, 'new', 500)`,
      { id: uuidv4(), organizationId }
    )

    return {
      trustLevel: 'new',
      autoPayoutLimit: AUTO_PAYOUT_LIMITS.new,
      successfulEvents: 0,
      totalPayouts: 0,
      chargebackCount: 0,
    }
  }

  const trust = trustResult.recordset[0]
  return {
    trustLevel: trust.trust_level as TrustLevel,
    autoPayoutLimit: trust.auto_payout_limit,
    successfulEvents: trust.successful_events,
    totalPayouts: trust.total_payouts,
    chargebackCount: trust.chargeback_count,
  }
}

/**
 * Update organization trust level based on history
 */
export async function updateTrustLevel(organizationId: string): Promise<TrustLevel> {
  // Get current stats
  const statsResult = await dbQuery(
    `SELECT
       (SELECT COUNT(*) FROM organization_payouts WHERE organization_id = @orgId AND status = 'completed') as successful_payouts,
       (SELECT SUM(net_payout) FROM organization_payouts WHERE organization_id = @orgId AND status = 'completed') as total_paid,
       (SELECT COUNT(*) FROM chargebacks WHERE organization_id = @orgId AND status = 'lost') as chargebacks,
       (SELECT org_type FROM organizations WHERE id = @orgId) as org_type`,
    { orgId: organizationId }
  )

  const stats = statsResult.recordset[0]
  const successfulPayouts = stats.successful_payouts || 0
  const chargebacks = stats.chargebacks || 0
  const isNonprofit = stats.org_type === 'nonprofit'

  // Determine new trust level
  let newTrustLevel: TrustLevel = 'new'
  let autoLimit = AUTO_PAYOUT_LIMITS.new

  if (chargebacks > 0) {
    newTrustLevel = 'flagged'
    autoLimit = AUTO_PAYOUT_LIMITS.flagged
  } else if (isNonprofit && successfulPayouts >= 2) {
    newTrustLevel = 'verified_np'
    autoLimit = AUTO_PAYOUT_LIMITS.verified_np
  } else if (successfulPayouts >= 5) {
    newTrustLevel = 'trusted'
    autoLimit = AUTO_PAYOUT_LIMITS.trusted
  } else if (successfulPayouts >= 2) {
    newTrustLevel = 'established'
    autoLimit = AUTO_PAYOUT_LIMITS.established
  }

  // Update trust record
  await dbQuery(
    `UPDATE organization_trust
     SET trust_level = @trustLevel,
         auto_payout_limit = @autoLimit,
         successful_events = @successfulPayouts,
         total_payouts = @totalPaid,
         chargeback_count = @chargebacks,
         updated_at = GETUTCDATE()
     WHERE organization_id = @orgId`,
    {
      orgId: organizationId,
      trustLevel: newTrustLevel,
      autoLimit,
      successfulPayouts,
      totalPaid: stats.total_paid || 0,
      chargebacks,
    }
  )

  return newTrustLevel
}

/**
 * Process eligible payouts
 */
export async function processEligiblePayouts(): Promise<{
  processed: number
  held: number
  errors: string[]
}> {
  const results = { processed: 0, held: 0, errors: [] as string[] }

  // Get payouts that are eligible for processing
  const eligiblePayouts = await dbQuery(
    `SELECT op.*, o.stripe_account_id, o.stripe_payouts_enabled
     FROM organization_payouts op
     JOIN organizations o ON op.organization_id = o.id
     WHERE op.status = 'pending'
       AND op.eligible_at <= GETUTCDATE()
       AND op.requires_review = 0`,
    {}
  )

  for (const payout of eligiblePayouts.recordset) {
    try {
      // Get trust level
      const trust = await getOrganizationTrust(payout.organization_id)

      // Check if auto-payout is allowed
      if (payout.net_payout > trust.autoPayoutLimit) {
        // Hold for review
        await dbQuery(
          `UPDATE organization_payouts
           SET status = 'held',
               requires_review = 1,
               flags = JSON_MODIFY(ISNULL(flags, '[]'), 'append $', 'exceeds_auto_limit')
           WHERE id = @payoutId`,
          { payoutId: payout.id }
        )
        results.held++
        continue
      }

      // Check W-9/tax compliance for payouts over $600
      if (payout.net_payout >= 600) {
        const taxInfo = await getOrganizationTaxInfo(payout.organization_id)
        if (!taxInfo || taxInfo.status !== 'verified') {
          // Hold for W-9 requirement
          await dbQuery(
            `UPDATE organization_payouts
             SET status = 'held',
                 requires_review = 1,
                 flags = JSON_MODIFY(ISNULL(flags, '[]'), 'append $', 'w9_required')
             WHERE id = @payoutId`,
            { payoutId: payout.id }
          )

          // Log compliance event
          await logComplianceEvent({
            eventType: 'payout_blocked_w9_required',
            organizationId: payout.organization_id,
            details: {
              payoutId: payout.id,
              eventId: payout.event_id,
              amount: payout.net_payout,
              taxInfoStatus: taxInfo?.status || 'not_submitted',
            },
          })

          results.held++
          continue
        }
      }

      // Check Stripe Connect status
      if (!payout.stripe_account_id || !payout.stripe_payouts_enabled) {
        results.errors.push(
          `Payout ${payout.id}: Organization ${payout.organization_id} not set up for payouts`
        )
        continue
      }

      // Execute the transfer
      await dbQuery(
        `UPDATE organization_payouts SET status = 'processing', processed_at = GETUTCDATE() WHERE id = @payoutId`,
        { payoutId: payout.id }
      )

      const transfer = await transferToOrganization(
        payout.organization_id,
        payout.net_payout,
        payout.event_id,
        payout.id
      )

      // Update payout with transfer info
      await dbQuery(
        `UPDATE organization_payouts
         SET status = 'completed',
             stripe_transfer_id = @transferId,
             completed_at = GETUTCDATE()
         WHERE id = @payoutId`,
        { payoutId: payout.id, transferId: transfer.id }
      )

      // Update event payout status
      await dbQuery(
        `UPDATE auction_events
         SET payout_status = 'completed',
             payout_transferred_at = GETUTCDATE()
         WHERE id = @eventId`,
        { eventId: payout.event_id }
      )

      // Create reserve record
      const releaseAt = new Date()
      releaseAt.setDate(releaseAt.getDate() + PAYOUT_CONFIG.RESERVE_HOLD_DAYS)

      await dbQuery(
        `INSERT INTO payout_reserves (id, payout_id, organization_id, amount, release_at, status)
         VALUES (@id, @payoutId, @orgId, @amount, @releaseAt, 'held')`,
        {
          id: uuidv4(),
          payoutId: payout.id,
          orgId: payout.organization_id,
          amount: payout.reserve_amount,
          releaseAt,
        }
      )

      // Update trust level
      await updateTrustLevel(payout.organization_id)

      results.processed++
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      results.errors.push(`Payout ${payout.id}: ${errorMessage}`)

      await dbQuery(
        `UPDATE organization_payouts SET status = 'failed' WHERE id = @payoutId`,
        { payoutId: payout.id }
      )
    }
  }

  return results
}

/**
 * Process eligible reserve releases
 */
export async function processReserveReleases(): Promise<{
  released: number
  forfeited: number
  errors: string[]
}> {
  const results = { released: 0, forfeited: 0, errors: [] as string[] }

  // Get reserves eligible for release
  const eligibleReserves = await dbQuery(
    `SELECT pr.*, o.stripe_account_id, o.stripe_payouts_enabled
     FROM payout_reserves pr
     JOIN organizations o ON pr.organization_id = o.id
     WHERE pr.status = 'held'
       AND pr.release_at <= GETUTCDATE()`,
    {}
  )

  for (const reserve of eligibleReserves.recordset) {
    try {
      // Check for chargebacks on this payout
      const chargebackResult = await dbQuery(
        `SELECT SUM(amount) as total_lost FROM chargebacks
         WHERE payout_id = @payoutId AND status = 'lost'`,
        { payoutId: reserve.payout_id }
      )

      const chargebackAmount = chargebackResult.recordset[0]?.total_lost || 0

      if (chargebackAmount >= reserve.amount) {
        // Chargebacks exceeded reserve - forfeit
        await dbQuery(
          `UPDATE payout_reserves SET status = 'forfeited', released_at = GETUTCDATE() WHERE id = @id`,
          { id: reserve.id }
        )
        results.forfeited++
        continue
      }

      // Calculate release amount (reserve minus chargebacks)
      const releaseAmount = reserve.amount - chargebackAmount

      if (!reserve.stripe_account_id || !reserve.stripe_payouts_enabled) {
        results.errors.push(
          `Reserve ${reserve.id}: Organization not set up for payouts`
        )
        continue
      }

      // Execute the transfer
      const transfer = await transferToOrganization(
        reserve.organization_id,
        releaseAmount,
        '', // No event ID for reserve release
        reserve.id
      )

      // Update reserve record
      await dbQuery(
        `UPDATE payout_reserves
         SET status = 'released',
             stripe_transfer_id = @transferId,
             released_at = GETUTCDATE(),
             amount = @releaseAmount
         WHERE id = @id`,
        {
          id: reserve.id,
          transferId: transfer.id,
          releaseAmount,
        }
      )

      results.released++
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      results.errors.push(`Reserve ${reserve.id}: ${errorMessage}`)
    }
  }

  return results
}

/**
 * Get payout details
 */
export async function getPayoutDetails(payoutId: string): Promise<PayoutSummary | null> {
  const result = await dbQuery(
    `SELECT op.*, ae.name as event_name, o.name as organization_name
     FROM organization_payouts op
     JOIN auction_events ae ON op.event_id = ae.id
     JOIN organizations o ON op.organization_id = o.id
     WHERE op.id = @payoutId`,
    { payoutId }
  )

  if (result.recordset.length === 0) {
    return null
  }

  const p = result.recordset[0]
  return {
    id: p.id,
    eventId: p.event_id,
    eventName: p.event_name,
    organizationId: p.organization_id,
    organizationName: p.organization_name,
    grossAmount: p.gross_amount,
    stripeFees: p.stripe_fees,
    platformFee: p.platform_fee,
    reserveAmount: p.reserve_amount,
    netPayout: p.net_payout,
    status: p.status,
    eligibleAt: new Date(p.eligible_at),
    flags: JSON.parse(p.flags || '[]'),
    requiresReview: p.requires_review,
  }
}

/**
 * Get organization payouts
 */
export async function getOrganizationPayouts(
  organizationId: string
): Promise<PayoutSummary[]> {
  const result = await dbQuery(
    `SELECT op.*, ae.name as event_name, o.name as organization_name
     FROM organization_payouts op
     JOIN auction_events ae ON op.event_id = ae.id
     JOIN organizations o ON op.organization_id = o.id
     WHERE op.organization_id = @organizationId
     ORDER BY op.created_at DESC`,
    { organizationId }
  )

  return result.recordset.map((p: any) => ({
    id: p.id,
    eventId: p.event_id,
    eventName: p.event_name,
    organizationId: p.organization_id,
    organizationName: p.organization_name,
    grossAmount: p.gross_amount,
    stripeFees: p.stripe_fees,
    platformFee: p.platform_fee,
    reserveAmount: p.reserve_amount,
    netPayout: p.net_payout,
    status: p.status as PayoutStatus,
    eligibleAt: new Date(p.eligible_at),
    flags: JSON.parse(p.flags || '[]'),
    requiresReview: p.requires_review,
  }))
}

/**
 * Approve a held payout (admin only)
 */
export async function approvePayout(
  payoutId: string,
  reviewedBy: string,
  notes?: string
): Promise<void> {
  await dbQuery(
    `UPDATE organization_payouts
     SET status = 'pending',
         requires_review = 0,
         reviewed_by = @reviewedBy,
         reviewed_at = GETUTCDATE(),
         review_notes = @notes
     WHERE id = @payoutId AND status = 'held'`,
    { payoutId, reviewedBy, notes: notes || null }
  )
}

/**
 * Reject a payout (admin only)
 */
export async function rejectPayout(
  payoutId: string,
  reviewedBy: string,
  reason: string
): Promise<void> {
  await dbQuery(
    `UPDATE organization_payouts
     SET status = 'failed',
         requires_review = 0,
         reviewed_by = @reviewedBy,
         reviewed_at = GETUTCDATE(),
         review_notes = @reason
     WHERE id = @payoutId`,
    { payoutId, reviewedBy, reason }
  )

  // Update event status
  const payout = await dbQuery(
    `SELECT event_id FROM organization_payouts WHERE id = @payoutId`,
    { payoutId }
  )

  if (payout.recordset.length > 0) {
    await dbQuery(
      `UPDATE auction_events
       SET payout_status = 'failed',
           payout_held_reason = @reason
       WHERE id = @eventId`,
      { eventId: payout.recordset[0].event_id, reason }
    )
  }
}

/**
 * Get payouts requiring review (admin)
 */
export async function getPayoutsRequiringReview(): Promise<PayoutSummary[]> {
  const result = await dbQuery(
    `SELECT op.*, ae.name as event_name, o.name as organization_name
     FROM organization_payouts op
     JOIN auction_events ae ON op.event_id = ae.id
     JOIN organizations o ON op.organization_id = o.id
     WHERE op.requires_review = 1 AND op.status = 'held'
     ORDER BY op.created_at ASC`,
    {}
  )

  return result.recordset.map((p: any) => ({
    id: p.id,
    eventId: p.event_id,
    eventName: p.event_name,
    organizationId: p.organization_id,
    organizationName: p.organization_name,
    grossAmount: p.gross_amount,
    stripeFees: p.stripe_fees,
    platformFee: p.platform_fee,
    reserveAmount: p.reserve_amount,
    netPayout: p.net_payout,
    status: p.status as PayoutStatus,
    eligibleAt: new Date(p.eligible_at),
    flags: JSON.parse(p.flags || '[]'),
    requiresReview: p.requires_review,
  }))
}

/**
 * Record a chargeback
 */
export async function recordChargeback(
  stripeDisputeId: string,
  stripePaymentIntentId: string,
  organizationId: string,
  eventId: string | null,
  amount: number,
  reason: string
): Promise<string> {
  const chargebackId = uuidv4()

  // Find the associated payout if event is provided
  let payoutId: string | null = null
  if (eventId) {
    const payoutResult = await dbQuery(
      `SELECT id FROM organization_payouts WHERE event_id = @eventId`,
      { eventId }
    )
    if (payoutResult.recordset.length > 0) {
      payoutId = payoutResult.recordset[0].id
    }
  }

  await dbQuery(
    `INSERT INTO chargebacks (
      id, organization_id, event_id, payout_id, stripe_dispute_id,
      stripe_payment_intent_id, amount, reason, status, created_at
    ) VALUES (
      @id, @organizationId, @eventId, @payoutId, @stripeDisputeId,
      @stripePaymentIntentId, @amount, @reason, 'open', GETUTCDATE()
    )`,
    {
      id: chargebackId,
      organizationId,
      eventId,
      payoutId,
      stripeDisputeId,
      stripePaymentIntentId,
      amount,
      reason,
    }
  )

  // Update organization trust
  await updateTrustLevel(organizationId)

  return chargebackId
}

/**
 * Update chargeback status
 */
export async function updateChargebackStatus(
  stripeDisputeId: string,
  status: 'won' | 'lost' | 'closed'
): Promise<void> {
  await dbQuery(
    `UPDATE chargebacks
     SET status = @status,
         resolved_at = GETUTCDATE()
     WHERE stripe_dispute_id = @stripeDisputeId`,
    { stripeDisputeId, status }
  )

  // Get the chargeback details to update trust
  const chargebackResult = await dbQuery(
    `SELECT organization_id, amount, payout_id FROM chargebacks WHERE stripe_dispute_id = @stripeDisputeId`,
    { stripeDisputeId }
  )

  if (chargebackResult.recordset.length > 0) {
    const chargeback = chargebackResult.recordset[0]

    // If lost, try to deduct from reserve
    if (status === 'lost' && chargeback.payout_id) {
      const reserveResult = await dbQuery(
        `SELECT id, amount FROM payout_reserves
         WHERE payout_id = @payoutId AND status = 'held'`,
        { payoutId: chargeback.payout_id }
      )

      if (reserveResult.recordset.length > 0) {
        await dbQuery(
          `UPDATE chargebacks SET deducted_from_reserve = 1 WHERE stripe_dispute_id = @stripeDisputeId`,
          { stripeDisputeId }
        )
      }
    }

    await updateTrustLevel(chargeback.organization_id)
  }
}
