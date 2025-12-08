import { Router, Request, Response, NextFunction } from 'express'
import { body, param, validationResult } from 'express-validator'
import crypto from 'crypto'
import { query as dbQuery } from '../config/database.js'
import { authenticate, optionalAuth } from '../middleware/auth.js'
import { badRequest } from '../middleware/errorHandler.js'
import { sendEmail } from '../services/email.js'

const router = Router()

/**
 * Generate a random invite code
 */
function generateInviteCode(): string {
  return crypto.randomBytes(6).toString('hex').toUpperCase()
}

/**
 * Check if user has access to manage event invitations
 */
async function canManageEvent(userId: string, eventId: string): Promise<boolean> {
  const result = await dbQuery(`
    SELECT e.id FROM auction_events e
    LEFT JOIN organizations o ON e.organization_id = o.id
    LEFT JOIN organization_members om ON o.id = om.organization_id AND om.user_id = @userId
    WHERE e.id = @eventId
      AND (e.created_by = @userId OR om.role IN ('owner', 'admin'))
  `, { userId, eventId })
  return result.recordset.length > 0
}

/**
 * POST /api/events/:eventId/invitations
 *
 * Invite users to a private event
 */
router.post(
  '/:eventId/invitations',
  authenticate,
  [
    param('eventId').isUUID().withMessage('Invalid event ID'),
    body('emails').notEmpty().withMessage('Emails are required'),
    body('role').optional().isIn(['bidder', 'submitter', 'both']).withMessage('Invalid role'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array().map(e => e.msg).join(', ')))
    }

    try {
      const { eventId } = req.params
      const userId = (req as any).user?.id
      const { emails, role = 'bidder', message } = req.body

      // Check permissions
      if (!await canManageEvent(userId, eventId)) {
        return res.status(403).json({ error: 'Not authorized to manage this event' })
      }

      // Verify event exists and is private
      const eventResult = await dbQuery(
        `SELECT id, name, visibility, slug FROM auction_events WHERE id = @eventId`,
        { eventId }
      )
      if (eventResult.recordset.length === 0) {
        return res.status(404).json({ error: 'Event not found' })
      }
      const event = eventResult.recordset[0]

      // Normalize emails to array
      const emailList = Array.isArray(emails)
        ? emails
        : emails.split(/[,;\n]/).map((e: string) => e.trim().toLowerCase()).filter(Boolean)

      const results = []
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'

      for (const email of emailList) {
        // Check if already invited
        const existing = await dbQuery(
          `SELECT id, status FROM event_invitations WHERE event_id = @eventId AND email = @email`,
          { eventId, email }
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
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

        // Create invitation
        const result = await dbQuery(`
          INSERT INTO event_invitations (
            event_id, email, invitation_token, role, invited_by, expires_at
          ) OUTPUT INSERTED.id VALUES (
            @eventId, @email, @token, @role, @userId, @expiresAt
          )
        `, { eventId, email, token, role, userId, expiresAt })

        const invitationId = result.recordset[0].id

        // Send invitation email
        const inviteUrl = `${frontendUrl}/events/${event.slug}/join/${token}`
        await sendEmail({
          to: email,
          subject: `You're invited to ${event.name}`,
          htmlContent: `
            <h2>You've been invited!</h2>
            <p>You've been invited to participate in <strong>${event.name}</strong>.</p>
            ${message ? `<p>${message}</p>` : ''}
            <p>
              <a href="${inviteUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
                Accept Invitation
              </a>
            </p>
            <p>Or copy this link: ${inviteUrl}</p>
            <p>This invitation expires in 30 days.</p>
          `,
        })

        results.push({ email, status: 'invited', invitationId })
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
 * GET /api/events/:eventId/invitations
 *
 * List all invitations for an event
 */
router.get(
  '/:eventId/invitations',
  authenticate,
  [
    param('eventId').isUUID().withMessage('Invalid event ID'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array().map(e => e.msg).join(', ')))
    }

    try {
      const { eventId } = req.params
      const userId = (req as any).user?.id

      // Check permissions
      if (!await canManageEvent(userId, eventId)) {
        return res.status(403).json({ error: 'Not authorized to view invitations' })
      }

      const result = await dbQuery(`
        SELECT
          i.*,
          u.email as user_email,
          u.name as user_name
        FROM event_invitations i
        LEFT JOIN users u ON i.user_id = u.id
        WHERE i.event_id = @eventId
        ORDER BY i.invited_at DESC
      `, { eventId })

      // Get counts
      const countsResult = await dbQuery(`
        SELECT status, COUNT(*) as count
        FROM event_invitations
        WHERE event_id = @eventId
        GROUP BY status
      `, { eventId })

      const counts = countsResult.recordset.reduce((acc: Record<string, number>, row: { status: string; count: number }) => {
        acc[row.status] = row.count
        return acc
      }, {})

      return res.json({
        invitations: result.recordset,
        counts: {
          pending: counts.pending || 0,
          accepted: counts.accepted || 0,
          declined: counts.declined || 0,
          revoked: counts.revoked || 0,
          total: result.recordset.length,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * GET /api/events/:eventId/participants
 *
 * List all participants for an event
 */
router.get(
  '/:eventId/participants',
  authenticate,
  [
    param('eventId').isUUID().withMessage('Invalid event ID'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array().map(e => e.msg).join(', ')))
    }

    try {
      const { eventId } = req.params
      const userId = (req as any).user?.id

      // Check permissions
      if (!await canManageEvent(userId, eventId)) {
        return res.status(403).json({ error: 'Not authorized to view participants' })
      }

      const result = await dbQuery(`
        SELECT
          p.*,
          u.email,
          u.name,
          (SELECT COUNT(*) FROM event_item_bids b JOIN event_items i ON b.item_id = i.id WHERE b.bidder_id = p.user_id AND i.event_id = @eventId) as bid_count,
          (SELECT COUNT(*) FROM event_items WHERE submitted_by = p.user_id AND event_id = @eventId) as items_submitted
        FROM event_participants p
        JOIN users u ON p.user_id = u.id
        WHERE p.event_id = @eventId AND p.is_active = 1
        ORDER BY p.joined_at DESC
      `, { eventId })

      return res.json({
        participants: result.recordset,
        total: result.recordset.length,
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * POST /api/events/:eventId/invitations/:invitationId/resend
 *
 * Resend an invitation email
 */
router.post(
  '/:eventId/invitations/:invitationId/resend',
  authenticate,
  [
    param('eventId').isUUID().withMessage('Invalid event ID'),
    param('invitationId').isUUID().withMessage('Invalid invitation ID'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array().map(e => e.msg).join(', ')))
    }

    try {
      const { eventId, invitationId } = req.params
      const userId = (req as any).user?.id

      // Check permissions
      if (!await canManageEvent(userId, eventId)) {
        return res.status(403).json({ error: 'Not authorized to manage invitations' })
      }

      // Get invitation and event
      const result = await dbQuery(`
        SELECT i.*, e.name as event_name, e.slug as event_slug
        FROM event_invitations i
        JOIN auction_events e ON i.event_id = e.id
        WHERE i.id = @invitationId AND i.event_id = @eventId
      `, { invitationId, eventId })

      if (result.recordset.length === 0) {
        return res.status(404).json({ error: 'Invitation not found' })
      }

      const invitation = result.recordset[0]

      if (invitation.status !== 'pending') {
        return res.status(400).json({ error: 'Can only resend pending invitations' })
      }

      // Generate new token
      const token = crypto.randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

      await dbQuery(`
        UPDATE event_invitations SET
          invitation_token = @token,
          expires_at = @expiresAt,
          invited_at = GETUTCDATE()
        WHERE id = @id
      `, { id: invitationId, token, expiresAt })

      // Send email
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
      const inviteUrl = `${frontendUrl}/events/${invitation.event_slug}/join/${token}`

      await sendEmail({
        to: invitation.email,
        subject: `Reminder: You're invited to ${invitation.event_name}`,
        htmlContent: `
          <h2>Reminder: You've been invited!</h2>
          <p>This is a reminder that you've been invited to participate in <strong>${invitation.event_name}</strong>.</p>
          <p>
            <a href="${inviteUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              Accept Invitation
            </a>
          </p>
          <p>Or copy this link: ${inviteUrl}</p>
          <p>This invitation expires in 30 days.</p>
        `,
      })

      return res.json({ success: true })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * DELETE /api/events/:eventId/invitations/:invitationId
 *
 * Revoke an invitation
 */
router.delete(
  '/:eventId/invitations/:invitationId',
  authenticate,
  [
    param('eventId').isUUID().withMessage('Invalid event ID'),
    param('invitationId').isUUID().withMessage('Invalid invitation ID'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array().map(e => e.msg).join(', ')))
    }

    try {
      const { eventId, invitationId } = req.params
      const userId = (req as any).user?.id

      // Check permissions
      if (!await canManageEvent(userId, eventId)) {
        return res.status(403).json({ error: 'Not authorized to manage invitations' })
      }

      await dbQuery(`
        UPDATE event_invitations SET status = 'revoked'
        WHERE id = @id AND event_id = @eventId
      `, { id: invitationId, eventId })

      return res.json({ success: true })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * DELETE /api/events/:eventId/participants/:participantId
 *
 * Remove a participant from the event
 */
router.delete(
  '/:eventId/participants/:participantId',
  authenticate,
  [
    param('eventId').isUUID().withMessage('Invalid event ID'),
    param('participantId').isUUID().withMessage('Invalid participant ID'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array().map(e => e.msg).join(', ')))
    }

    try {
      const { eventId, participantId } = req.params
      const userId = (req as any).user?.id
      const { reason } = req.body

      // Check permissions
      if (!await canManageEvent(userId, eventId)) {
        return res.status(403).json({ error: 'Not authorized to manage participants' })
      }

      await dbQuery(`
        UPDATE event_participants SET
          is_active = 0,
          removed_at = GETUTCDATE(),
          removed_by = @userId,
          removal_reason = @reason
        WHERE id = @id AND event_id = @eventId
      `, { id: participantId, eventId, userId, reason: reason || null })

      return res.json({ success: true })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * GET /api/events/invitations/validate/:token
 *
 * Validate an invitation token (public endpoint)
 */
router.get(
  '/invitations/validate/:token',
  optionalAuth,
  [
    param('token').notEmpty().withMessage('Token is required'),
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
          i.*,
          e.name as event_name,
          e.slug as event_slug,
          e.start_time,
          e.end_time,
          e.cover_image_url,
          o.name as organization_name
        FROM event_invitations i
        JOIN auction_events e ON i.event_id = e.id
        LEFT JOIN organizations o ON e.organization_id = o.id
        WHERE i.invitation_token = @token
      `, { token })

      if (result.recordset.length === 0) {
        return res.status(404).json({ error: 'Invalid invitation' })
      }

      const invitation = result.recordset[0]

      if (invitation.status === 'revoked') {
        return res.status(400).json({ error: 'This invitation has been revoked' })
      }

      if (invitation.status === 'accepted') {
        return res.status(400).json({ error: 'This invitation has already been accepted' })
      }

      if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
        return res.status(400).json({ error: 'This invitation has expired' })
      }

      return res.json({
        email: invitation.email,
        role: invitation.role,
        event: {
          id: invitation.event_id,
          name: invitation.event_name,
          slug: invitation.event_slug,
          startTime: invitation.start_time,
          endTime: invitation.end_time,
          coverImageUrl: invitation.cover_image_url,
          organizationName: invitation.organization_name,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * POST /api/events/invitations/accept/:token
 *
 * Accept an invitation
 */
router.post(
  '/invitations/accept/:token',
  authenticate,
  [
    param('token').notEmpty().withMessage('Token is required'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array().map(e => e.msg).join(', ')))
    }

    try {
      const { token } = req.params
      const userId = (req as any).user?.id

      // Get invitation
      const inviteResult = await dbQuery(`
        SELECT i.*, e.slug as event_slug
        FROM event_invitations i
        JOIN auction_events e ON i.event_id = e.id
        WHERE i.invitation_token = @token
      `, { token })

      if (inviteResult.recordset.length === 0) {
        return res.status(404).json({ error: 'Invalid invitation' })
      }

      const invitation = inviteResult.recordset[0]

      if (invitation.status !== 'pending') {
        return res.status(400).json({ error: `Invitation is ${invitation.status}` })
      }

      if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
        return res.status(400).json({ error: 'This invitation has expired' })
      }

      // Update invitation
      await dbQuery(`
        UPDATE event_invitations SET
          status = 'accepted',
          user_id = @userId,
          accepted_at = GETUTCDATE(),
          joined_via = 'email'
        WHERE id = @id
      `, { id: invitation.id, userId })

      // Create participant record
      await dbQuery(`
        INSERT INTO event_participants (
          event_id, user_id, can_bid, can_submit_items, joined_via, invitation_id
        ) VALUES (
          @eventId, @userId, @canBid, @canSubmit, 'invitation', @invitationId
        )
      `, {
        eventId: invitation.event_id,
        userId,
        canBid: invitation.role === 'bidder' || invitation.role === 'both' ? 1 : 0,
        canSubmit: invitation.role === 'submitter' || invitation.role === 'both' ? 1 : 0,
        invitationId: invitation.id,
      })

      return res.json({
        success: true,
        redirectTo: `/events/${invitation.event_slug}`,
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * POST /api/events/:eventId/join
 *
 * Join an event using an invite code
 */
router.post(
  '/:eventId/join',
  authenticate,
  [
    param('eventId').isUUID().withMessage('Invalid event ID'),
    body('inviteCode').notEmpty().withMessage('Invite code is required'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array().map(e => e.msg).join(', ')))
    }

    try {
      const { eventId } = req.params
      const { inviteCode } = req.body
      const userId = (req as any).user?.id

      // Get event
      const eventResult = await dbQuery(`
        SELECT id, name, slug, visibility, invite_code
        FROM auction_events
        WHERE id = @eventId
      `, { eventId })

      if (eventResult.recordset.length === 0) {
        return res.status(404).json({ error: 'Event not found' })
      }

      const event = eventResult.recordset[0]

      // Verify invite code
      if (event.invite_code !== inviteCode.toUpperCase()) {
        return res.status(400).json({ error: 'Invalid invite code' })
      }

      // Check if already a participant
      const existingResult = await dbQuery(`
        SELECT id FROM event_participants WHERE event_id = @eventId AND user_id = @userId
      `, { eventId, userId })

      if (existingResult.recordset.length > 0) {
        return res.json({
          success: true,
          message: 'Already a participant',
          redirectTo: `/events/${event.slug}`,
        })
      }

      // Create participant record
      await dbQuery(`
        INSERT INTO event_participants (
          event_id, user_id, can_bid, can_submit_items, joined_via
        ) VALUES (
          @eventId, @userId, 1, 0, 'invite_code'
        )
      `, { eventId, userId })

      return res.json({
        success: true,
        redirectTo: `/events/${event.slug}`,
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * POST /api/events/:eventId/generate-invite-code
 *
 * Generate or regenerate the invite code for a private event
 */
router.post(
  '/:eventId/generate-invite-code',
  authenticate,
  [
    param('eventId').isUUID().withMessage('Invalid event ID'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array().map(e => e.msg).join(', ')))
    }

    try {
      const { eventId } = req.params
      const userId = (req as any).user?.id

      // Check permissions
      if (!await canManageEvent(userId, eventId)) {
        return res.status(403).json({ error: 'Not authorized to manage this event' })
      }

      const inviteCode = generateInviteCode()

      await dbQuery(`
        UPDATE auction_events SET invite_code = @inviteCode WHERE id = @eventId
      `, { eventId, inviteCode })

      return res.json({
        success: true,
        inviteCode,
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * GET /api/events/:eventId/access-check
 *
 * Check if current user has access to a private event
 */
router.get(
  '/:eventId/access-check',
  optionalAuth,
  [
    param('eventId').isUUID().withMessage('Invalid event ID'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array().map(e => e.msg).join(', ')))
    }

    try {
      const { eventId } = req.params
      const userId = (req as any).user?.id

      // Get event
      const eventResult = await dbQuery(`
        SELECT id, visibility, created_by, organization_id FROM auction_events WHERE id = @eventId
      `, { eventId })

      if (eventResult.recordset.length === 0) {
        return res.status(404).json({ error: 'Event not found' })
      }

      const event = eventResult.recordset[0]

      // Public events are accessible to everyone
      if (event.visibility === 'public') {
        return res.json({ hasAccess: true, reason: 'public_event' })
      }

      // Private event - need to check access
      if (!userId) {
        return res.json({ hasAccess: false, reason: 'not_authenticated' })
      }

      // Check if event creator
      if (event.created_by === userId) {
        return res.json({ hasAccess: true, reason: 'event_creator' })
      }

      // Check if org admin
      if (event.organization_id) {
        const orgResult = await dbQuery(`
          SELECT role FROM organization_members
          WHERE organization_id = @orgId AND user_id = @userId AND role IN ('owner', 'admin')
        `, { orgId: event.organization_id, userId })

        if (orgResult.recordset.length > 0) {
          return res.json({ hasAccess: true, reason: 'org_admin' })
        }
      }

      // Check if participant
      const participantResult = await dbQuery(`
        SELECT id, can_bid, can_submit_items FROM event_participants
        WHERE event_id = @eventId AND user_id = @userId AND is_active = 1
      `, { eventId, userId })

      if (participantResult.recordset.length > 0) {
        const p = participantResult.recordset[0]
        return res.json({
          hasAccess: true,
          reason: 'participant',
          permissions: {
            canBid: p.can_bid,
            canSubmitItems: p.can_submit_items,
          },
        })
      }

      return res.json({ hasAccess: false, reason: 'not_participant' })
    } catch (error) {
      next(error)
    }
  }
)

export const eventInvitationsRouter = router
