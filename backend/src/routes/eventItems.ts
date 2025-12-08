import { Router, Request, Response, NextFunction } from 'express'
import { body, param, query, validationResult } from 'express-validator'
import multer from 'multer'
import { authenticate, optionalAuth } from '../middleware/auth.js'
import { query as dbQuery } from '../config/database.js'
import { badRequest, notFound, forbidden } from '../middleware/errorHandler.js'
import { uploadToBlob, deleteBlob } from '../services/storage.js'
import {
  notifyItemApproved,
  notifyItemRejected,
  notifyResubmitRequested,
  notifyItemRemoved,
  notifyBidCancelled,
  notifyAllBiddersOnItem,
} from '../services/notifications.js'
import { v4 as uuidv4 } from 'uuid'

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

  // Look up by slug
  const result = await dbQuery(
    'SELECT id FROM auction_events WHERE slug = @slug',
    { slug: idOrSlug }
  )

  if (result.recordset.length === 0) {
    return null
  }

  return result.recordset[0].id
}

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'))
    }
  },
})

const MAX_IMAGES_PER_ITEM = 20

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

// Submit item to event
router.post(
  '/events/:eventId/items',
  authenticate,
  [
    param('eventId').isUUID(),
    body('title').isString().isLength({ min: 2, max: 255 }),
    body('description').optional().isString(),
    body('condition').optional().isString(),
    body('startingPrice').optional().isFloat({ min: 0 }),
    body('buyNowPrice').optional().isFloat({ min: 0 }),
    body('accessCode').isString().isLength({ min: 6, max: 6 }),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const { eventId } = req.params
      const userId = req.user!.id
      const { title, description, condition, startingPrice, buyNowPrice, accessCode } = req.body

      // Ensure user exists
      await ensureUserExists(userId, req.user!.email, req.user!.name)

      // Get event and verify access code
      const eventResult = await dbQuery(
        'SELECT * FROM auction_events WHERE id = @eventId',
        { eventId }
      )

      if (eventResult.recordset.length === 0) {
        throw notFound('Event not found')
      }

      const event = eventResult.recordset[0]

      // Verify access code
      if (event.access_code.toUpperCase() !== accessCode.toUpperCase()) {
        throw forbidden('Invalid access code')
      }

      // Check event status
      if (event.status === 'cancelled') {
        throw badRequest('This event has been cancelled')
      }

      if (event.status === 'ended') {
        throw badRequest('This event has ended')
      }

      if (event.status === 'active') {
        throw badRequest('Cannot submit items to an active event')
      }

      // Check submission deadline
      if (event.submission_deadline && new Date() > new Date(event.submission_deadline)) {
        throw badRequest('Submission deadline has passed')
      }

      // Check max items
      if (event.item_count >= event.max_items) {
        throw badRequest('This event has reached its maximum number of items')
      }

      // Create item
      const result = await dbQuery(
        `INSERT INTO event_items (
          event_id, title, description, condition,
          starting_price, buy_now_price, submitted_by,
          submission_status, status, created_at, updated_at
        ) OUTPUT INSERTED.*
        VALUES (
          @eventId, @title, @description, @condition,
          @startingPrice, @buyNowPrice, @submittedBy,
          'pending', 'pending', GETUTCDATE(), GETUTCDATE()
        )`,
        {
          eventId,
          title,
          description: description || null,
          condition: condition || null,
          startingPrice: startingPrice || null,
          buyNowPrice: buyNowPrice || null,
          submittedBy: userId,
        }
      )

      const item = result.recordset[0]

      res.status(201).json({
        id: item.id,
        eventId: item.event_id,
        title: item.title,
        description: item.description,
        condition: item.condition,
        startingPrice: item.starting_price ? parseFloat(item.starting_price) : null,
        buyNowPrice: item.buy_now_price ? parseFloat(item.buy_now_price) : null,
        submissionStatus: item.submission_status,
        status: item.status,
        createdAt: item.created_at,
      })
    } catch (error) {
      next(error)
    }
  }
)

// List event items (public - only approved/active items)
router.get(
  '/events/:eventId/items',
  optionalAuth,
  [
    param('eventId').isString(),
    query('page').optional().isInt({ min: 1 }),
    query('pageSize').optional().isInt({ min: 1, max: 50 }),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { eventId: eventIdOrSlug } = req.params

      // Resolve event ID from ID or slug
      const eventId = await resolveEventId(eventIdOrSlug)
      if (!eventId) {
        throw notFound('Event not found')
      }
      const page = parseInt(req.query.page as string) || 1
      const pageSize = parseInt(req.query.pageSize as string) || 24
      const offset = (page - 1) * pageSize

      // Get total count of approved items
      const countResult = await dbQuery(
        `SELECT COUNT(*) as total FROM event_items
         WHERE event_id = @eventId AND submission_status = 'approved' AND status != 'removed'`,
        { eventId }
      )
      const totalItems = countResult.recordset[0].total

      // Get items with images
      const result = await dbQuery(
        `SELECT i.*, u.display_name as submitter_name
         FROM event_items i
         LEFT JOIN users u ON i.submitted_by = u.id
         WHERE i.event_id = @eventId AND i.submission_status = 'approved' AND i.status != 'removed'
         ORDER BY i.display_order ASC, i.created_at ASC
         OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`,
        { eventId, offset, pageSize }
      )

      // Get images for all items
      const itemIds = result.recordset.map((i: any) => i.id)
      let images: any[] = []
      if (itemIds.length > 0) {
        const imageResult = await dbQuery(
          `SELECT * FROM event_item_images
           WHERE item_id IN (${itemIds.map((_: any, idx: number) => `@id${idx}`).join(',')})
           ORDER BY display_order ASC`,
          itemIds.reduce((acc: any, id: string, idx: number) => ({ ...acc, [`id${idx}`]: id }), {})
        )
        images = imageResult.recordset
      }

      const items = result.recordset.map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        condition: item.condition,
        startingPrice: item.starting_price ? parseFloat(item.starting_price) : null,
        buyNowPrice: item.buy_now_price ? parseFloat(item.buy_now_price) : null,
        currentBid: item.current_bid ? parseFloat(item.current_bid) : null,
        bidCount: item.bid_count,
        status: item.status,
        submitterName: item.submitter_name,
        images: images
          .filter((img: any) => img.item_id === item.id)
          .map((img: any) => ({
            id: img.id,
            blobUrl: img.blob_url,
            displayOrder: img.display_order,
            isPrimary: img.is_primary,
          })),
      }))

      res.json({
        data: items,
        pagination: {
          page,
          pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / pageSize),
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

// List pending submissions (admin only)
router.get(
  '/events/:eventId/items/pending',
  authenticate,
  param('eventId').isString(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { eventId: eventIdOrSlug } = req.params
      const userId = req.user!.id

      // Resolve event ID from ID or slug
      const eventId = await resolveEventId(eventIdOrSlug)
      if (!eventId) {
        throw notFound('Event not found')
      }

      // Check admin access
      const access = await checkEventAccess(eventId, userId)
      if (!access) {
        throw forbidden('You do not have permission to view pending submissions')
      }

      const result = await dbQuery(
        `SELECT i.*, u.display_name as submitter_name, u.email as submitter_email
         FROM event_items i
         LEFT JOIN users u ON i.submitted_by = u.id
         WHERE i.event_id = @eventId AND i.submission_status = 'pending'
         ORDER BY i.created_at ASC`,
        { eventId }
      )

      // Get images
      const itemIds = result.recordset.map((i: any) => i.id)
      let images: any[] = []
      if (itemIds.length > 0) {
        const imageResult = await dbQuery(
          `SELECT * FROM event_item_images
           WHERE item_id IN (${itemIds.map((_: any, idx: number) => `@id${idx}`).join(',')})
           ORDER BY display_order ASC`,
          itemIds.reduce((acc: any, id: string, idx: number) => ({ ...acc, [`id${idx}`]: id }), {})
        )
        images = imageResult.recordset
      }

      const items = result.recordset.map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        condition: item.condition,
        startingPrice: item.starting_price ? parseFloat(item.starting_price) : null,
        buyNowPrice: item.buy_now_price ? parseFloat(item.buy_now_price) : null,
        submissionStatus: item.submission_status,
        submitter: {
          id: item.submitted_by,
          name: item.submitter_name,
          email: item.submitter_email,
        },
        createdAt: item.created_at,
        images: images
          .filter((img: any) => img.item_id === item.id)
          .map((img: any) => ({
            id: img.id,
            blobUrl: img.blob_url,
            displayOrder: img.display_order,
            isPrimary: img.is_primary,
          })),
      }))

      res.json(items)
    } catch (error) {
      next(error)
    }
  }
)

// Get user's submissions for an event
router.get(
  '/events/:eventId/items/my-submissions',
  authenticate,
  param('eventId').isString(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { eventId: eventIdOrSlug } = req.params
      const userId = req.user!.id

      // Resolve event ID from ID or slug
      const eventId = await resolveEventId(eventIdOrSlug)
      if (!eventId) {
        throw notFound('Event not found')
      }

      const result = await dbQuery(
        `SELECT i.*
         FROM event_items i
         WHERE i.event_id = @eventId AND i.submitted_by = @userId
         ORDER BY i.created_at DESC`,
        { eventId, userId }
      )

      // Get images
      const itemIds = result.recordset.map((i: any) => i.id)
      let images: any[] = []
      if (itemIds.length > 0) {
        const imageResult = await dbQuery(
          `SELECT * FROM event_item_images
           WHERE item_id IN (${itemIds.map((_: any, idx: number) => `@id${idx}`).join(',')})
           ORDER BY display_order ASC`,
          itemIds.reduce((acc: any, id: string, idx: number) => ({ ...acc, [`id${idx}`]: id }), {})
        )
        images = imageResult.recordset
      }

      const items = result.recordset.map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        condition: item.condition,
        startingPrice: item.starting_price ? parseFloat(item.starting_price) : null,
        buyNowPrice: item.buy_now_price ? parseFloat(item.buy_now_price) : null,
        submissionStatus: item.submission_status,
        rejectionReason: item.rejection_reason,
        allowResubmit: item.allow_resubmit,
        status: item.status,
        createdAt: item.created_at,
        images: images
          .filter((img: any) => img.item_id === item.id)
          .map((img: any) => ({
            id: img.id,
            blobUrl: img.blob_url,
            displayOrder: img.display_order,
            isPrimary: img.is_primary,
          })),
      }))

      res.json(items)
    } catch (error) {
      next(error)
    }
  }
)

// Get single item
router.get(
  '/:id',
  optionalAuth,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Invalid item ID format')
      }

      const { id } = req.params
      const userId = req.user?.id

      const result = await dbQuery(
        `SELECT i.*, e.auction_type, e.increment_type, e.increment_value, e.status as event_status,
                u.display_name as submitter_name
         FROM event_items i
         INNER JOIN auction_events e ON i.event_id = e.id
         LEFT JOIN users u ON i.submitted_by = u.id
         WHERE i.id = @id`,
        { id }
      )

      if (result.recordset.length === 0) {
        throw notFound('Item not found')
      }

      const item = result.recordset[0]

      // Check if user can view (public only sees approved items, submitter and admins can see all)
      let canView = item.submission_status === 'approved' && item.status !== 'removed'
      let isAdmin = false
      let isSubmitter = false

      if (userId) {
        isSubmitter = item.submitted_by === userId
        if (isSubmitter) canView = true

        const access = await checkEventAccess(item.event_id, userId)
        if (access) {
          isAdmin = true
          canView = true
        }
      }

      if (!canView) {
        throw notFound('Item not found')
      }

      // Get images
      const imageResult = await dbQuery(
        'SELECT * FROM event_item_images WHERE item_id = @id ORDER BY display_order ASC',
        { id }
      )

      res.json({
        id: item.id,
        eventId: item.event_id,
        title: item.title,
        description: item.description,
        condition: item.condition,
        startingPrice: item.starting_price ? parseFloat(item.starting_price) : null,
        buyNowPrice: item.buy_now_price ? parseFloat(item.buy_now_price) : null,
        currentBid: item.current_bid ? parseFloat(item.current_bid) : null,
        bidCount: item.bid_count,
        auctionType: item.auction_type,
        incrementType: item.increment_type,
        incrementValue: parseFloat(item.increment_value),
        eventStatus: item.event_status,
        submissionStatus: item.submission_status,
        status: item.status,
        submitter: {
          id: item.submitted_by,
          name: item.submitter_name,
        },
        // Only show rejection info to submitter/admin
        ...(isSubmitter || isAdmin ? {
          rejectionReason: item.rejection_reason,
          allowResubmit: item.allow_resubmit,
        } : {}),
        images: imageResult.recordset.map((img: any) => ({
          id: img.id,
          blobUrl: img.blob_url,
          displayOrder: img.display_order,
          isPrimary: img.is_primary,
        })),
        isAdmin,
        isSubmitter,
      })
    } catch (error) {
      next(error)
    }
  }
)

// Update item
router.put(
  '/:id',
  authenticate,
  [
    param('id').isUUID(),
    body('title').optional().isString().isLength({ min: 2, max: 255 }),
    body('description').optional().isString(),
    body('condition').optional().isString(),
    body('startingPrice').optional().isFloat({ min: 0 }),
    body('buyNowPrice').optional().isFloat({ min: 0 }),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const { id } = req.params
      const userId = req.user!.id
      const { title, description, condition, startingPrice, buyNowPrice } = req.body

      // Get item
      const itemResult = await dbQuery(
        `SELECT i.*, e.status as event_status
         FROM event_items i
         INNER JOIN auction_events e ON i.event_id = e.id
         WHERE i.id = @id`,
        { id }
      )

      if (itemResult.recordset.length === 0) {
        throw notFound('Item not found')
      }

      const item = itemResult.recordset[0]

      // Check permissions
      const isSubmitter = item.submitted_by === userId
      const access = await checkEventAccess(item.event_id, userId)
      const isAdmin = !!access

      if (!isSubmitter && !isAdmin) {
        throw forbidden('You do not have permission to update this item')
      }

      // Submitter can only update before approval
      if (isSubmitter && !isAdmin && item.submission_status !== 'pending' && item.submission_status !== 'resubmit_requested') {
        throw badRequest('Cannot update item after it has been reviewed')
      }

      // Cannot update if event is active or ended
      if (item.event_status === 'active' || item.event_status === 'ended') {
        throw badRequest('Cannot update items in an active or ended event')
      }

      await dbQuery(
        `UPDATE event_items SET
          title = COALESCE(@title, title),
          description = COALESCE(@description, description),
          condition = COALESCE(@condition, condition),
          starting_price = COALESCE(@startingPrice, starting_price),
          buy_now_price = COALESCE(@buyNowPrice, buy_now_price),
          updated_at = GETUTCDATE()
         WHERE id = @id`,
        {
          id,
          title: title || null,
          description: description !== undefined ? description : null,
          condition: condition || null,
          startingPrice: startingPrice || null,
          buyNowPrice: buyNowPrice || null,
        }
      )

      res.json({ message: 'Item updated successfully' })
    } catch (error) {
      next(error)
    }
  }
)

// Remove item (admin only)
router.delete(
  '/:id',
  authenticate,
  [
    param('id').isUUID(),
    body('reason').optional().isString(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Invalid item ID format')
      }

      const { id } = req.params
      const userId = req.user!.id
      const { reason } = req.body

      // Get item
      const itemResult = await dbQuery(
        'SELECT * FROM event_items WHERE id = @id',
        { id }
      )

      if (itemResult.recordset.length === 0) {
        throw notFound('Item not found')
      }

      const item = itemResult.recordset[0]

      // Check admin access
      const access = await checkEventAccess(item.event_id, userId)
      if (!access) {
        throw forbidden('Only event admins can remove items')
      }

      // Update item status to removed
      await dbQuery(
        `UPDATE event_items SET
          status = 'removed',
          removed_reason = @reason,
          removed_at = GETUTCDATE(),
          removed_by = @removedBy,
          updated_at = GETUTCDATE()
         WHERE id = @id`,
        { id, reason: reason || null, removedBy: userId }
      )

      // Update event item count
      await dbQuery(
        `UPDATE auction_events SET
          item_count = (SELECT COUNT(*) FROM event_items WHERE event_id = @eventId AND submission_status = 'approved' AND status != 'removed'),
          updated_at = GETUTCDATE()
         WHERE id = @eventId`,
        { eventId: item.event_id }
      )

      // Notify submitter that their item was removed
      const removalReason = reason || 'No reason provided'
      await notifyItemRemoved(item.submitted_by, item.title, removalReason, item.event_id, id)

      // Notify all bidders that their bids have been cancelled
      if (item.bid_count > 0) {
        await notifyAllBiddersOnItem(id, (bidderId) =>
          notifyBidCancelled(bidderId, item.title, item.event_id, id)
        )
      }

      res.json({ message: 'Item removed successfully' })
    } catch (error) {
      next(error)
    }
  }
)

// Approve submission
router.post(
  '/:id/approve',
  authenticate,
  [
    param('id').isUUID(),
    body('startingPrice').optional().isFloat({ min: 0 }),
    body('buyNowPrice').optional().isFloat({ min: 0 }),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Invalid item ID format')
      }

      const { id } = req.params
      const userId = req.user!.id
      const { startingPrice, buyNowPrice } = req.body

      // Get item
      const itemResult = await dbQuery(
        'SELECT * FROM event_items WHERE id = @id',
        { id }
      )

      if (itemResult.recordset.length === 0) {
        throw notFound('Item not found')
      }

      const item = itemResult.recordset[0]

      // Check admin access
      const access = await checkEventAccess(item.event_id, userId)
      if (!access) {
        throw forbidden('Only event admins can approve submissions')
      }

      if (item.submission_status !== 'pending' && item.submission_status !== 'resubmit_requested') {
        throw badRequest('Item is not pending review')
      }

      // Update item
      await dbQuery(
        `UPDATE event_items SET
          submission_status = 'approved',
          status = 'active',
          starting_price = COALESCE(@startingPrice, starting_price),
          buy_now_price = COALESCE(@buyNowPrice, buy_now_price),
          reviewed_by = @reviewedBy,
          reviewed_at = GETUTCDATE(),
          updated_at = GETUTCDATE()
         WHERE id = @id`,
        {
          id,
          startingPrice: startingPrice || null,
          buyNowPrice: buyNowPrice || null,
          reviewedBy: userId,
        }
      )

      // Update event item count
      await dbQuery(
        `UPDATE auction_events SET
          item_count = (SELECT COUNT(*) FROM event_items WHERE event_id = @eventId AND submission_status = 'approved' AND status != 'removed'),
          updated_at = GETUTCDATE()
         WHERE id = @eventId`,
        { eventId: item.event_id }
      )

      // Send notification to submitter
      const eventResult = await dbQuery(
        'SELECT name FROM auction_events WHERE id = @eventId',
        { eventId: item.event_id }
      )
      const eventName = eventResult.recordset[0]?.name || 'the event'
      await notifyItemApproved(item.submitted_by, item.title, eventName, item.event_id, id)

      res.json({ message: 'Item approved successfully' })
    } catch (error) {
      next(error)
    }
  }
)

// Reject submission
router.post(
  '/:id/reject',
  authenticate,
  [
    param('id').isUUID(),
    body('reason').optional().isString(),
    body('allowResubmit').optional().isBoolean(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Invalid item ID format')
      }

      const { id } = req.params
      const userId = req.user!.id
      const { reason, allowResubmit = false } = req.body

      // Get item
      const itemResult = await dbQuery(
        'SELECT * FROM event_items WHERE id = @id',
        { id }
      )

      if (itemResult.recordset.length === 0) {
        throw notFound('Item not found')
      }

      const item = itemResult.recordset[0]

      // Check admin access
      const access = await checkEventAccess(item.event_id, userId)
      if (!access) {
        throw forbidden('Only event admins can reject submissions')
      }

      if (item.submission_status !== 'pending' && item.submission_status !== 'resubmit_requested') {
        throw badRequest('Item is not pending review')
      }

      const newStatus = allowResubmit ? 'resubmit_requested' : 'rejected'

      await dbQuery(
        `UPDATE event_items SET
          submission_status = @status,
          rejection_reason = @reason,
          allow_resubmit = @allowResubmit,
          reviewed_by = @reviewedBy,
          reviewed_at = GETUTCDATE(),
          updated_at = GETUTCDATE()
         WHERE id = @id`,
        {
          id,
          status: newStatus,
          reason: reason || null,
          allowResubmit: allowResubmit ? 1 : 0,
          reviewedBy: userId,
        }
      )

      // Send notification to submitter
      const eventResult = await dbQuery(
        'SELECT name FROM auction_events WHERE id = @eventId',
        { eventId: item.event_id }
      )
      const eventName = eventResult.recordset[0]?.name || 'the event'
      const notificationReason = reason || 'No reason provided'

      if (allowResubmit) {
        await notifyResubmitRequested(item.submitted_by, item.title, eventName, notificationReason, item.event_id, id)
      } else {
        await notifyItemRejected(item.submitted_by, item.title, eventName, notificationReason, item.event_id, id)
      }

      res.json({ message: allowResubmit ? 'Resubmission requested' : 'Item rejected' })
    } catch (error) {
      next(error)
    }
  }
)

// Resubmit rejected item
router.post(
  '/:id/resubmit',
  authenticate,
  [
    param('id').isUUID(),
    body('title').optional().isString().isLength({ min: 2, max: 255 }),
    body('description').optional().isString(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Invalid item ID format')
      }

      const { id } = req.params
      const userId = req.user!.id
      const { title, description } = req.body

      // Get item
      const itemResult = await dbQuery(
        `SELECT i.*, e.submission_deadline, e.status as event_status
         FROM event_items i
         INNER JOIN auction_events e ON i.event_id = e.id
         WHERE i.id = @id`,
        { id }
      )

      if (itemResult.recordset.length === 0) {
        throw notFound('Item not found')
      }

      const item = itemResult.recordset[0]

      // Check if user is the submitter
      if (item.submitted_by !== userId) {
        throw forbidden('Only the submitter can resubmit this item')
      }

      // Check if resubmission is allowed
      if (item.submission_status !== 'resubmit_requested') {
        throw badRequest('This item is not eligible for resubmission')
      }

      // Check event status
      if (item.event_status === 'active' || item.event_status === 'ended' || item.event_status === 'cancelled') {
        throw badRequest('Cannot resubmit to this event')
      }

      // Check submission deadline
      if (item.submission_deadline && new Date() > new Date(item.submission_deadline)) {
        throw badRequest('Submission deadline has passed')
      }

      await dbQuery(
        `UPDATE event_items SET
          title = COALESCE(@title, title),
          description = COALESCE(@description, description),
          submission_status = 'pending',
          rejection_reason = NULL,
          allow_resubmit = 0,
          reviewed_by = NULL,
          reviewed_at = NULL,
          updated_at = GETUTCDATE()
         WHERE id = @id`,
        {
          id,
          title: title || null,
          description: description !== undefined ? description : null,
        }
      )

      res.json({ message: 'Item resubmitted for review' })
    } catch (error) {
      next(error)
    }
  }
)

// Upload images
router.post(
  '/:id/images',
  authenticate,
  param('id').isUUID(),
  upload.array('images', MAX_IMAGES_PER_ITEM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Invalid item ID format')
      }

      const { id } = req.params
      const userId = req.user!.id
      const files = req.files as Express.Multer.File[]

      if (!files || files.length === 0) {
        throw badRequest('No images provided')
      }

      // Get item
      const itemResult = await dbQuery(
        'SELECT * FROM event_items WHERE id = @id',
        { id }
      )

      if (itemResult.recordset.length === 0) {
        throw notFound('Item not found')
      }

      const item = itemResult.recordset[0]

      // Check permissions (submitter, or admin)
      const isSubmitter = item.submitted_by === userId
      const access = await checkEventAccess(item.event_id, userId)
      const isAdmin = !!access

      if (!isSubmitter && !isAdmin) {
        throw forbidden('You do not have permission to upload images')
      }

      // Check existing image count
      const countResult = await dbQuery(
        'SELECT COUNT(*) as count FROM event_item_images WHERE item_id = @id',
        { id }
      )
      const existingCount = countResult.recordset[0].count

      if (existingCount + files.length > MAX_IMAGES_PER_ITEM) {
        throw badRequest(`Maximum ${MAX_IMAGES_PER_ITEM} images allowed per item`)
      }

      // Upload images
      const uploadedImages = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const ext = file.originalname.split('.').pop() || 'jpg'
        const blobName = `event-items/${id}/${uuidv4()}.${ext}`

        const blobUrl = await uploadToBlob(file.buffer, blobName, file.mimetype)

        const isPrimary = existingCount === 0 && i === 0

        const result = await dbQuery(
          `INSERT INTO event_item_images (item_id, blob_url, display_order, is_primary, uploaded_by, created_at)
           OUTPUT INSERTED.*
           VALUES (@itemId, @blobUrl, @displayOrder, @isPrimary, @uploadedBy, GETUTCDATE())`,
          {
            itemId: id,
            blobUrl,
            displayOrder: existingCount + i,
            isPrimary: isPrimary ? 1 : 0,
            uploadedBy: userId,
          }
        )

        uploadedImages.push({
          id: result.recordset[0].id,
          blobUrl: result.recordset[0].blob_url,
          displayOrder: result.recordset[0].display_order,
          isPrimary: result.recordset[0].is_primary,
        })
      }

      res.status(201).json(uploadedImages)
    } catch (error) {
      next(error)
    }
  }
)

// Delete image
router.delete(
  '/:id/images/:imageId',
  authenticate,
  [
    param('id').isUUID(),
    param('imageId').isUUID(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Invalid ID format')
      }

      const { id, imageId } = req.params
      const userId = req.user!.id

      // Get item
      const itemResult = await dbQuery(
        'SELECT * FROM event_items WHERE id = @id',
        { id }
      )

      if (itemResult.recordset.length === 0) {
        throw notFound('Item not found')
      }

      const item = itemResult.recordset[0]

      // Check permissions
      const isSubmitter = item.submitted_by === userId
      const access = await checkEventAccess(item.event_id, userId)
      const isAdmin = !!access

      if (!isSubmitter && !isAdmin) {
        throw forbidden('You do not have permission to delete images')
      }

      // Get image
      const imageResult = await dbQuery(
        'SELECT * FROM event_item_images WHERE id = @imageId AND item_id = @itemId',
        { imageId, itemId: id }
      )

      if (imageResult.recordset.length === 0) {
        throw notFound('Image not found')
      }

      const image = imageResult.recordset[0]

      // Delete from blob storage
      try {
        await deleteBlob(image.blob_url)
      } catch (err) {
        console.error('Failed to delete blob:', err)
        // Continue even if blob deletion fails
      }

      // Delete from database
      await dbQuery(
        'DELETE FROM event_item_images WHERE id = @imageId',
        { imageId }
      )

      // If this was the primary image, set the next one as primary
      if (image.is_primary) {
        await dbQuery(
          `UPDATE event_item_images SET is_primary = 1
           WHERE item_id = @itemId AND id = (
             SELECT TOP 1 id FROM event_item_images
             WHERE item_id = @itemId
             ORDER BY display_order ASC
           )`,
          { itemId: id }
        )
      }

      res.status(204).send()
    } catch (error) {
      next(error)
    }
  }
)

// =====================================================
// Payment and Fulfillment Status Management (Self-Managed Payments)
// =====================================================

// Helper to generate tracking URL based on carrier
function getTrackingUrl(carrier: string, trackingNumber: string): string {
  const urls: Record<string, string> = {
    ups: `https://www.ups.com/track?tracknum=${trackingNumber}`,
    usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
    fedex: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
    dhl: `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`,
  }
  return urls[carrier.toLowerCase()] || ''
}

// Update payment status (org admin only)
router.patch(
  '/:id/payment-status',
  authenticate,
  [
    param('id').isUUID(),
    body('status').isIn(['pending', 'paid', 'payment_issue', 'waived', 'refunded']),
    body('paymentMethodUsed').optional().isString(),
    body('notes').optional().isString(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const { id } = req.params
      const userId = req.user!.id
      const { status, paymentMethodUsed, notes } = req.body

      // Get item with event info
      const itemResult = await dbQuery(
        `SELECT i.*, e.payment_mode, e.organization_id
         FROM event_items i
         INNER JOIN auction_events e ON i.event_id = e.id
         WHERE i.id = @id`,
        { id }
      )

      if (itemResult.recordset.length === 0) {
        throw notFound('Item not found')
      }

      const item = itemResult.recordset[0]

      // Check admin access to the event
      const access = await checkEventAccess(item.event_id, userId)
      if (!access) {
        throw forbidden('Only event admins can update payment status')
      }

      // Store old status for notification logic
      const oldStatus = item.payment_status

      // Update payment status
      const updateParams: Record<string, any> = {
        id,
        status,
        confirmedBy: userId,
        paymentMethodUsed: paymentMethodUsed || null,
        notes: notes || null,
      }

      await dbQuery(
        `UPDATE event_items SET
          payment_status = @status,
          payment_confirmed_at = ${status === 'paid' ? 'GETUTCDATE()' : 'payment_confirmed_at'},
          payment_confirmed_by = ${status === 'paid' ? '@confirmedBy' : 'payment_confirmed_by'},
          payment_method_used = COALESCE(@paymentMethodUsed, payment_method_used),
          payment_notes = COALESCE(@notes, payment_notes),
          updated_at = GETUTCDATE()
         WHERE id = @id`,
        updateParams
      )

      // TODO: Send notification to winner if status changed to 'paid'
      // if (status === 'paid' && oldStatus !== 'paid') {
      //   await sendPaymentConfirmedNotification(item)
      // }

      res.json({
        message: 'Payment status updated successfully',
        status,
        previousStatus: oldStatus,
      })
    } catch (error) {
      next(error)
    }
  }
)

// Update fulfillment status (org admin only)
router.patch(
  '/:id/fulfillment-status',
  authenticate,
  [
    param('id').isUUID(),
    body('status').isIn(['pending', 'processing', 'ready_for_pickup', 'shipped', 'out_for_delivery', 'delivered', 'picked_up', 'issue']),
    body('fulfillmentType').optional().isIn(['shipping', 'pickup', 'digital']),
    body('trackingNumber').optional().isString(),
    body('trackingCarrier').optional().isString(),
    body('estimatedDelivery').optional().isString(),
    body('pickupCompletedBy').optional().isString(),
    body('digitalDeliveryInfo').optional().isString(),
    body('notes').optional().isString(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const { id } = req.params
      const userId = req.user!.id
      const {
        status,
        fulfillmentType,
        trackingNumber,
        trackingCarrier,
        estimatedDelivery,
        pickupCompletedBy,
        digitalDeliveryInfo,
        notes,
      } = req.body

      // Get item with event info
      const itemResult = await dbQuery(
        `SELECT i.*, e.payment_mode, e.organization_id
         FROM event_items i
         INNER JOIN auction_events e ON i.event_id = e.id
         WHERE i.id = @id`,
        { id }
      )

      if (itemResult.recordset.length === 0) {
        throw notFound('Item not found')
      }

      const item = itemResult.recordset[0]

      // Check admin access to the event
      const access = await checkEventAccess(item.event_id, userId)
      if (!access) {
        throw forbidden('Only event admins can update fulfillment status')
      }

      // Store old status for notification logic
      const oldStatus = item.fulfillment_status

      // Generate tracking URL if shipping info provided
      let trackingUrl = null
      if (trackingNumber && trackingCarrier) {
        trackingUrl = getTrackingUrl(trackingCarrier, trackingNumber)
      }

      // Build the update
      await dbQuery(
        `UPDATE event_items SET
          fulfillment_status = @status,
          fulfillment_type = COALESCE(@fulfillmentType, fulfillment_type),
          tracking_number = COALESCE(@trackingNumber, tracking_number),
          tracking_carrier = COALESCE(@trackingCarrier, tracking_carrier),
          tracking_url = COALESCE(@trackingUrl, tracking_url),
          estimated_delivery = COALESCE(@estimatedDelivery, estimated_delivery),
          shipped_at = ${status === 'shipped' ? 'GETUTCDATE()' : 'shipped_at'},
          pickup_ready_at = ${status === 'ready_for_pickup' ? 'GETUTCDATE()' : 'pickup_ready_at'},
          pickup_completed_at = ${status === 'picked_up' ? 'GETUTCDATE()' : 'pickup_completed_at'},
          pickup_completed_by = COALESCE(@pickupCompletedBy, pickup_completed_by),
          digital_delivery_info = COALESCE(@digitalDeliveryInfo, digital_delivery_info),
          digital_delivered_at = ${status === 'delivered' && fulfillmentType === 'digital' ? 'GETUTCDATE()' : 'digital_delivered_at'},
          fulfillment_notes = COALESCE(@notes, fulfillment_notes),
          fulfilled_at = ${['delivered', 'picked_up'].includes(status) ? 'GETUTCDATE()' : 'fulfilled_at'},
          fulfilled_by = ${['delivered', 'picked_up'].includes(status) ? '@fulfilledBy' : 'fulfilled_by'},
          updated_at = GETUTCDATE()
         WHERE id = @id`,
        {
          id,
          status,
          fulfillmentType: fulfillmentType || null,
          trackingNumber: trackingNumber || null,
          trackingCarrier: trackingCarrier || null,
          trackingUrl: trackingUrl || null,
          estimatedDelivery: estimatedDelivery || null,
          pickupCompletedBy: pickupCompletedBy || null,
          digitalDeliveryInfo: digitalDeliveryInfo || null,
          notes: notes || null,
          fulfilledBy: userId,
        }
      )

      // TODO: Send notifications based on status change
      // if (status === 'shipped' && oldStatus !== 'shipped') {
      //   await sendItemShippedNotification(item, trackingNumber, trackingCarrier, trackingUrl)
      // }
      // if (status === 'ready_for_pickup' && oldStatus !== 'ready_for_pickup') {
      //   await sendReadyForPickupNotification(item)
      // }

      res.json({
        message: 'Fulfillment status updated successfully',
        status,
        previousStatus: oldStatus,
        tracking: trackingNumber ? { number: trackingNumber, carrier: trackingCarrier, url: trackingUrl } : null,
      })
    } catch (error) {
      next(error)
    }
  }
)

// Get payment summary for an event (org admin only)
router.get(
  '/events/:eventId/payment-summary',
  authenticate,
  param('eventId').isString(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { eventId: eventIdOrSlug } = req.params
      const userId = req.user!.id

      // Resolve event ID from ID or slug
      const eventId = await resolveEventId(eventIdOrSlug)
      if (!eventId) {
        throw notFound('Event not found')
      }

      // Check admin access
      const access = await checkEventAccess(eventId, userId)
      if (!access) {
        throw forbidden('Only event admins can view payment summary')
      }

      // Get summary counts and values by status
      const summaryResult = await dbQuery(
        `SELECT
          payment_status,
          COUNT(*) as count,
          COALESCE(SUM(current_bid), 0) as total_value
         FROM event_items
         WHERE event_id = @eventId
           AND winner_id IS NOT NULL
         GROUP BY payment_status`,
        { eventId }
      )

      // Get all items with winner info
      const itemsResult = await dbQuery(
        `SELECT i.*, u.display_name as winner_name, u.email as winner_email
         FROM event_items i
         LEFT JOIN users u ON i.winner_id = u.id
         WHERE i.event_id = @eventId
           AND i.winner_id IS NOT NULL
         ORDER BY i.payment_status, i.updated_at DESC`,
        { eventId }
      )

      // Build summary object
      const byStatus: Record<string, { count: number; value: number }> = {
        pending: { count: 0, value: 0 },
        paid: { count: 0, value: 0 },
        payment_issue: { count: 0, value: 0 },
        waived: { count: 0, value: 0 },
        refunded: { count: 0, value: 0 },
      }

      let totalItems = 0
      let totalValue = 0

      for (const row of summaryResult.recordset) {
        const status = row.payment_status || 'pending'
        if (byStatus[status]) {
          byStatus[status].count = row.count
          byStatus[status].value = parseFloat(row.total_value)
        }
        totalItems += row.count
        totalValue += parseFloat(row.total_value)
      }

      // Get images for items
      const itemIds = itemsResult.recordset.map((i: any) => i.id)
      let images: any[] = []
      if (itemIds.length > 0) {
        const imageResult = await dbQuery(
          `SELECT * FROM event_item_images
           WHERE item_id IN (${itemIds.map((_: any, idx: number) => `@id${idx}`).join(',')})
             AND is_primary = 1`,
          itemIds.reduce((acc: any, id: string, idx: number) => ({ ...acc, [`id${idx}`]: id }), {})
        )
        images = imageResult.recordset
      }

      const items = itemsResult.recordset.map((item: any) => {
        const primaryImage = images.find((img: any) => img.item_id === item.id)
        return {
          id: item.id,
          title: item.title,
          imageUrl: primaryImage?.blob_url || null,
          winningBid: item.current_bid ? parseFloat(item.current_bid) : null,
          wonAt: item.won_at,
          winner: {
            id: item.winner_id,
            name: item.winner_name,
            email: item.winner_email,
          },
          paymentStatus: item.payment_status || 'pending',
          paymentConfirmedAt: item.payment_confirmed_at,
          paymentMethodUsed: item.payment_method_used,
          paymentNotes: item.payment_notes,
          fulfillmentStatus: item.fulfillment_status || 'pending',
          fulfillmentType: item.fulfillment_type,
        }
      })

      res.json({
        totalItems,
        totalValue,
        byStatus,
        items,
      })
    } catch (error) {
      next(error)
    }
  }
)

// Get fulfillment summary for an event (org admin only)
router.get(
  '/events/:eventId/fulfillment-summary',
  authenticate,
  param('eventId').isString(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { eventId: eventIdOrSlug } = req.params
      const userId = req.user!.id

      // Resolve event ID from ID or slug
      const eventId = await resolveEventId(eventIdOrSlug)
      if (!eventId) {
        throw notFound('Event not found')
      }

      // Check admin access
      const access = await checkEventAccess(eventId, userId)
      if (!access) {
        throw forbidden('Only event admins can view fulfillment summary')
      }

      // Get summary counts by fulfillment status
      const summaryResult = await dbQuery(
        `SELECT
          fulfillment_status,
          COUNT(*) as count
         FROM event_items
         WHERE event_id = @eventId
           AND winner_id IS NOT NULL
         GROUP BY fulfillment_status`,
        { eventId }
      )

      // Build summary object
      const byStatus: Record<string, number> = {
        pending: 0,
        processing: 0,
        ready_for_pickup: 0,
        shipped: 0,
        out_for_delivery: 0,
        delivered: 0,
        picked_up: 0,
        issue: 0,
      }

      for (const row of summaryResult.recordset) {
        const status = row.fulfillment_status || 'pending'
        if (Object.prototype.hasOwnProperty.call(byStatus, status)) {
          byStatus[status] = row.count
        }
      }

      // Get all items with fulfillment details
      const itemsResult = await dbQuery(
        `SELECT i.*, u.display_name as winner_name, u.email as winner_email
         FROM event_items i
         LEFT JOIN users u ON i.winner_id = u.id
         WHERE i.event_id = @eventId
           AND i.winner_id IS NOT NULL
         ORDER BY
           CASE fulfillment_status
             WHEN 'pending' THEN 1
             WHEN 'processing' THEN 2
             WHEN 'ready_for_pickup' THEN 3
             WHEN 'shipped' THEN 4
             WHEN 'out_for_delivery' THEN 5
             WHEN 'delivered' THEN 6
             WHEN 'picked_up' THEN 6
             WHEN 'issue' THEN 0
             ELSE 7
           END,
           i.updated_at DESC`,
        { eventId }
      )

      // Get images for items
      const itemIds = itemsResult.recordset.map((i: any) => i.id)
      let images: any[] = []
      if (itemIds.length > 0) {
        const imageResult = await dbQuery(
          `SELECT * FROM event_item_images
           WHERE item_id IN (${itemIds.map((_: any, idx: number) => `@id${idx}`).join(',')})
             AND is_primary = 1`,
          itemIds.reduce((acc: any, id: string, idx: number) => ({ ...acc, [`id${idx}`]: id }), {})
        )
        images = imageResult.recordset
      }

      const items = itemsResult.recordset.map((item: any) => {
        const primaryImage = images.find((img: any) => img.item_id === item.id)
        return {
          id: item.id,
          title: item.title,
          imageUrl: primaryImage?.blob_url || null,
          winningBid: item.current_bid ? parseFloat(item.current_bid) : null,
          winner: {
            id: item.winner_id,
            name: item.winner_name,
            email: item.winner_email,
          },
          paymentStatus: item.payment_status || 'pending',
          fulfillmentStatus: item.fulfillment_status || 'pending',
          fulfillmentType: item.fulfillment_type,
          tracking: item.tracking_number ? {
            number: item.tracking_number,
            carrier: item.tracking_carrier,
            url: item.tracking_url,
            estimatedDelivery: item.estimated_delivery,
          } : null,
          shippedAt: item.shipped_at,
          pickupReadyAt: item.pickup_ready_at,
          fulfilledAt: item.fulfilled_at,
          fulfillmentNotes: item.fulfillment_notes,
        }
      })

      res.json({
        byStatus,
        items,
      })
    } catch (error) {
      next(error)
    }
  }
)

// Bulk update payment status (org admin only)
router.post(
  '/events/:eventId/bulk-payment-status',
  authenticate,
  [
    param('eventId').isString(),
    body('itemIds').isArray({ min: 1 }),
    body('status').isIn(['paid', 'payment_issue', 'waived']),
    body('paymentMethodUsed').optional().isString(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const { eventId: eventIdOrSlug } = req.params
      const userId = req.user!.id
      const { itemIds, status, paymentMethodUsed } = req.body

      // Resolve event ID
      const eventId = await resolveEventId(eventIdOrSlug)
      if (!eventId) {
        throw notFound('Event not found')
      }

      // Check admin access
      const access = await checkEventAccess(eventId, userId)
      if (!access) {
        throw forbidden('Only event admins can update payment status')
      }

      // Build parameterized query for item IDs
      const itemIdParams = itemIds.reduce((acc: any, id: string, idx: number) => ({
        ...acc,
        [`itemId${idx}`]: id,
      }), {})
      const itemIdPlaceholders = itemIds.map((_: any, idx: number) => `@itemId${idx}`).join(',')

      // Update all items
      await dbQuery(
        `UPDATE event_items SET
          payment_status = @status,
          payment_confirmed_at = ${status === 'paid' ? 'GETUTCDATE()' : 'payment_confirmed_at'},
          payment_confirmed_by = ${status === 'paid' ? '@confirmedBy' : 'payment_confirmed_by'},
          payment_method_used = COALESCE(@paymentMethodUsed, payment_method_used),
          updated_at = GETUTCDATE()
         WHERE id IN (${itemIdPlaceholders})
           AND event_id = @eventId`,
        {
          ...itemIdParams,
          eventId,
          status,
          confirmedBy: userId,
          paymentMethodUsed: paymentMethodUsed || null,
        }
      )

      res.json({
        message: `Updated ${itemIds.length} items to ${status}`,
        count: itemIds.length,
      })
    } catch (error) {
      next(error)
    }
  }
)

// Bulk update fulfillment status (org admin only)
router.post(
  '/events/:eventId/bulk-fulfillment-status',
  authenticate,
  [
    param('eventId').isString(),
    body('itemIds').isArray({ min: 1 }),
    body('status').isIn(['processing', 'ready_for_pickup', 'shipped', 'delivered', 'picked_up']),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const { eventId: eventIdOrSlug } = req.params
      const userId = req.user!.id
      const { itemIds, status } = req.body

      // Resolve event ID
      const eventId = await resolveEventId(eventIdOrSlug)
      if (!eventId) {
        throw notFound('Event not found')
      }

      // Check admin access
      const access = await checkEventAccess(eventId, userId)
      if (!access) {
        throw forbidden('Only event admins can update fulfillment status')
      }

      // Build parameterized query for item IDs
      const itemIdParams = itemIds.reduce((acc: any, id: string, idx: number) => ({
        ...acc,
        [`itemId${idx}`]: id,
      }), {})
      const itemIdPlaceholders = itemIds.map((_: any, idx: number) => `@itemId${idx}`).join(',')

      // Update all items
      await dbQuery(
        `UPDATE event_items SET
          fulfillment_status = @status,
          pickup_ready_at = ${status === 'ready_for_pickup' ? 'GETUTCDATE()' : 'pickup_ready_at'},
          fulfilled_at = ${['delivered', 'picked_up'].includes(status) ? 'GETUTCDATE()' : 'fulfilled_at'},
          fulfilled_by = ${['delivered', 'picked_up'].includes(status) ? '@fulfilledBy' : 'fulfilled_by'},
          updated_at = GETUTCDATE()
         WHERE id IN (${itemIdPlaceholders})
           AND event_id = @eventId`,
        {
          ...itemIdParams,
          eventId,
          status,
          fulfilledBy: userId,
        }
      )

      res.json({
        message: `Updated ${itemIds.length} items to ${status}`,
        count: itemIds.length,
      })
    } catch (error) {
      next(error)
    }
  }
)

// Get won items for an event (org admin only)
router.get(
  '/events/:eventId/won-items',
  authenticate,
  param('eventId').isString(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { eventId: eventIdOrSlug } = req.params
      const userId = req.user!.id

      // Resolve event ID from ID or slug
      const eventId = await resolveEventId(eventIdOrSlug)
      if (!eventId) {
        throw notFound('Event not found')
      }

      // Check admin access
      const access = await checkEventAccess(eventId, userId)
      if (!access) {
        throw forbidden('Only event admins can view won items')
      }

      // Get all items with winners
      const itemsResult = await dbQuery(
        `SELECT i.*,
                u.display_name as winner_name,
                u.email as winner_email,
                e.payment_mode,
                e.payment_instructions,
                e.payment_link,
                e.fulfillment_type as event_fulfillment_type
         FROM event_items i
         LEFT JOIN users u ON i.winner_id = u.id
         LEFT JOIN auction_events e ON i.event_id = e.id
         WHERE i.event_id = @eventId
           AND i.winner_id IS NOT NULL
         ORDER BY i.updated_at DESC`,
        { eventId }
      )

      // Get images for items
      const itemIds = itemsResult.recordset.map((i: any) => i.id)
      let images: any[] = []
      if (itemIds.length > 0) {
        const imageResult = await dbQuery(
          `SELECT * FROM event_item_images
           WHERE item_id IN (${itemIds.map((_: any, idx: number) => `@id${idx}`).join(',')})
           ORDER BY display_order`,
          itemIds.reduce((acc: any, id: string, idx: number) => ({ ...acc, [`id${idx}`]: id }), {})
        )
        images = imageResult.recordset
      }

      const items = itemsResult.recordset.map((item: any) => {
        const itemImages = images
          .filter((img: any) => img.item_id === item.id)
          .map((img: any) => ({
            id: img.id,
            blobUrl: img.blob_url,
            displayOrder: img.display_order,
            isPrimary: img.is_primary,
          }))

        return {
          id: item.id,
          eventId: item.event_id,
          title: item.title,
          description: item.description,
          condition: item.condition,
          currentBid: item.current_bid ? parseFloat(item.current_bid) : null,
          bidCount: item.bid_count,
          status: item.status,
          images: itemImages,
          // Winner info
          winnerId: item.winner_id,
          winnerName: item.winner_name,
          winnerEmail: item.winner_email,
          winningBid: item.current_bid ? parseFloat(item.current_bid) : null,
          // Payment tracking
          paymentStatus: item.payment_status || 'pending',
          paymentConfirmedAt: item.payment_confirmed_at,
          paymentConfirmedBy: item.payment_confirmed_by,
          paymentMethodUsed: item.payment_method_used,
          paymentNotes: item.payment_notes,
          // Fulfillment tracking
          fulfillmentStatus: item.fulfillment_status || 'pending',
          fulfillmentType: item.fulfillment_type || item.event_fulfillment_type,
          trackingNumber: item.tracking_number,
          trackingCarrier: item.tracking_carrier,
          trackingUrl: item.tracking_url,
          shippedAt: item.shipped_at,
          estimatedDelivery: item.estimated_delivery,
          pickupReadyAt: item.pickup_ready_at,
          pickupCompletedAt: item.pickup_completed_at,
          pickupCompletedBy: item.pickup_completed_by,
          digitalDeliveryInfo: item.digital_delivery_info,
          digitalDeliveredAt: item.digital_delivered_at,
          fulfillmentNotes: item.fulfillment_notes,
          fulfilledAt: item.fulfilled_at,
          fulfilledBy: item.fulfilled_by,
          createdAt: item.created_at,
        }
      })

      res.json(items)
    } catch (error) {
      next(error)
    }
  }
)

export { router as eventItemRoutes }
