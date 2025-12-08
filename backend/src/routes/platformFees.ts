import { Router, Request, Response, NextFunction } from 'express'
import { param, validationResult } from 'express-validator'
import { authenticate } from '../middleware/auth.js'
import { query as dbQuery } from '../config/database.js'
import { badRequest, notFound, forbidden } from '../middleware/errorHandler.js'
import {
  getPricingInfo,
  getEventFeeSummary,
  createWinnerPaymentIntent,
  processEventCompletion,
  calculatePlatformFee,
  calculatePlatformFeeSync,
} from '../services/platformFees.js'
import { isFreeModeEnabled } from '../services/featureFlags.js'

const router = Router()

/**
 * GET /api/platform-fees/pricing
 * Get pricing information (public)
 */
router.get('/pricing', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const pricing = await getPricingInfo()
    res.json(pricing)
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/platform-fees/calculate
 * Calculate platform fee for an amount
 */
router.get('/calculate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const amount = parseFloat(req.query.amount as string)

    if (isNaN(amount) || amount <= 0) {
      res.status(400).json({ error: 'Invalid amount' })
      return
    }

    const fee = await calculatePlatformFee(amount)

    res.json({
      amount,
      platformFee: fee,
      total: amount + fee,
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/platform-fees/event/:eventId/summary
 * Get fee summary for an event (admin only)
 */
router.get(
  '/event/:eventId/summary',
  authenticate,
  [param('eventId').isUUID()],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const { eventId } = req.params
      const userId = req.user!.id

      // Verify event access (admin only)
      const eventResult = await dbQuery(
        `SELECT ae.*, om.role as member_role
         FROM auction_events ae
         LEFT JOIN organization_members om ON ae.organization_id = om.organization_id AND om.user_id = @userId
         WHERE ae.id = @eventId`,
        { eventId, userId }
      )

      if (eventResult.recordset.length === 0) {
        throw notFound('Event not found')
      }

      const event = eventResult.recordset[0]
      const isOwner = event.owner_id === userId
      const isOrgAdmin = event.organization_id && ['owner', 'admin'].includes(event.member_role)

      if (!isOwner && !isOrgAdmin) {
        throw forbidden('You do not have permission to view this summary')
      }

      const summary = await getEventFeeSummary(eventId)

      res.json(summary)
    } catch (error) {
      next(error)
    }
  }
)

/**
 * POST /api/platform-fees/event/:eventId/complete
 * Process event completion (end auction and calculate winners)
 * This is typically called by a scheduled job, but can be triggered manually by admin
 */
router.post(
  '/event/:eventId/complete',
  authenticate,
  [param('eventId').isUUID()],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const { eventId } = req.params
      const userId = req.user!.id

      // Verify event access (admin only)
      const eventResult = await dbQuery(
        `SELECT ae.*, om.role as member_role
         FROM auction_events ae
         LEFT JOIN organization_members om ON ae.organization_id = om.organization_id AND om.user_id = @userId
         WHERE ae.id = @eventId`,
        { eventId, userId }
      )

      if (eventResult.recordset.length === 0) {
        throw notFound('Event not found')
      }

      const event = eventResult.recordset[0]
      const isOwner = event.owner_id === userId
      const isOrgAdmin = event.organization_id && ['owner', 'admin'].includes(event.member_role)

      if (!isOwner && !isOrgAdmin) {
        throw forbidden('You do not have permission to complete this event')
      }

      // Check if event can be completed
      if (event.status === 'ended') {
        throw badRequest('Event has already ended')
      }

      if (event.status !== 'active') {
        throw badRequest('Event must be active to complete')
      }

      const result = await processEventCompletion(eventId)

      res.json({
        success: true,
        message: 'Event completed successfully',
        ...result,
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * POST /api/platform-fees/items/:itemId/pay
 * Create payment intent for a won item
 */
router.post(
  '/items/:itemId/pay',
  authenticate,
  [param('itemId').isUUID()],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const { itemId } = req.params
      const userId = req.user!.id

      const result = await createWinnerPaymentIntent(itemId, userId)

      res.json({
        clientSecret: result.clientSecret,
        paymentIntentId: result.paymentIntentId,
        breakdown: {
          winningBid: result.amount,
          platformFee: result.platformFee,
          total: result.itemTotal,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * GET /api/platform-fees/my-wins
 * Get user's winning items that need payment
 */
router.get(
  '/my-wins',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id

      // Check free mode status once for all items
      const freeMode = await isFreeModeEnabled()

      const result = await dbQuery(
        `SELECT
          ei.id,
          ei.title,
          ei.current_bid as winning_amount,
          ei.status,
          ei.payment_status,
          ei.fulfillment_status,
          ei.fulfillment_type,
          ei.tracking_number,
          ei.tracking_carrier,
          ei.tracking_url,
          ei.pickup_ready_at,
          ae.name as event_name,
          ae.slug as event_slug,
          ae.end_time as event_ended_at,
          ae.payment_mode,
          ae.payment_instructions,
          ae.payment_link,
          ae.payment_qr_code_url,
          ae.fulfillment_type as event_fulfillment_type,
          ae.pickup_instructions,
          ae.pickup_location,
          ae.pickup_address_line1,
          ae.pickup_city,
          ae.pickup_state,
          ae.payment_due_days,
          o.name as organization_name,
          (SELECT TOP 1 blob_url FROM event_item_images WHERE item_id = ei.id ORDER BY display_order) as image_url
         FROM event_items ei
         INNER JOIN auction_events ae ON ei.event_id = ae.id
         LEFT JOIN organizations o ON ae.organization_id = o.id
         WHERE ei.winner_id = @userId
           AND ei.status IN ('won', 'sold')
         ORDER BY ae.end_time DESC`,
        { userId }
      )

      const wins = result.recordset.map((row: any) => {
        const isSelfManaged = row.payment_mode === 'self_managed'
        const noFees = isSelfManaged || freeMode
        const platformFee = noFees ? 0 : calculatePlatformFeeSync(row.winning_amount, freeMode)

        return {
          id: row.id,
          title: row.title,
          winningAmount: row.winning_amount,
          platformFee,
          total: row.winning_amount + platformFee,
          status: row.status,
          eventName: row.event_name,
          eventSlug: row.event_slug,
          eventEndedAt: row.event_ended_at,
          imageUrl: row.image_url,
          paymentPending: row.status === 'won',
          // Self-managed payment info
          paymentMode: row.payment_mode || 'integrated',
          paymentInstructions: row.payment_instructions,
          paymentLink: row.payment_link,
          paymentQrCodeUrl: row.payment_qr_code_url,
          paymentDueDays: row.payment_due_days,
          organizationName: row.organization_name,
          // Item-level payment/fulfillment tracking
          paymentStatus: row.payment_status || 'pending',
          fulfillmentStatus: row.fulfillment_status || 'pending',
          fulfillmentType: row.fulfillment_type || row.event_fulfillment_type,
          trackingNumber: row.tracking_number,
          trackingCarrier: row.tracking_carrier,
          trackingUrl: row.tracking_url,
          pickupReadyAt: row.pickup_ready_at,
          // Event-level pickup info (for self-managed)
          pickupInstructions: row.pickup_instructions,
          pickupLocation: row.pickup_location,
          pickupAddress: row.pickup_address_line1 ? {
            line1: row.pickup_address_line1,
            city: row.pickup_city,
            state: row.pickup_state,
          } : null,
          // Free mode indicator
          freeModeActive: freeMode,
        }
      })

      res.json(wins)
    } catch (error) {
      next(error)
    }
  }
)

/**
 * GET /api/platform-fees/history
 * Get user's platform fee payment history (as event organizer)
 */
router.get(
  '/history',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id

      const result = await dbQuery(
        `SELECT
          pf.*,
          ae.name as event_name,
          ae.slug as event_slug,
          o.name as organization_name
         FROM platform_fees pf
         INNER JOIN auction_events ae ON pf.event_id = ae.id
         LEFT JOIN organizations o ON pf.organization_id = o.id
         WHERE pf.user_id = @userId OR ae.owner_id = @userId
         ORDER BY pf.created_at DESC`,
        { userId }
      )

      const fees = result.recordset.map((row: any) => ({
        id: row.id,
        eventId: row.event_id,
        eventName: row.event_name,
        eventSlug: row.event_slug,
        organizationName: row.organization_name,
        feeType: row.fee_type,
        amount: row.amount,
        status: row.status,
        createdAt: row.created_at,
      }))

      res.json(fees)
    } catch (error) {
      next(error)
    }
  }
)

export { router as platformFeeRoutes }
