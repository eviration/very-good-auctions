import { Router, Request, Response, NextFunction } from 'express'
import { body, param, query, validationResult } from 'express-validator'
import multer from 'multer'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { authenticate, optionalAuth } from '../middleware/auth.js'
import { query as dbQuery } from '../config/database.js'
import { badRequest, notFound, forbidden } from '../middleware/errorHandler.js'
import {
  PLATFORM_FEE_PER_ITEM,
  publishEvent,
  processEventCancellation,
} from '../services/platformFees.js'
import { uploadToBlob, deleteImage } from '../services/storage.js'

const router = Router()

// Multer configuration for cover image uploads
const coverImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for cover images
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Allowed: jpg, jpeg, png, gif, webp'))
    }
  },
})

// Access code alphabet (no confusing characters: 0/O, 1/I/L)
const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

// Pricing info - $1 per item sold (taken from proceeds)
const PRICING_INFO = {
  feePerItem: PLATFORM_FEE_PER_ITEM,
  description: 'Free to create. $1 per item sold (deducted from proceeds).',
}

// Helper function to generate slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// Helper to generate access code
function generateAccessCode(): string {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += ACCESS_CODE_ALPHABET[Math.floor(Math.random() * ACCESS_CODE_ALPHABET.length)]
  }
  return code
}

// Helper to check if user is org member with specific role
async function checkOrgMembership(orgId: string, userId: string, requiredRoles?: string[]) {
  const result = await dbQuery(
    `SELECT role, can_create_auctions, can_manage_members, can_view_financials
     FROM organization_members
     WHERE organization_id = @orgId AND user_id = @userId`,
    { orgId, userId }
  )

  if (result.recordset.length === 0) {
    return null
  }

  const membership = result.recordset[0]
  if (requiredRoles && !requiredRoles.includes(membership.role)) {
    return null
  }

  return membership
}

// Helper to check event ownership/admin access
async function checkEventAccess(eventId: string, userId: string, requireOwner = false) {
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

  if (requireOwner && userRole !== 'owner') {
    return null
  }

  // Admins and owners can manage events
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

// Create event
router.post(
  '/',
  authenticate,
  [
    body('name').isString().isLength({ min: 2, max: 255 }),
    body('description').optional().isString(),
    body('organizationId').optional({ values: 'falsy' }).isUUID(),
    body('startTime').isISO8601(),
    body('endTime').isISO8601(),
    body('submissionDeadline').optional().isISO8601(),
    body('auctionType').optional().isIn(['standard', 'silent']),
    body('isMultiItem').optional().isBoolean(),
    body('incrementType').optional().isIn(['fixed', 'percent']),
    body('incrementValue').optional().isFloat({ min: 0.01 }),
    body('buyNowEnabled').optional().isBoolean(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        console.log('Validation errors:', JSON.stringify(errors.mapped(), null, 2))
        console.log('Request body:', JSON.stringify(req.body, null, 2))
        throw badRequest('Validation failed', errors.mapped())
      }

      const userId = req.user!.id
      const {
        name,
        description,
        organizationId,
        startTime,
        endTime,
        submissionDeadline,
        auctionType = 'standard',
        isMultiItem = true,
        incrementType = 'fixed',
        incrementValue = 1.0,
        buyNowEnabled = false,
      } = req.body

      // Ensure user exists in database
      await ensureUserExists(userId, req.user!.email, req.user!.name)

      // If organization event, check permissions and Stripe Connect status
      if (organizationId) {
        const membership = await checkOrgMembership(organizationId, userId, ['owner', 'admin'])
        if (!membership) {
          throw forbidden('Only organization owners and admins can create events')
        }

        // Check if organization has completed Stripe Connect verification
        const orgResult = await dbQuery(
          `SELECT stripe_charges_enabled, stripe_payouts_enabled, name
           FROM organizations WHERE id = @orgId`,
          { orgId: organizationId }
        )

        if (orgResult.recordset.length === 0) {
          throw notFound('Organization not found')
        }

        const org = orgResult.recordset[0]
        if (!org.stripe_charges_enabled || !org.stripe_payouts_enabled) {
          throw badRequest(
            `Cannot create an auction for "${org.name}" until Stripe Connect setup is complete. ` +
            'Please complete the payment verification process in your organization settings.'
          )
        }
      }

      // Validate dates
      const start = new Date(startTime)
      const end = new Date(endTime)
      if (end <= start) {
        throw badRequest('End time must be after start time')
      }

      if (submissionDeadline) {
        const deadline = new Date(submissionDeadline)
        if (deadline > start) {
          throw badRequest('Submission deadline must be before start time')
        }
      }

      // Generate unique slug
      let slug = generateSlug(name)
      let slugSuffix = 0
      let slugExists = true
      while (slugExists) {
        const candidateSlug = slugSuffix > 0 ? `${slug}-${slugSuffix}` : slug
        const existing = await dbQuery(
          `SELECT id FROM auction_events
           WHERE slug = @slug AND (
             (organization_id IS NULL AND @orgId IS NULL) OR
             (organization_id = @orgId)
           )`,
          { slug: candidateSlug, orgId: organizationId || null }
        )
        if (existing.recordset.length === 0) {
          slug = candidateSlug
          slugExists = false
        } else {
          slugSuffix++
        }
      }

      // Generate access code
      const accessCode = generateAccessCode()

      // Create event (no tier/maxItems - unlimited items, fees taken from proceeds)
      const result = await dbQuery(
        `INSERT INTO auction_events (
          organization_id, owner_id, name, slug, description,
          start_time, end_time, submission_deadline,
          auction_type, is_multi_item, increment_type, increment_value,
          buy_now_enabled, access_code, status,
          created_by, created_at, updated_at
        ) OUTPUT INSERTED.*
        VALUES (
          @organizationId, @ownerId, @name, @slug, @description,
          @startTime, @endTime, @submissionDeadline,
          @auctionType, @isMultiItem, @incrementType, @incrementValue,
          @buyNowEnabled, @accessCode, 'draft',
          @createdBy, GETUTCDATE(), GETUTCDATE()
        )`,
        {
          organizationId: organizationId || null,
          ownerId: organizationId ? null : userId,
          name,
          slug,
          description: description || null,
          startTime: start,
          endTime: end,
          submissionDeadline: submissionDeadline ? new Date(submissionDeadline) : null,
          auctionType,
          isMultiItem: isMultiItem ? 1 : 0,
          incrementType,
          incrementValue,
          buyNowEnabled: buyNowEnabled ? 1 : 0,
          accessCode,
          createdBy: userId,
        }
      )

      const event = result.recordset[0]

      res.status(201).json({
        id: event.id,
        name: event.name,
        slug: event.slug,
        description: event.description,
        organizationId: event.organization_id,
        ownerId: event.owner_id,
        startTime: event.start_time,
        endTime: event.end_time,
        submissionDeadline: event.submission_deadline,
        auctionType: event.auction_type,
        isMultiItem: event.is_multi_item,
        incrementType: event.increment_type,
        incrementValue: event.increment_value,
        buyNowEnabled: event.buy_now_enabled,
        accessCode: event.access_code,
        status: event.status,
        createdAt: event.created_at,
      })
    } catch (error) {
      next(error)
    }
  }
)

// List public events
router.get(
  '/',
  optionalAuth,
  [
    query('page').optional().isInt({ min: 1 }),
    query('pageSize').optional().isInt({ min: 1, max: 50 }),
    query('status').optional().isIn(['scheduled', 'active', 'ended']),
    query('auctionType').optional().isIn(['standard', 'silent']),
    query('organizationId').optional().isUUID(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1
      const pageSize = parseInt(req.query.pageSize as string) || 12
      const status = req.query.status as string
      const auctionType = req.query.auctionType as string
      const organizationId = req.query.organizationId as string
      const offset = (page - 1) * pageSize

      // Use 'e.' prefix for column names to avoid ambiguity with JOINed tables
      let whereClause = "WHERE e.status IN ('scheduled', 'active', 'ended')"
      const params: Record<string, any> = {}

      if (status) {
        whereClause = "WHERE e.status = @status"
        params.status = status
      }

      if (auctionType) {
        whereClause += " AND e.auction_type = @auctionType"
        params.auctionType = auctionType
      }

      if (organizationId) {
        whereClause += " AND e.organization_id = @organizationId"
        params.organizationId = organizationId
      }

      // Get total count (use 'e' alias to match whereClause)
      let countResult
      try {
        countResult = await dbQuery(
          `SELECT COUNT(*) as total FROM auction_events e ${whereClause}`,
          params
        )
      } catch (err) {
        console.error('Count query failed:', err)
        throw err
      }
      const totalItems = countResult.recordset[0].total

      // Get events with pagination
      const result = await dbQuery(
        `SELECT e.*, o.name as organization_name, o.slug as organization_slug,
                u.display_name as owner_name
         FROM auction_events e
         LEFT JOIN organizations o ON e.organization_id = o.id
         LEFT JOIN users u ON e.owner_id = u.id
         ${whereClause}
         ORDER BY
           CASE e.status WHEN 'active' THEN 1 WHEN 'scheduled' THEN 2 ELSE 3 END,
           e.start_time ASC
         OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`,
        { ...params, offset, pageSize }
      )

      const events = result.recordset.map((e: any) => ({
        id: e.id,
        name: e.name,
        slug: e.slug,
        description: e.description,
        coverImageUrl: e.cover_image_url,
        organization: e.organization_id ? {
          id: e.organization_id,
          name: e.organization_name,
          slug: e.organization_slug,
        } : null,
        owner: e.owner_id ? {
          id: e.owner_id,
          name: e.owner_name,
        } : null,
        startTime: e.start_time,
        endTime: e.end_time,
        auctionType: e.auction_type,
        status: e.status,
        itemCount: e.item_count,
        totalBids: e.total_bids,
        totalRaised: e.total_raised,
      }))

      res.json({
        data: events,
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

// Helper to check if string is a valid UUID
function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

// Get event by ID or slug
router.get(
  '/:idOrSlug',
  optionalAuth,
  param('idOrSlug').isString(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { idOrSlug } = req.params
      const userId = req.user?.id

      // Determine if this is a UUID or slug
      const isId = isUUID(idOrSlug)

      const result = await dbQuery(
        `SELECT e.*, o.name as organization_name, o.slug as organization_slug,
                u.display_name as owner_name, u.display_name as creator_name
         FROM auction_events e
         LEFT JOIN organizations o ON e.organization_id = o.id
         LEFT JOIN users u ON e.owner_id = u.id
         WHERE ${isId ? 'e.id = @idOrSlug' : 'e.slug = @idOrSlug'}`,
        { idOrSlug }
      )

      if (result.recordset.length === 0) {
        throw notFound('Event not found')
      }

      const event = result.recordset[0]

      // Check if user has admin access
      let isAdmin = false
      let accessCode = null

      if (userId) {
        if (event.owner_id === userId) {
          isAdmin = true
          accessCode = event.access_code
        } else if (event.organization_id) {
          const membership = await checkOrgMembership(event.organization_id, userId, ['owner', 'admin'])
          if (membership) {
            isAdmin = true
            accessCode = event.access_code
          }
        }
      }

      res.json({
        id: event.id,
        name: event.name,
        slug: event.slug,
        description: event.description,
        coverImageUrl: event.cover_image_url,
        organization: event.organization_id ? {
          id: event.organization_id,
          name: event.organization_name,
          slug: event.organization_slug,
        } : null,
        owner: event.owner_id ? {
          id: event.owner_id,
          name: event.owner_name,
        } : null,
        startTime: event.start_time,
        endTime: event.end_time,
        submissionDeadline: event.submission_deadline,
        auctionType: event.auction_type,
        isMultiItem: event.is_multi_item,
        incrementType: event.increment_type,
        incrementValue: parseFloat(event.increment_value),
        buyNowEnabled: event.buy_now_enabled,
        tier: event.tier,
        maxItems: event.max_items,
        status: event.status,
        itemCount: event.item_count,
        totalBids: event.total_bids,
        totalRaised: parseFloat(event.total_raised || 0),
        createdAt: event.created_at,
        // Only show access code to admins
        ...(isAdmin ? { accessCode } : {}),
        isAdmin,
      })
    } catch (error) {
      next(error)
    }
  }
)

// Get event by slug
router.get(
  '/by-slug/:slug',
  optionalAuth,
  param('slug').isString(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { slug } = req.params
      const organizationSlug = req.query.org as string
      const userId = req.user?.id

      let whereClause = 'WHERE e.slug = @slug'
      const params: Record<string, any> = { slug }

      if (organizationSlug) {
        whereClause += ' AND o.slug = @orgSlug'
        params.orgSlug = organizationSlug
      } else {
        whereClause += ' AND e.organization_id IS NULL'
      }

      const result = await dbQuery(
        `SELECT e.*, o.name as organization_name, o.slug as organization_slug,
                u.display_name as owner_name
         FROM auction_events e
         LEFT JOIN organizations o ON e.organization_id = o.id
         LEFT JOIN users u ON e.owner_id = u.id
         ${whereClause}`,
        params
      )

      if (result.recordset.length === 0) {
        throw notFound('Event not found')
      }

      const event = result.recordset[0]

      // Check if user has admin access
      let isAdmin = false
      let accessCode = null

      if (userId) {
        if (event.owner_id === userId) {
          isAdmin = true
          accessCode = event.access_code
        } else if (event.organization_id) {
          const membership = await checkOrgMembership(event.organization_id, userId, ['owner', 'admin'])
          if (membership) {
            isAdmin = true
            accessCode = event.access_code
          }
        }
      }

      res.json({
        id: event.id,
        name: event.name,
        slug: event.slug,
        description: event.description,
        coverImageUrl: event.cover_image_url,
        organization: event.organization_id ? {
          id: event.organization_id,
          name: event.organization_name,
          slug: event.organization_slug,
        } : null,
        owner: event.owner_id ? {
          id: event.owner_id,
          name: event.owner_name,
        } : null,
        startTime: event.start_time,
        endTime: event.end_time,
        submissionDeadline: event.submission_deadline,
        auctionType: event.auction_type,
        isMultiItem: event.is_multi_item,
        incrementType: event.increment_type,
        incrementValue: parseFloat(event.increment_value),
        buyNowEnabled: event.buy_now_enabled,
        tier: event.tier,
        maxItems: event.max_items,
        status: event.status,
        itemCount: event.item_count,
        totalBids: event.total_bids,
        totalRaised: parseFloat(event.total_raised || 0),
        createdAt: event.created_at,
        ...(isAdmin ? { accessCode } : {}),
        isAdmin,
      })
    } catch (error) {
      next(error)
    }
  }
)

// Update event
router.put(
  '/:id',
  authenticate,
  [
    param('id').isUUID(),
    body('name').optional().isString().isLength({ min: 2, max: 255 }),
    body('description').optional().isString(),
    body('startTime').optional().isISO8601(),
    body('endTime').optional().isISO8601(),
    body('submissionDeadline').optional().isISO8601(),
    body('incrementType').optional().isIn(['fixed', 'percent']),
    body('incrementValue').optional().isFloat({ min: 0.01 }),
    body('buyNowEnabled').optional().isBoolean(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const { id } = req.params
      const userId = req.user!.id

      // Check access
      const access = await checkEventAccess(id, userId)
      if (!access) {
        throw forbidden('You do not have permission to update this event')
      }

      const { event } = access

      // Cannot update if event is active or ended
      if (event.status === 'active' || event.status === 'ended') {
        throw badRequest('Cannot update an active or ended event')
      }

      const {
        name,
        description,
        startTime,
        endTime,
        submissionDeadline,
        incrementType,
        incrementValue,
        buyNowEnabled,
      } = req.body

      await dbQuery(
        `UPDATE auction_events SET
          name = COALESCE(@name, name),
          description = COALESCE(@description, description),
          start_time = COALESCE(@startTime, start_time),
          end_time = COALESCE(@endTime, end_time),
          submission_deadline = COALESCE(@submissionDeadline, submission_deadline),
          increment_type = COALESCE(@incrementType, increment_type),
          increment_value = COALESCE(@incrementValue, increment_value),
          buy_now_enabled = COALESCE(@buyNowEnabled, buy_now_enabled),
          updated_at = GETUTCDATE()
         WHERE id = @id`,
        {
          id,
          name: name || null,
          description: description !== undefined ? description : null,
          startTime: startTime ? new Date(startTime) : null,
          endTime: endTime ? new Date(endTime) : null,
          submissionDeadline: submissionDeadline ? new Date(submissionDeadline) : null,
          incrementType: incrementType || null,
          incrementValue: incrementValue || null,
          buyNowEnabled: buyNowEnabled !== undefined ? (buyNowEnabled ? 1 : 0) : null,
        }
      )

      res.json({ message: 'Event updated successfully' })
    } catch (error) {
      next(error)
    }
  }
)

// Cancel event
router.delete(
  '/:id',
  authenticate,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Invalid event ID format')
      }

      const { id } = req.params
      const userId = req.user!.id

      // Check access (owner only)
      const access = await checkEventAccess(id, userId, true)
      if (!access) {
        throw forbidden('Only the owner can cancel this event')
      }

      const { event } = access

      // Cannot cancel if ended
      if (event.status === 'ended') {
        throw badRequest('Cannot cancel an ended event')
      }

      // Update status to cancelled
      await dbQuery(
        `UPDATE auction_events SET status = 'cancelled', updated_at = GETUTCDATE() WHERE id = @id`,
        { id }
      )

      // TODO: Notify all bidders that the event has been cancelled

      res.json({ message: 'Event cancelled successfully' })
    } catch (error) {
      next(error)
    }
  }
)

// Verify access code
router.post(
  '/:id/verify-code',
  optionalAuth,
  [
    param('id').isUUID(),
    body('code').isString().isLength({ min: 6, max: 6 }),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const { id } = req.params
      const { code } = req.body

      const result = await dbQuery(
        'SELECT access_code, status FROM auction_events WHERE id = @id',
        { id }
      )

      if (result.recordset.length === 0) {
        throw notFound('Event not found')
      }

      const event = result.recordset[0]

      if (event.status === 'cancelled') {
        throw badRequest('This event has been cancelled')
      }

      const isValid = event.access_code.toUpperCase() === code.toUpperCase()

      res.json({ valid: isValid })
    } catch (error) {
      next(error)
    }
  }
)

// Get submission link (admin only)
router.get(
  '/:id/submission-link',
  authenticate,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Invalid event ID format')
      }

      const { id } = req.params
      const userId = req.user!.id

      // Check access
      const access = await checkEventAccess(id, userId)
      if (!access) {
        throw forbidden('You do not have permission to access this event')
      }

      const { event } = access
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
      const submissionUrl = `${frontendUrl}/submit/${event.slug}?code=${event.access_code}`

      res.json({
        url: submissionUrl,
        accessCode: event.access_code,
        slug: event.slug,
      })
    } catch (error) {
      next(error)
    }
  }
)

// Regenerate access code (admin only)
router.post(
  '/:id/regenerate-code',
  authenticate,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Invalid event ID format')
      }

      const { id } = req.params
      const userId = req.user!.id

      // Check access
      const access = await checkEventAccess(id, userId)
      if (!access) {
        throw forbidden('You do not have permission to access this event')
      }

      const newCode = generateAccessCode()

      await dbQuery(
        'UPDATE auction_events SET access_code = @code, updated_at = GETUTCDATE() WHERE id = @id',
        { id, code: newCode }
      )

      res.json({ accessCode: newCode })
    } catch (error) {
      next(error)
    }
  }
)

// Publish event (no payment required - fees taken from proceeds)
router.post(
  '/:id/publish',
  authenticate,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Invalid event ID format')
      }

      const { id } = req.params
      const userId = req.user!.id

      // Publish event directly (no payment required)
      const result = await publishEvent(id, userId)

      res.json({
        success: result.success,
        eventName: result.eventName,
        message: result.message,
        feeInfo: {
          feePerItem: PRICING_INFO.feePerItem,
          description: PRICING_INFO.description,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

// Cancel event with refund eligibility check
router.post(
  '/:id/cancel',
  authenticate,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Invalid event ID format')
      }

      const { id } = req.params
      const userId = req.user!.id

      // Check access
      const access = await checkEventAccess(id, userId)
      if (!access) {
        throw forbidden('You do not have permission to cancel this event')
      }

      const { event } = access

      if (event.status === 'ended' || event.status === 'cancelled') {
        throw badRequest('This event cannot be cancelled')
      }

      // Process cancellation with refund if eligible
      const result = await processEventCancellation(id, userId)

      res.json(result)
    } catch (error) {
      next(error)
    }
  }
)

// Get user's events
router.get(
  '/my/list',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id

      // Get events owned directly by user or through organizations they manage
      const result = await dbQuery(
        `SELECT e.*, o.name as organization_name, o.slug as organization_slug,
                'owner' as user_role
         FROM auction_events e
         LEFT JOIN organizations o ON e.organization_id = o.id
         WHERE e.owner_id = @userId

         UNION

         SELECT e.*, o.name as organization_name, o.slug as organization_slug,
                m.role as user_role
         FROM auction_events e
         INNER JOIN organizations o ON e.organization_id = o.id
         INNER JOIN organization_members m ON o.id = m.organization_id
         WHERE m.user_id = @userId AND m.role IN ('owner', 'admin')

         ORDER BY created_at DESC`,
        { userId }
      )

      const events = result.recordset.map((e: any) => ({
        id: e.id,
        name: e.name,
        slug: e.slug,
        description: e.description,
        coverImageUrl: e.cover_image_url,
        organization: e.organization_id ? {
          id: e.organization_id,
          name: e.organization_name,
          slug: e.organization_slug,
        } : null,
        startTime: e.start_time,
        endTime: e.end_time,
        auctionType: e.auction_type,
        tier: e.tier,
        status: e.status,
        itemCount: e.item_count,
        totalBids: e.total_bids,
        totalRaised: parseFloat(e.total_raised || 0),
        accessCode: e.access_code,
        userRole: e.user_role,
        createdAt: e.created_at,
      }))

      res.json(events)
    } catch (error) {
      next(error)
    }
  }
)

// Upload event cover image
router.post(
  '/:id/cover-image',
  authenticate,
  param('id').isUUID(),
  coverImageUpload.single('coverImage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const userId = req.user!.id

      // Check if user has admin access to event
      const access = await checkEventAccess(id, userId)
      if (!access) {
        throw forbidden('You do not have permission to update this event')
      }

      if (!req.file) {
        throw badRequest('No cover image file provided')
      }

      // Get current cover image URL to delete later
      const currentResult = await dbQuery(
        'SELECT cover_image_url FROM auction_events WHERE id = @id',
        { id }
      )
      const currentCoverUrl = currentResult.recordset[0]?.cover_image_url

      // Generate unique blob name for the cover image
      const ext = path.extname(req.file.originalname).toLowerCase() || '.png'
      const blobName = `events/${id}/cover-${uuidv4()}${ext}`

      // Upload to blob storage
      const coverImageUrl = await uploadToBlob(
        req.file.buffer,
        blobName,
        req.file.mimetype
      )

      // Update event with new cover image URL
      await dbQuery(
        `UPDATE auction_events SET cover_image_url = @coverImageUrl, updated_at = GETUTCDATE() WHERE id = @id`,
        { id, coverImageUrl }
      )

      // Delete old cover image if it exists
      if (currentCoverUrl) {
        try {
          await deleteImage(currentCoverUrl)
        } catch (deleteError) {
          console.error('Failed to delete old cover image:', deleteError)
          // Don't fail the request if old cover deletion fails
        }
      }

      res.json({ coverImageUrl })
    } catch (error) {
      next(error)
    }
  }
)

// Delete event cover image
router.delete(
  '/:id/cover-image',
  authenticate,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const userId = req.user!.id

      // Check if user has admin access to event
      const access = await checkEventAccess(id, userId)
      if (!access) {
        throw forbidden('You do not have permission to update this event')
      }

      // Get current cover image URL
      const result = await dbQuery(
        'SELECT cover_image_url FROM auction_events WHERE id = @id',
        { id }
      )
      const coverImageUrl = result.recordset[0]?.cover_image_url

      if (coverImageUrl) {
        // Delete from blob storage
        await deleteImage(coverImageUrl)

        // Update event
        await dbQuery(
          `UPDATE auction_events SET cover_image_url = NULL, updated_at = GETUTCDATE() WHERE id = @id`,
          { id }
        )
      }

      res.status(204).send()
    } catch (error) {
      next(error)
    }
  }
)

// Get pricing tiers
router.get(
  '/pricing/info',
  async (_req: Request, res: Response) => {
    res.json(PRICING_INFO)
  }
)

export { router as eventRoutes }
