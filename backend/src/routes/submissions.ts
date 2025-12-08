import { Router, Request, Response, NextFunction } from 'express'
import { body, param, query, validationResult } from 'express-validator'
import { authenticate } from '../middleware/auth.js'
import { query as dbQuery } from '../config/database.js'
import { badRequest, notFound, forbidden } from '../middleware/errorHandler.js'
import { v4 as uuidv4 } from 'uuid'
import {
  sendItemApprovedEmail,
  sendItemRejectedEmail,
} from '../services/email.js'

const router = Router()

// Helper to check if string is a valid UUID
function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

// Helper to resolve event ID from ID or slug
async function resolveEventId(idOrSlug: string): Promise<string | null> {
  if (isUUID(idOrSlug)) {
    return idOrSlug
  }

  const result = await dbQuery(
    'SELECT id FROM auction_events WHERE slug = @slug',
    { slug: idOrSlug }
  )

  if (result.recordset.length === 0) {
    return null
  }

  return result.recordset[0].id
}

// Helper to check event admin access
async function checkEventAccess(eventId: string, userId: string) {
  const result = await dbQuery(
    `SELECT e.*,
            CASE
              WHEN e.owner_id = @userId THEN 'owner'
              WHEN e.organization_id IS NOT NULL THEN (
                SELECT role FROM organization_members
                WHERE organization_id = e.organization_id AND user_id = @userId
              )
              ELSE NULL
            END as user_role
     FROM auction_events e
     WHERE e.id = @eventId`,
    { eventId, userId }
  )

  if (result.recordset.length === 0) {
    return null
  }

  const event = result.recordset[0]
  const userRole = event.user_role

  if (!userRole) {
    return null
  }

  if (userRole === 'owner' || userRole === 'admin') {
    return { event, role: userRole }
  }

  return null
}

/**
 * GET /api/events/:eventId/submissions
 * List all submissions for an event.
 * Requires event admin access.
 */
router.get(
  '/events/:eventId/submissions',
  authenticate,
  [
    param('eventId').notEmpty(),
    query('status').optional().isIn(['pending', 'approved', 'rejected', 'withdrawn']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const eventId = await resolveEventId(req.params.eventId)
      if (!eventId) {
        throw notFound('Event not found')
      }

      const userId = req.user!.id
      const access = await checkEventAccess(eventId, userId)
      if (!access) {
        throw forbidden('You do not have access to this event')
      }

      const status = req.query.status as string | undefined
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const offset = (page - 1) * limit

      // Build query with optional status filter
      let whereClause = 'WHERE s.event_id = @eventId'
      const params: Record<string, unknown> = { eventId, limit, offset }

      if (status) {
        whereClause += ' AND s.status = @status'
        params.status = status
      }

      // Get submissions with image count
      const result = await dbQuery(
        `SELECT
          s.id,
          s.name,
          s.description,
          s.estimated_value,
          s.condition,
          s.category,
          s.donor_name,
          s.donor_email,
          s.donor_phone,
          s.donor_notes,
          s.donor_anonymous,
          s.status,
          s.reviewed_by,
          s.reviewed_at,
          s.review_notes,
          s.rejection_reason,
          s.event_item_id,
          s.submitted_at,
          s.last_edited_by,
          s.last_edited_at,
          (SELECT COUNT(*) FROM submission_images si WHERE si.submission_id = s.id) as image_count,
          (SELECT TOP 1 blob_url FROM submission_images si WHERE si.submission_id = s.id AND si.is_primary = 1) as primary_image_url
         FROM item_submissions s
         ${whereClause}
         ORDER BY s.submitted_at DESC
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
        params
      )

      // Get total count
      const countResult = await dbQuery(
        `SELECT COUNT(*) as total FROM item_submissions s ${whereClause}`,
        params
      )

      const total = countResult.recordset[0].total

      res.json({
        submissions: result.recordset.map(s => ({
          id: s.id,
          name: s.name,
          description: s.description,
          estimatedValue: s.estimated_value,
          condition: s.condition,
          category: s.category,
          donor: {
            name: s.donor_name,
            email: s.donor_email,
            phone: s.donor_phone,
            notes: s.donor_notes,
            anonymous: s.donor_anonymous,
          },
          status: s.status,
          reviewedBy: s.reviewed_by,
          reviewedAt: s.reviewed_at,
          reviewNotes: s.review_notes,
          rejectionReason: s.rejection_reason,
          eventItemId: s.event_item_id,
          submittedAt: s.submitted_at,
          lastEditedBy: s.last_edited_by,
          lastEditedAt: s.last_edited_at,
          imageCount: s.image_count,
          primaryImageUrl: s.primary_image_url,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * GET /api/events/:eventId/submissions/:submissionId
 * Get a single submission with all details.
 * Requires event admin access.
 */
router.get(
  '/events/:eventId/submissions/:submissionId',
  authenticate,
  [
    param('eventId').notEmpty(),
    param('submissionId').isUUID(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const eventId = await resolveEventId(req.params.eventId)
      if (!eventId) {
        throw notFound('Event not found')
      }

      const userId = req.user!.id
      const access = await checkEventAccess(eventId, userId)
      if (!access) {
        throw forbidden('You do not have access to this event')
      }

      const { submissionId } = req.params

      // Get submission
      const result = await dbQuery(
        `SELECT
          s.*,
          ae.name as event_name,
          ae.slug as event_slug
         FROM item_submissions s
         INNER JOIN auction_events ae ON s.event_id = ae.id
         WHERE s.id = @submissionId AND s.event_id = @eventId`,
        { submissionId, eventId }
      )

      if (result.recordset.length === 0) {
        throw notFound('Submission not found')
      }

      const submission = result.recordset[0]

      // Get images
      const imagesResult = await dbQuery(
        `SELECT id, blob_url, thumbnail_url, original_filename, file_size_bytes, mime_type, display_order, is_primary
         FROM submission_images
         WHERE submission_id = @submissionId
         ORDER BY display_order`,
        { submissionId }
      )

      res.json({
        id: submission.id,
        name: submission.name,
        description: submission.description,
        estimatedValue: submission.estimated_value,
        condition: submission.condition,
        category: submission.category,
        donor: {
          name: submission.donor_name,
          email: submission.donor_email,
          phone: submission.donor_phone,
          notes: submission.donor_notes,
          anonymous: submission.donor_anonymous,
        },
        status: submission.status,
        reviewedBy: submission.reviewed_by,
        reviewedAt: submission.reviewed_at,
        reviewNotes: submission.review_notes,
        rejectionReason: submission.rejection_reason,
        eventItemId: submission.event_item_id,
        submittedAt: submission.submitted_at,
        submittedIp: submission.submitted_ip,
        userAgent: submission.user_agent,
        lastEditedBy: submission.last_edited_by,
        lastEditedAt: submission.last_edited_at,
        event: {
          id: eventId,
          name: submission.event_name,
          slug: submission.event_slug,
        },
        images: imagesResult.recordset.map(img => ({
          id: img.id,
          url: img.blob_url,
          thumbnailUrl: img.thumbnail_url,
          filename: img.original_filename,
          size: img.file_size_bytes,
          mimeType: img.mime_type,
          displayOrder: img.display_order,
          isPrimary: img.is_primary,
        })),
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * PATCH /api/events/:eventId/submissions/:submissionId
 * Update a submission (edit item details before approval).
 * Requires event admin access.
 */
router.patch(
  '/events/:eventId/submissions/:submissionId',
  authenticate,
  [
    param('eventId').notEmpty(),
    param('submissionId').isUUID(),
    body('name').optional().trim().isLength({ min: 1, max: 255 }),
    body('description').optional().trim().isLength({ max: 5000 }),
    body('estimatedValue').optional().isFloat({ min: 0, max: 999999 }),
    body('condition').optional().isIn(['new', 'like_new', 'good', 'fair', 'for_parts']),
    body('category').optional().trim().isLength({ max: 100 }),
    body('reviewNotes').optional().trim().isLength({ max: 500 }),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const eventId = await resolveEventId(req.params.eventId)
      if (!eventId) {
        throw notFound('Event not found')
      }

      const userId = req.user!.id
      const access = await checkEventAccess(eventId, userId)
      if (!access) {
        throw forbidden('You do not have access to this event')
      }

      const { submissionId } = req.params
      const { name, description, estimatedValue, condition, category, reviewNotes } = req.body

      // Check submission exists and is editable (pending or approved but not yet converted)
      const existing = await dbQuery(
        `SELECT id, status, event_item_id FROM item_submissions
         WHERE id = @submissionId AND event_id = @eventId`,
        { submissionId, eventId }
      )

      if (existing.recordset.length === 0) {
        throw notFound('Submission not found')
      }

      const submission = existing.recordset[0]
      if (submission.event_item_id) {
        throw badRequest('Cannot edit a submission that has been converted to an event item')
      }

      // Build update query
      const updates: string[] = []
      const params: Record<string, unknown> = { submissionId, eventId, userId }

      if (name !== undefined) {
        updates.push('name = @name')
        params.name = name
      }
      if (description !== undefined) {
        updates.push('description = @description')
        params.description = description
      }
      if (estimatedValue !== undefined) {
        updates.push('estimated_value = @estimatedValue')
        params.estimatedValue = estimatedValue
      }
      if (condition !== undefined) {
        updates.push('condition = @condition')
        params.condition = condition
      }
      if (category !== undefined) {
        updates.push('category = @category')
        params.category = category
      }
      if (reviewNotes !== undefined) {
        updates.push('review_notes = @reviewNotes')
        params.reviewNotes = reviewNotes
      }

      if (updates.length > 0) {
        updates.push('last_edited_by = @userId')
        updates.push('last_edited_at = GETUTCDATE()')

        await dbQuery(
          `UPDATE item_submissions SET ${updates.join(', ')}
           WHERE id = @submissionId AND event_id = @eventId`,
          params
        )
      }

      res.json({ success: true })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * POST /api/events/:eventId/submissions/:submissionId/approve
 * Approve a submission.
 * Requires event admin access.
 */
router.post(
  '/events/:eventId/submissions/:submissionId/approve',
  authenticate,
  [
    param('eventId').notEmpty(),
    param('submissionId').isUUID(),
    body('reviewNotes').optional().trim().isLength({ max: 500 }),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const eventId = await resolveEventId(req.params.eventId)
      if (!eventId) {
        throw notFound('Event not found')
      }

      const userId = req.user!.id
      const access = await checkEventAccess(eventId, userId)
      if (!access) {
        throw forbidden('You do not have access to this event')
      }

      const { submissionId } = req.params
      const { reviewNotes } = req.body

      // Check submission exists and is pending
      const existing = await dbQuery(
        `SELECT s.*, ae.name as event_name, ae.slug as event_slug
         FROM item_submissions s
         INNER JOIN auction_events ae ON s.event_id = ae.id
         WHERE s.id = @submissionId AND s.event_id = @eventId`,
        { submissionId, eventId }
      )

      if (existing.recordset.length === 0) {
        throw notFound('Submission not found')
      }

      const submission = existing.recordset[0]
      if (submission.status !== 'pending') {
        throw badRequest(`Cannot approve a submission with status "${submission.status}"`)
      }

      // Update status
      await dbQuery(
        `UPDATE item_submissions
         SET status = 'approved',
             reviewed_by = @userId,
             reviewed_at = GETUTCDATE(),
             review_notes = @reviewNotes
         WHERE id = @submissionId`,
        { submissionId, userId, reviewNotes: reviewNotes || null }
      )

      // Send email to donor if they provided email
      if (submission.donor_email) {
        try {
          await sendItemApprovedEmail({
            recipientEmail: submission.donor_email,
            recipientName: submission.donor_name || 'Donor',
            itemTitle: submission.name,
            eventName: submission.event_name,
            eventSlug: submission.event_slug,
          })
        } catch (err) {
          console.error('Failed to send item approved email:', err)
        }
      }

      res.json({ success: true, message: 'Submission approved' })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * POST /api/events/:eventId/submissions/:submissionId/reject
 * Reject a submission.
 * Requires event admin access.
 */
router.post(
  '/events/:eventId/submissions/:submissionId/reject',
  authenticate,
  [
    param('eventId').notEmpty(),
    param('submissionId').isUUID(),
    body('rejectionReason').optional().trim().isLength({ max: 500 }),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const eventId = await resolveEventId(req.params.eventId)
      if (!eventId) {
        throw notFound('Event not found')
      }

      const userId = req.user!.id
      const access = await checkEventAccess(eventId, userId)
      if (!access) {
        throw forbidden('You do not have access to this event')
      }

      const { submissionId } = req.params
      const { rejectionReason } = req.body

      // Check submission exists and is pending
      const existing = await dbQuery(
        `SELECT s.*, ae.name as event_name
         FROM item_submissions s
         INNER JOIN auction_events ae ON s.event_id = ae.id
         WHERE s.id = @submissionId AND s.event_id = @eventId`,
        { submissionId, eventId }
      )

      if (existing.recordset.length === 0) {
        throw notFound('Submission not found')
      }

      const submission = existing.recordset[0]
      if (submission.status !== 'pending') {
        throw badRequest(`Cannot reject a submission with status "${submission.status}"`)
      }

      // Update status
      await dbQuery(
        `UPDATE item_submissions
         SET status = 'rejected',
             reviewed_by = @userId,
             reviewed_at = GETUTCDATE(),
             rejection_reason = @rejectionReason
         WHERE id = @submissionId`,
        { submissionId, userId, rejectionReason: rejectionReason || null }
      )

      // Send email to donor if they provided email
      if (submission.donor_email) {
        try {
          await sendItemRejectedEmail({
            recipientEmail: submission.donor_email,
            recipientName: submission.donor_name || 'Donor',
            itemTitle: submission.name,
            eventName: submission.event_name,
            rejectionReason: rejectionReason || undefined,
          })
        } catch (err) {
          console.error('Failed to send item rejected email:', err)
        }
      }

      res.json({ success: true, message: 'Submission rejected' })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * POST /api/events/:eventId/submissions/:submissionId/convert
 * Convert an approved submission to an event item.
 * Requires event admin access.
 */
router.post(
  '/events/:eventId/submissions/:submissionId/convert',
  authenticate,
  [
    param('eventId').notEmpty(),
    param('submissionId').isUUID(),
    body('startingBid').optional().isFloat({ min: 0 }),
    body('bidIncrement').optional().isFloat({ min: 1 }),
    body('buyNowPrice').optional().isFloat({ min: 0 }),
    body('categoryId').optional().isUUID(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const eventId = await resolveEventId(req.params.eventId)
      if (!eventId) {
        throw notFound('Event not found')
      }

      const userId = req.user!.id
      const access = await checkEventAccess(eventId, userId)
      if (!access) {
        throw forbidden('You do not have access to this event')
      }

      const { submissionId } = req.params
      const { startingBid, bidIncrement, buyNowPrice, categoryId } = req.body

      // Check submission exists and is approved
      const existing = await dbQuery(
        `SELECT * FROM item_submissions
         WHERE id = @submissionId AND event_id = @eventId`,
        { submissionId, eventId }
      )

      if (existing.recordset.length === 0) {
        throw notFound('Submission not found')
      }

      const submission = existing.recordset[0]
      if (submission.status !== 'approved') {
        throw badRequest(`Cannot convert a submission with status "${submission.status}". Must be approved first.`)
      }
      if (submission.event_item_id) {
        throw badRequest('This submission has already been converted to an event item')
      }

      // Create event item
      const itemId = uuidv4()
      const finalStartingBid = startingBid ?? submission.estimated_value ?? 10
      const finalBidIncrement = bidIncrement ?? 5

      await dbQuery(
        `INSERT INTO event_items (
          id, event_id, title, description, starting_bid, bid_increment,
          buy_now_price, category_id, status, created_by,
          donor_name, donor_email, donor_anonymous
         ) VALUES (
          @itemId, @eventId, @title, @description, @startingBid, @bidIncrement,
          @buyNowPrice, @categoryId, 'pending', @userId,
          @donorName, @donorEmail, @donorAnonymous
         )`,
        {
          itemId,
          eventId,
          title: submission.name,
          description: submission.description,
          startingBid: finalStartingBid,
          bidIncrement: finalBidIncrement,
          buyNowPrice: buyNowPrice || null,
          categoryId: categoryId || null,
          userId,
          donorName: submission.donor_anonymous ? null : submission.donor_name,
          donorEmail: submission.donor_email,
          donorAnonymous: submission.donor_anonymous,
        }
      )

      // Copy images from submission to event item
      const imagesResult = await dbQuery(
        `SELECT id, blob_url, thumbnail_url, original_filename, file_size_bytes, mime_type, display_order, is_primary
         FROM submission_images
         WHERE submission_id = @submissionId
         ORDER BY display_order`,
        { submissionId }
      )

      for (const img of imagesResult.recordset) {
        const imageId = uuidv4()
        await dbQuery(
          `INSERT INTO item_images (
            id, item_id, blob_url, thumbnail_url, original_filename,
            file_size_bytes, mime_type, display_order, is_primary
           ) VALUES (
            @imageId, @itemId, @blobUrl, @thumbnailUrl, @filename,
            @fileSize, @mimeType, @displayOrder, @isPrimary
           )`,
          {
            imageId,
            itemId,
            blobUrl: img.blob_url,
            thumbnailUrl: img.thumbnail_url,
            filename: img.original_filename,
            fileSize: img.file_size_bytes,
            mimeType: img.mime_type,
            displayOrder: img.display_order,
            isPrimary: img.is_primary,
          }
        )
      }

      // Link submission to event item
      await dbQuery(
        `UPDATE item_submissions SET event_item_id = @itemId WHERE id = @submissionId`,
        { itemId, submissionId }
      )

      res.json({
        success: true,
        eventItemId: itemId,
        message: 'Submission converted to event item',
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * DELETE /api/events/:eventId/submissions/:submissionId
 * Delete a submission (only pending/rejected).
 * Requires event admin access.
 */
router.delete(
  '/events/:eventId/submissions/:submissionId',
  authenticate,
  [
    param('eventId').notEmpty(),
    param('submissionId').isUUID(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const eventId = await resolveEventId(req.params.eventId)
      if (!eventId) {
        throw notFound('Event not found')
      }

      const userId = req.user!.id
      const access = await checkEventAccess(eventId, userId)
      if (!access) {
        throw forbidden('You do not have access to this event')
      }

      const { submissionId } = req.params

      // Check submission exists
      const existing = await dbQuery(
        `SELECT id, status, event_item_id FROM item_submissions
         WHERE id = @submissionId AND event_id = @eventId`,
        { submissionId, eventId }
      )

      if (existing.recordset.length === 0) {
        throw notFound('Submission not found')
      }

      const submission = existing.recordset[0]
      if (submission.event_item_id) {
        throw badRequest('Cannot delete a submission that has been converted to an event item')
      }

      // Delete submission (cascade will delete images)
      await dbQuery(
        `DELETE FROM item_submissions WHERE id = @submissionId`,
        { submissionId }
      )

      res.json({ success: true, message: 'Submission deleted' })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * GET /api/events/:eventId/submissions/stats
 * Get submission statistics for an event.
 * Requires event admin access.
 */
router.get(
  '/events/:eventId/submissions/stats',
  authenticate,
  [param('eventId').notEmpty()],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const eventId = await resolveEventId(req.params.eventId)
      if (!eventId) {
        throw notFound('Event not found')
      }

      const userId = req.user!.id
      const access = await checkEventAccess(eventId, userId)
      if (!access) {
        throw forbidden('You do not have access to this event')
      }

      const result = await dbQuery(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
          SUM(CASE WHEN status = 'withdrawn' THEN 1 ELSE 0 END) as withdrawn,
          SUM(CASE WHEN event_item_id IS NOT NULL THEN 1 ELSE 0 END) as converted,
          SUM(COALESCE(estimated_value, 0)) as total_estimated_value
         FROM item_submissions
         WHERE event_id = @eventId`,
        { eventId }
      )

      const stats = result.recordset[0]

      res.json({
        total: stats.total,
        pending: stats.pending,
        approved: stats.approved,
        rejected: stats.rejected,
        withdrawn: stats.withdrawn,
        converted: stats.converted,
        totalEstimatedValue: stats.total_estimated_value,
      })
    } catch (error) {
      next(error)
    }
  }
)

export { router as submissionRoutes }
