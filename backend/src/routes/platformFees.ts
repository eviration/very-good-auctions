import { Router, Request, Response, NextFunction } from 'express'
import { body, param, validationResult } from 'express-validator'
import { authenticate } from '../middleware/auth.js'
import { query as dbQuery } from '../config/database.js'
import { badRequest, notFound, forbidden } from '../middleware/errorHandler.js'
import {
  getPricingInfo,
  getEventFeeSummary,
  createWinnerPaymentIntent,
  processEventCompletion,
  calculatePlatformFee,
} from '../services/platformFees.js'

const router = Router()

/**
 * GET /api/platform-fees/pricing
 * Get pricing information (public)
 */
router.get('/pricing', (_req: Request, res: Response) => {
  res.json(getPricingInfo())
})

/**
 * GET /api/platform-fees/calculate
 * Calculate platform fee for an amount
 */
router.get('/calculate', (req: Request, res: Response) => {
  const amount = parseFloat(req.query.amount as string)

  if (isNaN(amount) || amount <= 0) {
    res.status(400).json({ error: 'Invalid amount' })
    return
  }

  const fee = calculatePlatformFee(amount)

  res.json({
    amount,
    platformFee: fee,
    total: amount + fee,
  })
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

      const result = await dbQuery(
        `SELECT
          ei.id,
          ei.title,
          ei.current_bid as winning_amount,
          ei.status,
          ae.name as event_name,
          ae.slug as event_slug,
          ae.end_time as event_ended_at,
          (SELECT TOP 1 blobUrl FROM event_item_images WHERE item_id = ei.id ORDER BY display_order) as image_url
         FROM event_items ei
         INNER JOIN auction_events ae ON ei.event_id = ae.id
         WHERE ei.winner_id = @userId
           AND ei.status IN ('won', 'sold')
         ORDER BY ae.end_time DESC`,
        { userId }
      )

      const wins = result.recordset.map((row: any) => ({
        id: row.id,
        title: row.title,
        winningAmount: row.winning_amount,
        platformFee: calculatePlatformFee(row.winning_amount),
        total: row.winning_amount + calculatePlatformFee(row.winning_amount),
        status: row.status,
        eventName: row.event_name,
        eventSlug: row.event_slug,
        eventEndedAt: row.event_ended_at,
        imageUrl: row.image_url,
        paymentPending: row.status === 'won',
      }))

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
