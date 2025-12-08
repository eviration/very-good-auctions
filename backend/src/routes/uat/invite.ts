import { Router, Request, Response, NextFunction } from 'express'
import { body, param, validationResult } from 'express-validator'
import { query as dbQuery } from '../../config/database.js'
import { badRequest } from '../../middleware/errorHandler.js'

const router = Router()

/**
 * GET /api/uat/invite/:token
 *
 * Validate invitation token and return info.
 */
router.get(
  '/:token',
  [
    param('token').isLength({ min: 32, max: 128 }).withMessage('Invalid token'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array().map(e => e.msg).join(', ')))
    }

    try {
      const { token } = req.params

      const result = await dbQuery(`
        SELECT
          t.*,
          s.name as session_name,
          s.description as session_description
        FROM uat_testers t
        LEFT JOIN uat_sessions s ON t.uat_session_id = s.id
        WHERE t.invitation_token = @token
      `, { token })

      if (result.recordset.length === 0) {
        return res.status(404).json({ error: 'Invalid invitation link' })
      }

      const tester = result.recordset[0]

      // Check expiration
      if (new Date(tester.invitation_expires_at) < new Date()) {
        return res.status(410).json({ error: 'This invitation has expired' })
      }

      // Check if already registered
      if (tester.status !== 'invited') {
        return res.status(400).json({
          error: 'This invitation has already been used',
          redirectTo: '/login',
        })
      }

      return res.json({
        email: tester.email,
        name: tester.name,
        session: tester.session_name ? {
          name: tester.session_name,
          description: tester.session_description,
        } : null,
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * POST /api/uat/invite/:token/accept
 *
 * Accept invitation and link account.
 * The user registers/logs in via their normal auth flow,
 * then calls this endpoint to link their account to the UAT tester record.
 */
router.post(
  '/:token/accept',
  [
    param('token').isLength({ min: 32, max: 128 }).withMessage('Invalid token'),
    body('userId').notEmpty().withMessage('User ID is required'),
    body('name').optional().isString(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array().map(e => e.msg).join(', ')))
    }

    try {
      const { token } = req.params
      const { userId, name } = req.body

      const result = await dbQuery(`
        SELECT * FROM uat_testers WHERE invitation_token = @token
      `, { token })

      if (result.recordset.length === 0) {
        return res.status(404).json({ error: 'Invalid invitation' })
      }

      const tester = result.recordset[0]

      if (new Date(tester.invitation_expires_at) < new Date()) {
        return res.status(410).json({ error: 'Invitation expired' })
      }

      if (tester.status !== 'invited') {
        return res.status(400).json({ error: 'Already registered' })
      }

      // Update tester record
      await dbQuery(`
        UPDATE uat_testers SET
          status = 'registered',
          registered_at = GETUTCDATE(),
          user_id = @userId,
          name = COALESCE(@name, name),
          invitation_token = NULL
        WHERE id = @testerId
      `, {
        testerId: tester.id,
        userId,
        name: name || null,
      })

      return res.json({
        success: true,
        testerId: tester.id,
        role: tester.role,
        redirectTo: '/uat/welcome',
      })
    } catch (error) {
      next(error)
    }
  }
)

export const uatInviteRoutes = router
