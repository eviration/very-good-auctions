import { Router, Request, Response, NextFunction } from 'express'
import { body, param, validationResult } from 'express-validator'
import { authenticate } from '../middleware/auth.js'
import { query as dbQuery } from '../config/database.js'
import { badRequest, notFound, forbidden } from '../middleware/errorHandler.js'

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

export { router as adminRoutes, requirePlatformAdmin }
