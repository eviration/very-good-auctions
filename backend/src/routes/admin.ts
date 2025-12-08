import { Router, Request, Response, NextFunction } from 'express'
import { body, param, validationResult } from 'express-validator'
import { authenticate } from '../middleware/auth.js'
import { query as dbQuery } from '../config/database.js'
import { badRequest, notFound, forbidden } from '../middleware/errorHandler.js'
import {
  getPendingTaxInfoSubmissions,
  verifyTaxInfo,
  TaxInformation,
} from '../services/taxForms.js'
import { logComplianceEvent } from '../services/complianceAudit.js'
import {
  getAllFeatureFlags,
  updateFeatureFlag,
  getFeatureFlagAuditLog,
  getFeatureFlagsObject,
  FeatureFlagKey,
} from '../services/featureFlags.js'

const router = Router()

// Middleware to check if user is a platform admin (from database)
async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await dbQuery(
      'SELECT is_platform_admin FROM users WHERE id = @userId',
      { userId: req.user!.id }
    )

    if (result.recordset.length === 0 || !result.recordset[0].is_platform_admin) {
      throw forbidden('Platform admin access required')
    }

    next()
  } catch (error) {
    next(error)
  }
}

// Check if current user is a platform admin
router.get(
  '/me',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await dbQuery(
        'SELECT is_platform_admin FROM users WHERE id = @userId',
        { userId: req.user!.id }
      )

      const isAdmin = result.recordset.length > 0 && result.recordset[0].is_platform_admin

      res.json({ isPlatformAdmin: isAdmin })
    } catch (error) {
      next(error)
    }
  }
)

// Get all platform admins
router.get(
  '/users',
  authenticate,
  requirePlatformAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await dbQuery(
        `SELECT id, email, display_name, is_platform_admin, created_at
        FROM users
        WHERE is_platform_admin = 1
        ORDER BY created_at ASC`
      )

      res.json({
        admins: result.recordset.map(row => ({
          id: row.id,
          email: row.email,
          displayName: row.display_name,
          isPlatformAdmin: row.is_platform_admin,
          createdAt: row.created_at,
        }))
      })
    } catch (error) {
      next(error)
    }
  }
)

// Search users (for adding new admins)
router.get(
  '/users/search',
  authenticate,
  requirePlatformAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { q } = req.query

      if (!q || typeof q !== 'string' || q.length < 2) {
        return res.json({ users: [] })
      }

      const searchTerm = `%${q}%`
      const result = await dbQuery(
        `SELECT TOP 10 id, email, display_name, is_platform_admin
        FROM users
        WHERE email LIKE @searchTerm OR display_name LIKE @searchTerm
        ORDER BY email`,
        { searchTerm }
      )

      res.json({
        users: result.recordset.map(row => ({
          id: row.id,
          email: row.email,
          displayName: row.display_name,
          isPlatformAdmin: row.is_platform_admin,
        }))
      })
    } catch (error) {
      next(error)
    }
  }
)

// Grant admin access
router.post(
  '/users/:userId/grant',
  authenticate,
  requirePlatformAdmin,
  [
    param('userId').notEmpty().withMessage('User ID is required'),
    body('reason').optional().isString().isLength({ max: 500 }),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array()[0].msg))
    }

    try {
      const { userId } = req.params
      const { reason } = req.body

      // Get target user
      const userResult = await dbQuery(
        'SELECT id, email, display_name, is_platform_admin FROM users WHERE id = @userId',
        { userId }
      )

      if (userResult.recordset.length === 0) {
        throw notFound('User not found')
      }

      const targetUser = userResult.recordset[0]

      if (targetUser.is_platform_admin) {
        throw badRequest('User is already a platform admin')
      }

      // Grant admin access
      await dbQuery(
        'UPDATE users SET is_platform_admin = 1 WHERE id = @userId',
        { userId }
      )

      // Log the action
      await dbQuery(
        `INSERT INTO admin_audit_log (action, target_user_id, target_email, performed_by_user_id, performed_by_email, reason)
        VALUES ('grant_admin', @targetUserId, @targetEmail, @performedByUserId, @performedByEmail, @reason)`,
        {
          targetUserId: userId,
          targetEmail: targetUser.email,
          performedByUserId: req.user!.id,
          performedByEmail: req.user!.email,
          reason: reason || null,
        }
      )

      res.json({
        success: true,
        message: `Admin access granted to ${targetUser.email}`,
        user: {
          id: targetUser.id,
          email: targetUser.email,
          displayName: targetUser.display_name,
          isPlatformAdmin: true,
        }
      })
    } catch (error) {
      next(error)
    }
  }
)

// Revoke admin access
router.post(
  '/users/:userId/revoke',
  authenticate,
  requirePlatformAdmin,
  [
    param('userId').notEmpty().withMessage('User ID is required'),
    body('reason').optional().isString().isLength({ max: 500 }),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array()[0].msg))
    }

    try {
      const { userId } = req.params
      const { reason } = req.body

      // Prevent self-revocation
      if (userId === req.user!.id) {
        throw badRequest('You cannot revoke your own admin access')
      }

      // Get target user
      const userResult = await dbQuery(
        'SELECT id, email, display_name, is_platform_admin FROM users WHERE id = @userId',
        { userId }
      )

      if (userResult.recordset.length === 0) {
        throw notFound('User not found')
      }

      const targetUser = userResult.recordset[0]

      if (!targetUser.is_platform_admin) {
        throw badRequest('User is not a platform admin')
      }

      // Count remaining admins
      const countResult = await dbQuery(
        'SELECT COUNT(*) as admin_count FROM users WHERE is_platform_admin = 1'
      )

      if (countResult.recordset[0].admin_count <= 1) {
        throw badRequest('Cannot revoke the last platform admin')
      }

      // Revoke admin access
      await dbQuery(
        'UPDATE users SET is_platform_admin = 0 WHERE id = @userId',
        { userId }
      )

      // Log the action
      await dbQuery(
        `INSERT INTO admin_audit_log (action, target_user_id, target_email, performed_by_user_id, performed_by_email, reason)
        VALUES ('revoke_admin', @targetUserId, @targetEmail, @performedByUserId, @performedByEmail, @reason)`,
        {
          targetUserId: userId,
          targetEmail: targetUser.email,
          performedByUserId: req.user!.id,
          performedByEmail: req.user!.email,
          reason: reason || null,
        }
      )

      res.json({
        success: true,
        message: `Admin access revoked from ${targetUser.email}`,
      })
    } catch (error) {
      next(error)
    }
  }
)

// Get admin audit log
router.get(
  '/audit-log',
  authenticate,
  requirePlatformAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)
      const offset = parseInt(req.query.offset as string) || 0

      const result = await dbQuery(
        `SELECT id, action, target_user_id, target_email, performed_by_user_id, performed_by_email, reason, created_at
        FROM admin_audit_log
        ORDER BY created_at DESC
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY`,
        { offset, limit }
      )

      const countResult = await dbQuery(
        'SELECT COUNT(*) as total FROM admin_audit_log'
      )

      res.json({
        entries: result.recordset.map(row => ({
          id: row.id,
          action: row.action,
          targetUserId: row.target_user_id,
          targetEmail: row.target_email,
          performedByUserId: row.performed_by_user_id,
          performedByEmail: row.performed_by_email,
          reason: row.reason,
          createdAt: row.created_at,
        })),
        pagination: {
          limit,
          offset,
          total: countResult.recordset[0].total,
        }
      })
    } catch (error) {
      next(error)
    }
  }
)

// =============================================================================
// Tax / W-9 Admin Routes
// =============================================================================

// Get pending W-9 submissions
router.get(
  '/tax/pending',
  authenticate,
  requirePlatformAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)
      const offset = parseInt(req.query.offset as string) || 0

      const result = await getPendingTaxInfoSubmissions({ limit, offset })

      res.json({
        submissions: result.submissions.map((s: TaxInformation) => ({
          id: s.id,
          userId: s.userId,
          organizationId: s.organizationId,
          taxFormType: s.taxFormType,
          legalName: s.legalName,
          businessName: s.businessName,
          taxClassification: s.taxClassification,
          tinType: s.tinType,
          tinLastFour: s.tinLastFour,
          address: s.address,
          status: s.status,
          signatureName: s.signatureName,
          signatureDate: s.signatureDate,
          createdAt: s.createdAt,
        })),
        pagination: {
          limit,
          offset,
          total: result.total,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

// Get all W-9 submissions (with filters)
router.get(
  '/tax/all',
  authenticate,
  requirePlatformAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)
      const offset = parseInt(req.query.offset as string) || 0
      const status = req.query.status as string | undefined
      const search = req.query.search as string | undefined

      let whereClause = '1=1'
      const params: Record<string, unknown> = { limit, offset }

      if (status && ['pending', 'verified', 'invalid', 'expired'].includes(status)) {
        whereClause += ' AND status = @status'
        params.status = status
      }

      if (search) {
        whereClause += ' AND (legal_name LIKE @search OR business_name LIKE @search OR tin_last_four LIKE @searchExact)'
        params.search = `%${search}%`
        params.searchExact = search
      }

      const countResult = await dbQuery(
        `SELECT COUNT(*) as total FROM tax_information WHERE ${whereClause}`,
        params
      )

      const result = await dbQuery(
        `SELECT id, user_id, organization_id, tax_form_type, legal_name, business_name,
                tax_classification, tin_type, tin_last_four,
                address_line1, address_line2, city, state, postal_code, country,
                is_us_person, is_exempt_payee, exempt_payee_code,
                signature_name, signature_date, status, verified_at, verified_by,
                created_at, expires_at
         FROM tax_information
         WHERE ${whereClause}
         ORDER BY created_at DESC
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
        params
      )

      res.json({
        submissions: result.recordset.map((row: Record<string, unknown>) => ({
          id: row.id,
          userId: row.user_id,
          organizationId: row.organization_id,
          taxFormType: row.tax_form_type,
          legalName: row.legal_name,
          businessName: row.business_name,
          taxClassification: row.tax_classification,
          tinType: row.tin_type,
          tinLastFour: row.tin_last_four,
          address: {
            line1: row.address_line1,
            line2: row.address_line2,
            city: row.city,
            state: row.state,
            postalCode: row.postal_code,
            country: row.country || 'USA',
          },
          status: row.status,
          signatureName: row.signature_name,
          signatureDate: row.signature_date,
          verifiedAt: row.verified_at,
          verifiedBy: row.verified_by,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
        })),
        pagination: {
          limit,
          offset,
          total: countResult.recordset[0].total,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

// Get W-9 stats
router.get(
  '/tax/stats',
  authenticate,
  requirePlatformAdmin,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await dbQuery(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified,
          SUM(CASE WHEN status = 'invalid' THEN 1 ELSE 0 END) as invalid,
          SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired
        FROM tax_information
      `)

      const stats = result.recordset[0]
      res.json({
        total: stats.total || 0,
        pending: stats.pending || 0,
        verified: stats.verified || 0,
        invalid: stats.invalid || 0,
        expired: stats.expired || 0,
      })
    } catch (error) {
      next(error)
    }
  }
)

// Verify/reject a W-9 submission
router.post(
  '/tax/:taxInfoId/verify',
  authenticate,
  requirePlatformAdmin,
  [
    param('taxInfoId').notEmpty().withMessage('Tax info ID is required'),
    body('status').isIn(['verified', 'invalid']).withMessage('Status must be verified or invalid'),
    body('notes').optional().isString().isLength({ max: 1000 }),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array()[0].msg))
    }

    try {
      const { taxInfoId } = req.params
      const { status, notes } = req.body

      await verifyTaxInfo(taxInfoId, req.user!.id, status, notes)

      // Log admin action
      await logComplianceEvent({
        eventType: status === 'verified' ? 'tax_info_verified' : 'tax_info_rejected',
        userId: req.user!.id,
        details: { taxInfoId, status, notes, verifiedByAdmin: true },
      })

      res.json({
        success: true,
        message: `W-9 ${status === 'verified' ? 'verified' : 'rejected'} successfully`,
      })
    } catch (error) {
      next(error)
    }
  }
)

// =============================================================================
// Feature Flags Admin Routes
// =============================================================================

// Get all feature flags (admin only)
router.get(
  '/feature-flags',
  authenticate,
  requirePlatformAdmin,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const flags = await getAllFeatureFlags()
      res.json({ flags })
    } catch (error) {
      next(error)
    }
  }
)

// Update a feature flag (admin only)
router.put(
  '/feature-flags/:flagKey',
  authenticate,
  requirePlatformAdmin,
  [
    param('flagKey').isIn([
      'integrated_payments_enabled',
      'self_managed_payments_enabled',
      'free_mode_enabled',
      'silent_auctions_enabled',
      'standard_auctions_enabled',
    ]).withMessage('Invalid feature flag key'),
    body('value').isBoolean().withMessage('Value must be a boolean'),
    body('reason').optional().isString().isLength({ max: 500 }),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array()[0].msg))
    }

    try {
      const { flagKey } = req.params
      const { value, reason } = req.body

      const flag = await updateFeatureFlag(
        flagKey as FeatureFlagKey,
        value,
        req.user!.id,
        req.user!.email,
        reason
      )

      res.json({
        success: true,
        flag,
        message: `Feature flag "${flagKey}" ${value ? 'enabled' : 'disabled'}`,
      })
    } catch (error) {
      next(error)
    }
  }
)

// Get feature flag audit log (admin only)
router.get(
  '/feature-flags/audit-log',
  authenticate,
  requirePlatformAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const flagKey = req.query.flagKey as FeatureFlagKey | undefined
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)

      const entries = await getFeatureFlagAuditLog(flagKey, limit)
      res.json({ entries })
    } catch (error) {
      next(error)
    }
  }
)

// =============================================================================
// Public Feature Flags Route (for frontend to know what's enabled)
// =============================================================================

// Get feature flags for UI (public, no admin required)
// This allows the frontend to know which features are available
router.get(
  '/feature-flags/public',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const flags = await getFeatureFlagsObject()
      res.json({ flags })
    } catch (error) {
      next(error)
    }
  }
)

export { router as adminRoutes, requirePlatformAdmin }
