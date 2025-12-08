import { Router, Request, Response, NextFunction } from 'express'
import { body, param, query as queryValidator, validationResult } from 'express-validator'
import crypto from 'crypto'
import { query as dbQuery } from '../../config/database.js'
import { authenticate, requirePlatformAdmin } from '../../middleware/auth.js'
import { badRequest } from '../../middleware/errorHandler.js'
import { sendUatInvitationEmail } from '../../services/email.js'

const router = Router()

/**
 * POST /api/uat/testers/invite
 *
 * Invite one or more testers to UAT.
 */
router.post(
  '/invite',
  authenticate,
  requirePlatformAdmin,
  [
    body('emails').notEmpty().withMessage('Emails are required'),
    body('role').optional().isIn(['tester', 'power_tester', 'admin']).withMessage('Invalid role'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array().map(e => e.msg).join(', ')))
    }

    try {
      const { emails, sessionId, role = 'tester', message } = req.body

      // Normalize emails to array
      const emailList = Array.isArray(emails)
        ? emails
        : emails.split(/[,;\n]/).map((e: string) => e.trim()).filter(Boolean)

      const results = []

      for (const email of emailList) {
        // Check if already invited
        const existing = await dbQuery(
          `SELECT id, status FROM uat_testers WHERE email = @email`,
          { email: email.toLowerCase() }
        )

        if (existing.recordset.length > 0) {
          results.push({
            email,
            status: 'already_invited',
            currentStatus: existing.recordset[0].status,
          })
          continue
        }

        // Generate invitation token
        const token = crypto.randomBytes(32).toString('hex')
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

        // Create tester record
        const result = await dbQuery(`
          INSERT INTO uat_testers (
            email, invitation_token, invitation_expires_at,
            role, uat_session_id, invitation_sent_at
          ) OUTPUT INSERTED.id VALUES (
            @email, @token, @expiresAt, @role, @sessionId, GETUTCDATE()
          )
        `, {
          email: email.toLowerCase(),
          token,
          expiresAt,
          role,
          sessionId: sessionId || null,
        })

        const testerId = result.recordset[0].id

        // Get session name if provided
        let sessionName = null
        if (sessionId) {
          const sessionResult = await dbQuery(
            `SELECT name FROM uat_sessions WHERE id = @sessionId`,
            { sessionId }
          )
          sessionName = sessionResult.recordset[0]?.name
        }

        // Send invitation email
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
        await sendUatInvitationEmail({
          to: email,
          inviteUrl: `${frontendUrl}/uat/invite/${token}`,
          expiresAt,
          customMessage: message,
          sessionName,
        })

        results.push({ email, status: 'invited', testerId })
      }

      return res.json({
        success: true,
        results,
        summary: {
          invited: results.filter(r => r.status === 'invited').length,
          alreadyInvited: results.filter(r => r.status === 'already_invited').length,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * POST /api/uat/testers/:testerId/resend
 *
 * Resend invitation email.
 */
router.post(
  '/:testerId/resend',
  authenticate,
  requirePlatformAdmin,
  [
    param('testerId').isUUID().withMessage('Invalid tester ID'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array().map(e => e.msg).join(', ')))
    }

    try {
      const { testerId } = req.params

      const result = await dbQuery(
        `SELECT * FROM uat_testers WHERE id = @id`,
        { id: testerId }
      )

      if (result.recordset.length === 0) {
        return res.status(404).json({ error: 'Tester not found' })
      }

      const tester = result.recordset[0]

      if (tester.status !== 'invited') {
        return res.status(400).json({ error: 'Tester has already registered' })
      }

      // Generate new token
      const token = crypto.randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

      await dbQuery(`
        UPDATE uat_testers SET
          invitation_token = @token,
          invitation_expires_at = @expiresAt,
          invitation_sent_at = GETUTCDATE()
        WHERE id = @id
      `, { id: testerId, token, expiresAt })

      // Send invitation email
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
      await sendUatInvitationEmail({
        to: tester.email,
        inviteUrl: `${frontendUrl}/uat/invite/${token}`,
        expiresAt,
      })

      return res.json({ success: true })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * GET /api/uat/testers
 *
 * List all testers.
 */
router.get(
  '/',
  authenticate,
  requirePlatformAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, sessionId } = req.query

      let query = `
        SELECT
          t.*,
          s.name as session_name,
          (SELECT COUNT(*) FROM uat_feedback WHERE tester_id = t.id) as feedback_count
        FROM uat_testers t
        LEFT JOIN uat_sessions s ON t.uat_session_id = s.id
        WHERE 1=1
      `

      const params: Record<string, unknown> = {}

      if (status) {
        query += ` AND t.status = @status`
        params.status = status
      }

      if (sessionId) {
        query += ` AND t.uat_session_id = @sessionId`
        params.sessionId = sessionId
      }

      query += ` ORDER BY t.created_at DESC`

      const result = await dbQuery(query, params)

      // Get counts by status
      const countsResult = await dbQuery(`
        SELECT status, COUNT(*) as count
        FROM uat_testers
        GROUP BY status
      `)

      const counts = countsResult.recordset.reduce((acc: Record<string, number>, row: { status: string; count: number }) => {
        acc[row.status] = row.count
        return acc
      }, {})

      return res.json({
        testers: result.recordset,
        counts: {
          invited: counts.invited || 0,
          registered: counts.registered || 0,
          active: counts.active || 0,
          inactive: counts.inactive || 0,
          total: result.recordset.length,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * DELETE /api/uat/testers/:testerId
 *
 * Remove a tester (soft delete - mark as inactive).
 */
router.delete(
  '/:testerId',
  authenticate,
  requirePlatformAdmin,
  [
    param('testerId').isUUID().withMessage('Invalid tester ID'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array().map(e => e.msg).join(', ')))
    }

    try {
      const { testerId } = req.params

      await dbQuery(`
        UPDATE uat_testers SET status = 'inactive' WHERE id = @id
      `, { id: testerId })

      return res.json({ success: true })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * PATCH /api/uat/testers/:testerId/role
 *
 * Update tester role.
 */
router.patch(
  '/:testerId/role',
  authenticate,
  requirePlatformAdmin,
  [
    param('testerId').isUUID().withMessage('Invalid tester ID'),
    body('role').isIn(['tester', 'power_tester', 'admin']).withMessage('Invalid role'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array().map(e => e.msg).join(', ')))
    }

    try {
      const { testerId } = req.params
      const { role } = req.body

      await dbQuery(`
        UPDATE uat_testers SET role = @role WHERE id = @id
      `, { id: testerId, role })

      return res.json({ success: true })
    } catch (error) {
      next(error)
    }
  }
)

export const uatTestersRoutes = router
