import { Router, Request, Response, NextFunction } from 'express'
import { param, validationResult } from 'express-validator'
import { authenticate } from '../middleware/auth.js'
import { query as dbQuery } from '../config/database.js'
import { badRequest, notFound } from '../middleware/errorHandler.js'

const router = Router()

// Helper to ensure user exists
async function ensureUserExists(userId: string, email: string, name: string) {
  const existing = await dbQuery(
    'SELECT id FROM users WHERE id = @userId',
    { userId }
  )

  if (existing.recordset.length === 0) {
    await dbQuery(
      `INSERT INTO users (id, email, display_name, created_at, updated_at)
       VALUES (@userId, @email, @name, GETUTCDATE(), GETUTCDATE())`,
      { userId, email, name: name || email }
    )
  }
}

// Get invitation details by token (public - just need the token)
router.get(
  '/:token',
  param('token').isString().isLength({ min: 32 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = req.params

      const result = await dbQuery(
        `SELECT i.*, o.name as org_name, o.slug as org_slug, o.logo_url as org_logo,
                u.display_name as inviter_name
         FROM organization_invitations i
         INNER JOIN organizations o ON i.organization_id = o.id
         LEFT JOIN users u ON i.invited_by = u.id
         WHERE i.token = @token`,
        { token }
      )

      if (result.recordset.length === 0) {
        throw notFound('Invitation not found')
      }

      const invitation = result.recordset[0]

      // Check if expired
      const isExpired = new Date(invitation.expires_at) < new Date()

      res.json({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: isExpired && invitation.status === 'pending' ? 'expired' : invitation.status,
        organization: {
          name: invitation.org_name,
          slug: invitation.org_slug,
          logoUrl: invitation.org_logo,
        },
        inviterName: invitation.inviter_name,
        expiresAt: invitation.expires_at,
        createdAt: invitation.created_at,
      })
    } catch (error) {
      next(error)
    }
  }
)

// Accept invitation
router.post(
  '/:token/accept',
  authenticate,
  param('token').isString().isLength({ min: 32 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const { token } = req.params
      const userId = req.user!.id
      const userEmail = req.user!.email

      // Ensure user exists in database
      await ensureUserExists(userId, userEmail, req.user!.name || userEmail)

      // Get invitation
      const inviteResult = await dbQuery(
        `SELECT i.*, o.name as org_name
         FROM organization_invitations i
         INNER JOIN organizations o ON i.organization_id = o.id
         WHERE i.token = @token AND i.status = 'pending'`,
        { token }
      )

      if (inviteResult.recordset.length === 0) {
        throw notFound('Invitation not found or already processed')
      }

      const invitation = inviteResult.recordset[0]

      // Check if expired
      if (new Date(invitation.expires_at) < new Date()) {
        // Mark as expired
        await dbQuery(
          `UPDATE organization_invitations SET status = 'expired' WHERE id = @id`,
          { id: invitation.id }
        )
        throw badRequest('Invitation has expired')
      }

      // Note: We no longer require email to match - having the secret token is
      // proof they received the invitation. This allows users to sign in with
      // a different provider (e.g., Google) than the email the invite was sent to.

      // Check if user is already a member
      const existingMember = await dbQuery(
        `SELECT id FROM organization_members
         WHERE organization_id = @orgId AND user_id = @userId`,
        { orgId: invitation.organization_id, userId }
      )

      if (existingMember.recordset.length > 0) {
        // Mark invitation as accepted and return
        await dbQuery(
          `UPDATE organization_invitations SET status = 'accepted' WHERE id = @id`,
          { id: invitation.id }
        )
        throw badRequest('You are already a member of this organization')
      }

      // Add as member
      await dbQuery(
        `INSERT INTO organization_members (
          organization_id, user_id, role, can_create_auctions, can_manage_members,
          can_view_financials, invited_by, joined_at
        ) VALUES (
          @orgId, @userId, @role,
          CASE WHEN @role = 'admin' THEN 1 ELSE 0 END,
          CASE WHEN @role = 'admin' THEN 1 ELSE 0 END,
          CASE WHEN @role = 'admin' THEN 1 ELSE 0 END,
          @invitedBy, GETUTCDATE()
        )`,
        {
          orgId: invitation.organization_id,
          userId,
          role: invitation.role,
          invitedBy: invitation.invited_by,
        }
      )

      // Mark invitation as accepted
      await dbQuery(
        `UPDATE organization_invitations SET status = 'accepted' WHERE id = @id`,
        { id: invitation.id }
      )

      res.json({
        message: 'Invitation accepted',
        organization: {
          id: invitation.organization_id,
          name: invitation.org_name,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

// Decline invitation
router.post(
  '/:token/decline',
  authenticate,
  param('token').isString().isLength({ min: 32 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = req.params

      // Get invitation
      const inviteResult = await dbQuery(
        `SELECT * FROM organization_invitations WHERE token = @token AND status = 'pending'`,
        { token }
      )

      if (inviteResult.recordset.length === 0) {
        throw notFound('Invitation not found or already processed')
      }

      const invitation = inviteResult.recordset[0]

      // Note: We no longer require email to match - having the secret token is
      // proof they received the invitation.

      // Mark as declined
      await dbQuery(
        `UPDATE organization_invitations SET status = 'declined' WHERE id = @id`,
        { id: invitation.id }
      )

      res.json({ message: 'Invitation declined' })
    } catch (error) {
      next(error)
    }
  }
)

// Get pending invitations for current user
router.get(
  '/my/pending',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userEmail = req.user!.email

      const result = await dbQuery(
        `SELECT i.*, o.name as org_name, o.slug as org_slug, o.logo_url as org_logo,
                u.display_name as inviter_name
         FROM organization_invitations i
         INNER JOIN organizations o ON i.organization_id = o.id
         LEFT JOIN users u ON i.invited_by = u.id
         WHERE i.email = @email AND i.status = 'pending' AND i.expires_at > GETUTCDATE()
         ORDER BY i.created_at DESC`,
        { email: userEmail }
      )

      const invitations = result.recordset.map((i: any) => ({
        id: i.id,
        token: i.token,
        role: i.role,
        organization: {
          name: i.org_name,
          slug: i.org_slug,
          logoUrl: i.org_logo,
        },
        inviterName: i.inviter_name,
        expiresAt: i.expires_at,
        createdAt: i.created_at,
      }))

      res.json(invitations)
    } catch (error) {
      next(error)
    }
  }
)

export { router as invitationRoutes }
