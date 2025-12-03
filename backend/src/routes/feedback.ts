import { Router, Request, Response, NextFunction } from 'express'
import { body, param, query, validationResult } from 'express-validator'
import { authenticate } from '../middleware/auth.js'
import { query as dbQuery } from '../config/database.js'
import { badRequest, notFound, forbidden } from '../middleware/errorHandler.js'

const router = Router()

// Platform admin emails (you can add more or load from config)
const PLATFORM_ADMINS = ['prent001@gmail.com']

// Check if user is a platform admin
function isPlatformAdmin(email: string): boolean {
  return PLATFORM_ADMINS.includes(email.toLowerCase())
}

// Submit feedback
router.post(
  '/',
  authenticate,
  [
    body('feedbackType')
      .isIn(['bug', 'feature', 'improvement', 'question', 'other'])
      .withMessage('Invalid feedback type'),
    body('title')
      .isString()
      .trim()
      .isLength({ min: 5, max: 255 })
      .withMessage('Title must be between 5 and 255 characters'),
    body('description')
      .isString()
      .trim()
      .isLength({ min: 20, max: 5000 })
      .withMessage('Description must be between 20 and 5000 characters'),
    body('organizationId').optional().isUUID(),
    body('eventId').optional().isUUID(),
    body('category').optional().isString().trim().isLength({ max: 100 }),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest(errors.array()[0].msg)
      }

      const user = req.user!
      const { feedbackType, title, description, organizationId, eventId, category } = req.body

      const result = await dbQuery(
        `INSERT INTO feedback (
          user_id, user_email, user_name,
          organization_id, event_id,
          feedback_type, title, description, category
        )
        OUTPUT INSERTED.*
        VALUES (
          @userId, @userEmail, @userName,
          @organizationId, @eventId,
          @feedbackType, @title, @description, @category
        )`,
        {
          userId: user.id,
          userEmail: user.email,
          userName: user.name,
          organizationId: organizationId || null,
          eventId: eventId || null,
          feedbackType,
          title,
          description,
          category: category || null,
        }
      )

      res.status(201).json(result.recordset[0])
    } catch (error) {
      next(error)
    }
  }
)

// Get user's own feedback submissions
router.get(
  '/my',
  authenticate,
  [
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
    query('status').optional().isString(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest(errors.array()[0].msg)
      }

      const userId = req.user!.id
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0
      const status = req.query.status as string | undefined

      let statusFilter = ''
      if (status) {
        statusFilter = `AND f.status = @status`
      }

      const result = await dbQuery(
        `SELECT
          f.*,
          (SELECT COUNT(*) FROM feedback_votes WHERE feedback_id = f.id) as vote_count,
          (SELECT COUNT(*) FROM feedback_responses WHERE feedback_id = f.id AND is_internal = 0) as response_count
        FROM feedback f
        WHERE f.user_id = @userId ${statusFilter}
        ORDER BY f.created_at DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
        { userId, limit, offset, status: status || null }
      )

      const countResult = await dbQuery(
        `SELECT COUNT(*) as total FROM feedback WHERE user_id = @userId ${status ? 'AND status = @status' : ''}`,
        { userId, status: status || null }
      )

      res.json({
        data: result.recordset,
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

// Get a single feedback item with responses (for the submitter)
router.get(
  '/:id',
  authenticate,
  [param('id').isUUID()],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest(errors.array()[0].msg)
      }

      const user = req.user!
      const feedbackId = req.params.id
      const isAdmin = isPlatformAdmin(user.email)

      // Get the feedback
      const feedbackResult = await dbQuery(
        `SELECT
          f.*,
          (SELECT COUNT(*) FROM feedback_votes WHERE feedback_id = f.id) as vote_count,
          (SELECT CASE WHEN EXISTS(SELECT 1 FROM feedback_votes WHERE feedback_id = f.id AND user_id = @userId) THEN 1 ELSE 0 END) as has_voted
        FROM feedback f
        WHERE f.id = @feedbackId`,
        { feedbackId, userId: user.id }
      )

      if (feedbackResult.recordset.length === 0) {
        throw notFound('Feedback not found')
      }

      const feedback = feedbackResult.recordset[0]

      // Only allow access if user is the submitter or a platform admin
      if (feedback.user_id !== user.id && !isAdmin) {
        throw forbidden('You do not have access to this feedback')
      }

      // Get responses (exclude internal notes for non-admins)
      const responsesResult = await dbQuery(
        `SELECT
          id, feedback_id, responder_id, responder_name, is_admin,
          message, ${isAdmin ? 'is_internal,' : ''} created_at
        FROM feedback_responses
        WHERE feedback_id = @feedbackId
        ${isAdmin ? '' : 'AND is_internal = 0'}
        ORDER BY created_at ASC`,
        { feedbackId }
      )

      res.json({
        ...feedback,
        responses: responsesResult.recordset,
      })
    } catch (error) {
      next(error)
    }
  }
)

// Add a response to feedback (user can reply to their own feedback)
router.post(
  '/:id/responses',
  authenticate,
  [
    param('id').isUUID(),
    body('message')
      .isString()
      .trim()
      .isLength({ min: 1, max: 5000 })
      .withMessage('Message is required (max 5000 characters)'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest(errors.array()[0].msg)
      }

      const user = req.user!
      const feedbackId = req.params.id
      const { message } = req.body
      const isAdmin = isPlatformAdmin(user.email)

      // Check if feedback exists and user has access
      const feedbackResult = await dbQuery(
        `SELECT user_id FROM feedback WHERE id = @feedbackId`,
        { feedbackId }
      )

      if (feedbackResult.recordset.length === 0) {
        throw notFound('Feedback not found')
      }

      const feedback = feedbackResult.recordset[0]

      // Only allow submitter or admin to respond
      if (feedback.user_id !== user.id && !isAdmin) {
        throw forbidden('You cannot respond to this feedback')
      }

      const result = await dbQuery(
        `INSERT INTO feedback_responses (
          feedback_id, responder_id, responder_name, is_admin, message
        )
        OUTPUT INSERTED.*
        VALUES (@feedbackId, @userId, @userName, @isAdmin, @message)`,
        {
          feedbackId,
          userId: user.id,
          userName: user.name,
          isAdmin: isAdmin ? 1 : 0,
          message,
        }
      )

      // Update the feedback's updated_at timestamp
      await dbQuery(
        `UPDATE feedback SET updated_at = GETUTCDATE() WHERE id = @feedbackId`,
        { feedbackId }
      )

      res.status(201).json(result.recordset[0])
    } catch (error) {
      next(error)
    }
  }
)

// Vote for a feedback item
router.post(
  '/:id/vote',
  authenticate,
  [param('id').isUUID()],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest(errors.array()[0].msg)
      }

      const userId = req.user!.id
      const feedbackId = req.params.id

      // Check if feedback exists
      const feedbackResult = await dbQuery(
        `SELECT id FROM feedback WHERE id = @feedbackId`,
        { feedbackId }
      )

      if (feedbackResult.recordset.length === 0) {
        throw notFound('Feedback not found')
      }

      // Try to insert vote (will fail if already voted due to unique constraint)
      try {
        await dbQuery(
          `INSERT INTO feedback_votes (feedback_id, user_id) VALUES (@feedbackId, @userId)`,
          { feedbackId, userId }
        )
      } catch (err: unknown) {
        // Check if it's a duplicate key error
        if (err && typeof err === 'object' && 'number' in err && err.number === 2627) {
          throw badRequest('You have already voted for this feedback')
        }
        throw err
      }

      // Get updated vote count
      const countResult = await dbQuery(
        `SELECT COUNT(*) as vote_count FROM feedback_votes WHERE feedback_id = @feedbackId`,
        { feedbackId }
      )

      res.json({ success: true, voteCount: countResult.recordset[0].vote_count })
    } catch (error) {
      next(error)
    }
  }
)

// Remove vote from a feedback item
router.delete(
  '/:id/vote',
  authenticate,
  [param('id').isUUID()],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest(errors.array()[0].msg)
      }

      const userId = req.user!.id
      const feedbackId = req.params.id

      const result = await dbQuery(
        `DELETE FROM feedback_votes WHERE feedback_id = @feedbackId AND user_id = @userId`,
        { feedbackId, userId }
      )

      if (result.rowsAffected[0] === 0) {
        throw notFound('Vote not found')
      }

      // Get updated vote count
      const countResult = await dbQuery(
        `SELECT COUNT(*) as vote_count FROM feedback_votes WHERE feedback_id = @feedbackId`,
        { feedbackId }
      )

      res.json({ success: true, voteCount: countResult.recordset[0].vote_count })
    } catch (error) {
      next(error)
    }
  }
)

// ============================================
// ADMIN ROUTES (Platform admins only)
// ============================================

// Middleware to check platform admin
const requirePlatformAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!isPlatformAdmin(req.user!.email)) {
    return next(forbidden('Platform admin access required'))
  }
  next()
}

// Get all feedback (admin only)
router.get(
  '/admin/all',
  authenticate,
  requirePlatformAdmin,
  [
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
    query('status').optional().isString(),
    query('type').optional().isString(),
    query('priority').optional().isString(),
    query('search').optional().isString(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest(errors.array()[0].msg)
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0
      const status = req.query.status as string | undefined
      const feedbackType = req.query.type as string | undefined
      const priority = req.query.priority as string | undefined
      const search = req.query.search as string | undefined

      let filters = ''
      if (status) filters += ` AND f.status = @status`
      if (feedbackType) filters += ` AND f.feedback_type = @feedbackType`
      if (priority) filters += ` AND f.priority = @priority`
      if (search) filters += ` AND (f.title LIKE @search OR f.description LIKE @search)`

      const result = await dbQuery(
        `SELECT
          f.*,
          (SELECT COUNT(*) FROM feedback_votes WHERE feedback_id = f.id) as vote_count,
          (SELECT COUNT(*) FROM feedback_responses WHERE feedback_id = f.id) as response_count,
          o.name as organization_name,
          e.name as event_name
        FROM feedback f
        LEFT JOIN organizations o ON f.organization_id = o.id
        LEFT JOIN auction_events e ON f.event_id = e.id
        WHERE 1=1 ${filters}
        ORDER BY
          CASE f.priority
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
          END,
          f.created_at DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
        {
          limit,
          offset,
          status: status || null,
          feedbackType: feedbackType || null,
          priority: priority || null,
          search: search ? `%${search}%` : null,
        }
      )

      const countResult = await dbQuery(
        `SELECT COUNT(*) as total FROM feedback f WHERE 1=1 ${filters}`,
        {
          status: status || null,
          feedbackType: feedbackType || null,
          priority: priority || null,
          search: search ? `%${search}%` : null,
        }
      )

      res.json({
        data: result.recordset,
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

// Update feedback status/priority (admin only)
router.patch(
  '/admin/:id',
  authenticate,
  requirePlatformAdmin,
  [
    param('id').isUUID(),
    body('status').optional().isIn(['new', 'under_review', 'planned', 'in_progress', 'completed', 'wont_fix', 'duplicate']),
    body('priority').optional().isIn(['low', 'medium', 'high', 'critical']),
    body('category').optional().isString().trim().isLength({ max: 100 }),
    body('tags').optional().isString().trim().isLength({ max: 500 }),
    body('resolutionNotes').optional().isString().trim().isLength({ max: 5000 }),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest(errors.array()[0].msg)
      }

      const user = req.user!
      const feedbackId = req.params.id
      const { status, priority, category, tags, resolutionNotes } = req.body

      // Build dynamic update query
      const updates: string[] = ['updated_at = GETUTCDATE()']
      const params: Record<string, unknown> = { feedbackId }

      if (status !== undefined) {
        updates.push('status = @status')
        params.status = status

        // If status is completed or wont_fix, set resolution info
        if (status === 'completed' || status === 'wont_fix') {
          updates.push('resolved_at = GETUTCDATE()', 'resolved_by = @resolvedBy')
          params.resolvedBy = user.id
        }
      }

      if (priority !== undefined) {
        updates.push('priority = @priority')
        params.priority = priority
      }

      if (category !== undefined) {
        updates.push('category = @category')
        params.category = category
      }

      if (tags !== undefined) {
        updates.push('tags = @tags')
        params.tags = tags
      }

      if (resolutionNotes !== undefined) {
        updates.push('resolution_notes = @resolutionNotes')
        params.resolutionNotes = resolutionNotes
      }

      const result = await dbQuery(
        `UPDATE feedback
        SET ${updates.join(', ')}
        OUTPUT INSERTED.*
        WHERE id = @feedbackId`,
        params
      )

      if (result.recordset.length === 0) {
        throw notFound('Feedback not found')
      }

      res.json(result.recordset[0])
    } catch (error) {
      next(error)
    }
  }
)

// Add internal note to feedback (admin only)
router.post(
  '/admin/:id/internal-note',
  authenticate,
  requirePlatformAdmin,
  [
    param('id').isUUID(),
    body('message')
      .isString()
      .trim()
      .isLength({ min: 1, max: 5000 })
      .withMessage('Message is required (max 5000 characters)'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest(errors.array()[0].msg)
      }

      const user = req.user!
      const feedbackId = req.params.id
      const { message } = req.body

      // Check if feedback exists
      const feedbackResult = await dbQuery(
        `SELECT id FROM feedback WHERE id = @feedbackId`,
        { feedbackId }
      )

      if (feedbackResult.recordset.length === 0) {
        throw notFound('Feedback not found')
      }

      const result = await dbQuery(
        `INSERT INTO feedback_responses (
          feedback_id, responder_id, responder_name, is_admin, is_internal, message
        )
        OUTPUT INSERTED.*
        VALUES (@feedbackId, @userId, @userName, 1, 1, @message)`,
        {
          feedbackId,
          userId: user.id,
          userName: user.name,
          message,
        }
      )

      res.status(201).json(result.recordset[0])
    } catch (error) {
      next(error)
    }
  }
)

// Get feedback statistics (admin only)
router.get(
  '/admin/stats',
  authenticate,
  requirePlatformAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await dbQuery(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'new' THEN 1 END) as new_count,
          COUNT(CASE WHEN status = 'under_review' THEN 1 END) as under_review_count,
          COUNT(CASE WHEN status = 'planned' THEN 1 END) as planned_count,
          COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_count,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
          COUNT(CASE WHEN feedback_type = 'bug' THEN 1 END) as bug_count,
          COUNT(CASE WHEN feedback_type = 'feature' THEN 1 END) as feature_count,
          COUNT(CASE WHEN feedback_type = 'improvement' THEN 1 END) as improvement_count,
          COUNT(CASE WHEN priority = 'critical' THEN 1 END) as critical_count,
          COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority_count
        FROM feedback
      `)

      res.json(result.recordset[0])
    } catch (error) {
      next(error)
    }
  }
)

export { router as feedbackRoutes }
