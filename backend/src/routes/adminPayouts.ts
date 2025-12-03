import { Router, Request, Response, NextFunction } from 'express'
import { body, param, query, validationResult } from 'express-validator'
import { authenticate } from '../middleware/auth.js'
import { query as dbQuery } from '../config/database.js'
import { badRequest, notFound, forbidden } from '../middleware/errorHandler.js'
import {
  getPayoutDetails,
  getPayoutsRequiringReview,
  approvePayout,
  rejectPayout,
  processEligiblePayouts,
  processReserveReleases,
} from '../services/payouts.js'

const router = Router()

// Admin check middleware - for now, checks if user is platform admin
// In production, you'd have a proper admin role system
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = req.user?.id

  if (!userId) {
    return next(forbidden('Authentication required'))
  }

  // Check if user is a platform admin
  const result = await dbQuery(
    `SELECT is_admin FROM users WHERE id = @userId`,
    { userId }
  )

  if (result.recordset.length === 0 || !result.recordset[0].is_admin) {
    return next(forbidden('Admin access required'))
  }

  next()
}

// List all payouts (with filters)
router.get(
  '/',
  authenticate,
  requireAdmin,
  [
    query('status').optional().isIn(['pending', 'eligible', 'processing', 'completed', 'held', 'failed']),
    query('page').optional().isInt({ min: 1 }),
    query('pageSize').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = req.query.status as string
      const page = parseInt(req.query.page as string) || 1
      const pageSize = parseInt(req.query.pageSize as string) || 20
      const offset = (page - 1) * pageSize

      let whereClause = ''
      const params: Record<string, any> = { offset, pageSize }

      if (status) {
        whereClause = 'WHERE op.status = @status'
        params.status = status
      }

      // Get total count
      const countResult = await dbQuery(
        `SELECT COUNT(*) as total FROM organization_payouts op ${whereClause}`,
        params
      )

      // Get paginated payouts
      const result = await dbQuery(
        `SELECT op.*, ae.name as event_name, o.name as organization_name
         FROM organization_payouts op
         JOIN auction_events ae ON op.event_id = ae.id
         JOIN organizations o ON op.organization_id = o.id
         ${whereClause}
         ORDER BY op.created_at DESC
         OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`,
        params
      )

      const payouts = result.recordset.map((p: any) => ({
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
        eligibleAt: p.eligible_at,
        flags: JSON.parse(p.flags || '[]'),
        requiresReview: p.requires_review,
        reviewedBy: p.reviewed_by,
        reviewedAt: p.reviewed_at,
        reviewNotes: p.review_notes,
        createdAt: p.created_at,
        completedAt: p.completed_at,
      }))

      res.json({
        data: payouts,
        pagination: {
          page,
          pageSize,
          totalItems: countResult.recordset[0].total,
          totalPages: Math.ceil(countResult.recordset[0].total / pageSize),
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

// Get payouts requiring review
router.get(
  '/review',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payouts = await getPayoutsRequiringReview()
      res.json(payouts)
    } catch (error) {
      next(error)
    }
  }
)

// Get single payout details
router.get(
  '/:id',
  authenticate,
  requireAdmin,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const payout = await getPayoutDetails(id)

      if (!payout) {
        throw notFound('Payout not found')
      }

      // Get additional details for admin view
      const detailsResult = await dbQuery(
        `SELECT op.*, ae.name as event_name, ae.total_raised, ae.end_time,
                o.name as organization_name, o.status as org_status, o.org_type,
                ot.trust_level, ot.successful_events, ot.chargeback_count
         FROM organization_payouts op
         JOIN auction_events ae ON op.event_id = ae.id
         JOIN organizations o ON op.organization_id = o.id
         LEFT JOIN organization_trust ot ON o.id = ot.organization_id
         WHERE op.id = @id`,
        { id }
      )

      if (detailsResult.recordset.length === 0) {
        throw notFound('Payout not found')
      }

      const p = detailsResult.recordset[0]

      res.json({
        ...payout,
        event: {
          id: p.event_id,
          name: p.event_name,
          totalRaised: p.total_raised,
          endTime: p.end_time,
        },
        organization: {
          id: p.organization_id,
          name: p.organization_name,
          status: p.org_status,
          type: p.org_type,
          trustLevel: p.trust_level,
          successfulEvents: p.successful_events,
          chargebackCount: p.chargeback_count,
        },
        reviewedBy: p.reviewed_by,
        reviewedAt: p.reviewed_at,
        reviewNotes: p.review_notes,
        stripeTransferId: p.stripe_transfer_id,
        processedAt: p.processed_at,
        completedAt: p.completed_at,
      })
    } catch (error) {
      next(error)
    }
  }
)

// Approve a held payout
router.post(
  '/:id/approve',
  authenticate,
  requireAdmin,
  [
    param('id').isUUID(),
    body('notes').optional().isString(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const { id } = req.params
      const { notes } = req.body
      const adminUserId = req.user!.id

      // Verify payout exists and is held
      const payout = await getPayoutDetails(id)
      if (!payout) {
        throw notFound('Payout not found')
      }

      if (payout.status !== 'held') {
        throw badRequest('Only held payouts can be approved')
      }

      await approvePayout(id, adminUserId, notes)

      res.json({ message: 'Payout approved and queued for processing' })
    } catch (error) {
      next(error)
    }
  }
)

// Reject a payout
router.post(
  '/:id/reject',
  authenticate,
  requireAdmin,
  [
    param('id').isUUID(),
    body('reason').isString().isLength({ min: 10, max: 500 }),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const { id } = req.params
      const { reason } = req.body
      const adminUserId = req.user!.id

      // Verify payout exists
      const payout = await getPayoutDetails(id)
      if (!payout) {
        throw notFound('Payout not found')
      }

      if (payout.status === 'completed') {
        throw badRequest('Cannot reject a completed payout')
      }

      await rejectPayout(id, adminUserId, reason)

      res.json({ message: 'Payout rejected' })
    } catch (error) {
      next(error)
    }
  }
)

// Manually trigger payout processing (for testing/emergency use)
router.post(
  '/process',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await processEligiblePayouts()

      res.json({
        message: 'Payout processing completed',
        processed: result.processed,
        held: result.held,
        errors: result.errors,
      })
    } catch (error) {
      next(error)
    }
  }
)

// Manually trigger reserve releases (for testing/emergency use)
router.post(
  '/release-reserves',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await processReserveReleases()

      res.json({
        message: 'Reserve release processing completed',
        released: result.released,
        forfeited: result.forfeited,
        errors: result.errors,
      })
    } catch (error) {
      next(error)
    }
  }
)

// List chargebacks
router.get(
  '/chargebacks',
  authenticate,
  requireAdmin,
  [
    query('status').optional().isIn(['open', 'won', 'lost', 'closed']),
    query('page').optional().isInt({ min: 1 }),
    query('pageSize').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = req.query.status as string
      const page = parseInt(req.query.page as string) || 1
      const pageSize = parseInt(req.query.pageSize as string) || 20
      const offset = (page - 1) * pageSize

      let whereClause = ''
      const params: Record<string, any> = { offset, pageSize }

      if (status) {
        whereClause = 'WHERE c.status = @status'
        params.status = status
      }

      // Get total count
      const countResult = await dbQuery(
        `SELECT COUNT(*) as total FROM chargebacks c ${whereClause}`,
        params
      )

      // Get paginated chargebacks
      const result = await dbQuery(
        `SELECT c.*, o.name as organization_name, ae.name as event_name
         FROM chargebacks c
         JOIN organizations o ON c.organization_id = o.id
         LEFT JOIN auction_events ae ON c.event_id = ae.id
         ${whereClause}
         ORDER BY c.created_at DESC
         OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`,
        params
      )

      const chargebacks = result.recordset.map((c: any) => ({
        id: c.id,
        organizationId: c.organization_id,
        organizationName: c.organization_name,
        eventId: c.event_id,
        eventName: c.event_name,
        amount: c.amount,
        reason: c.reason,
        status: c.status,
        stripeDisputeId: c.stripe_dispute_id,
        deductedFromReserve: c.deducted_from_reserve,
        createdAt: c.created_at,
        resolvedAt: c.resolved_at,
      }))

      res.json({
        data: chargebacks,
        pagination: {
          page,
          pageSize,
          totalItems: countResult.recordset[0].total,
          totalPages: Math.ceil(countResult.recordset[0].total / pageSize),
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

export { router as adminPayoutRoutes }
