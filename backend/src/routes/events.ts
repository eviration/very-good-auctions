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
import { sendDonationLinkEmail } from '../services/email.js'

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
    body('organizationId').isUUID().withMessage('Organization is required'),
    body('startTime').isISO8601(),
    body('endTime').isISO8601(),
    body('submissionDeadline').optional().isISO8601(),
    body('auctionType').optional().isIn(['standard', 'silent']),
    body('isMultiItem').optional().isBoolean(),
    body('incrementType').optional().isIn(['fixed', 'percent']),
    body('incrementValue').optional().isFloat({ min: 0.01 }),
    body('buyNowEnabled').optional().isBoolean(),
    // Self-managed payments fields
    body('paymentMode').optional().isIn(['self_managed', 'integrated']),
    body('paymentInstructions').optional().isString(),
    body('paymentLink').optional().isURL().withMessage('Payment link must be a valid URL'),
    body('paymentQrCodeUrl').optional().isURL().withMessage('QR code URL must be a valid URL'),
    body('fulfillmentType').optional().isIn(['shipping', 'pickup', 'both', 'digital']),
    body('pickupInstructions').optional().isString(),
    body('pickupLocation').optional().isString(),
    body('pickupAddressLine1').optional().isString(),
    body('pickupAddressLine2').optional().isString(),
    body('pickupCity').optional().isString(),
    body('pickupState').optional().isString(),
    body('pickupPostalCode').optional().isString(),
    body('pickupDates').optional().isString(),
    body('paymentDueDays').optional().isInt({ min: 1, max: 90 }),
    body('sendPaymentReminders').optional().isBoolean(),
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
        // Self-managed payments fields
        paymentMode = 'integrated',
        paymentInstructions,
        paymentLink,
        paymentQrCodeUrl,
        fulfillmentType = 'shipping',
        pickupInstructions,
        pickupLocation,
        pickupAddressLine1,
        pickupAddressLine2,
        pickupCity,
        pickupState,
        pickupPostalCode,
        pickupDates,
        paymentDueDays = 7,
        sendPaymentReminders = true,
      } = req.body

      // Ensure user exists in database
      await ensureUserExists(userId, req.user!.email, req.user!.name)

      // Verify organization membership and Stripe Connect status
      const membership = await checkOrgMembership(organizationId, userId, ['owner', 'admin'])
      if (!membership) {
        throw forbidden('Only organization owners and admins can create events')
      }

      // Check if organization exists and validate Stripe for integrated payments
      const orgResult = await dbQuery(
        `SELECT stripe_charges_enabled, stripe_payouts_enabled, name
         FROM organizations WHERE id = @orgId`,
        { orgId: organizationId }
      )

      if (orgResult.recordset.length === 0) {
        throw notFound('Organization not found')
      }

      const org = orgResult.recordset[0]

      // For integrated payments, Stripe Connect must be set up
      if (paymentMode === 'integrated') {
        if (!org.stripe_charges_enabled || !org.stripe_payouts_enabled) {
          throw badRequest(
            `Cannot create an auction with integrated payments for "${org.name}" until Stripe Connect setup is complete. ` +
            'Please complete the payment verification process in your organization settings, or use self-managed payments.'
          )
        }
      }

      // For self-managed payments, require at least one payment method
      if (paymentMode === 'self_managed') {
        if (!paymentInstructions && !paymentLink && !paymentQrCodeUrl) {
          throw badRequest(
            'Self-managed payment events require at least one of: payment instructions, payment link, or payment QR code.'
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

      // Get visibility (default to public)
      const visibility = req.body.visibility || 'public'

      // Create event (tier/maxItems set to 'unlimited' for legacy compatibility)
      const result = await dbQuery(
        `INSERT INTO auction_events (
          organization_id, name, slug, description,
          start_time, end_time, submission_deadline,
          auction_type, is_multi_item, increment_type, increment_value,
          buy_now_enabled, access_code, status, visibility,
          tier, max_items,
          payment_mode, payment_instructions, payment_link, payment_qr_code_url,
          fulfillment_type, pickup_instructions, pickup_location,
          pickup_address_line1, pickup_address_line2, pickup_city, pickup_state, pickup_postal_code,
          pickup_dates, payment_due_days, send_payment_reminders,
          created_by, created_at, updated_at
        ) OUTPUT INSERTED.*
        VALUES (
          @organizationId, @name, @slug, @description,
          @startTime, @endTime, @submissionDeadline,
          @auctionType, @isMultiItem, @incrementType, @incrementValue,
          @buyNowEnabled, @accessCode, 'draft', @visibility,
          'unlimited', 999999,
          @paymentMode, @paymentInstructions, @paymentLink, @paymentQrCodeUrl,
          @fulfillmentType, @pickupInstructions, @pickupLocation,
          @pickupAddressLine1, @pickupAddressLine2, @pickupCity, @pickupState, @pickupPostalCode,
          @pickupDates, @paymentDueDays, @sendPaymentReminders,
          @createdBy, GETUTCDATE(), GETUTCDATE()
        )`,
        {
          organizationId,
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
          visibility,
          paymentMode,
          paymentInstructions: paymentInstructions || null,
          paymentLink: paymentLink || null,
          paymentQrCodeUrl: paymentQrCodeUrl || null,
          fulfillmentType,
          pickupInstructions: pickupInstructions || null,
          pickupLocation: pickupLocation || null,
          pickupAddressLine1: pickupAddressLine1 || null,
          pickupAddressLine2: pickupAddressLine2 || null,
          pickupCity: pickupCity || null,
          pickupState: pickupState || null,
          pickupPostalCode: pickupPostalCode || null,
          pickupDates: pickupDates || null,
          paymentDueDays,
          sendPaymentReminders: sendPaymentReminders ? 1 : 0,
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
        startTime: event.start_time,
        endTime: event.end_time,
        submissionDeadline: event.submission_deadline,
        auctionType: event.auction_type,
        visibility: event.visibility,
        isMultiItem: event.is_multi_item,
        incrementType: event.increment_type,
        incrementValue: event.increment_value,
        buyNowEnabled: event.buy_now_enabled,
        accessCode: event.access_code,
        inviteCode: event.invite_code,
        status: event.status,
        paymentMode: event.payment_mode,
        paymentInstructions: event.payment_instructions,
        paymentLink: event.payment_link,
        paymentQrCodeUrl: event.payment_qr_code_url,
        fulfillmentType: event.fulfillment_type,
        pickupInstructions: event.pickup_instructions,
        pickupLocation: event.pickup_location,
        pickupAddress: {
          line1: event.pickup_address_line1,
          line2: event.pickup_address_line2,
          city: event.pickup_city,
          state: event.pickup_state,
          postalCode: event.pickup_postal_code,
        },
        pickupDates: event.pickup_dates,
        paymentDueDays: event.payment_due_days,
        sendPaymentReminders: event.send_payment_reminders,
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
      // Only show public events in the main listing (private events require invitation)
      let whereClause = "WHERE e.status IN ('scheduled', 'active', 'ended') AND (e.visibility = 'public' OR e.visibility IS NULL)"
      const params: Record<string, any> = {}

      if (status) {
        whereClause = "WHERE e.status = @status AND (e.visibility = 'public' OR e.visibility IS NULL)"
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
        `SELECT e.*, o.name as organization_name, o.slug as organization_slug, o.logo_url as organization_logo_url,
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
          logoUrl: e.organization_logo_url,
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
        `SELECT e.*, o.name as organization_name, o.slug as organization_slug, o.logo_url as organization_logo_url,
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
          logoUrl: event.organization_logo_url,
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
        // Self-managed payments fields
        paymentMode: event.payment_mode,
        paymentInstructions: event.payment_instructions,
        paymentLink: event.payment_link,
        paymentQrCodeUrl: event.payment_qr_code_url,
        fulfillmentType: event.fulfillment_type,
        pickupInstructions: event.pickup_instructions,
        pickupLocation: event.pickup_location,
        pickupAddress: {
          line1: event.pickup_address_line1,
          line2: event.pickup_address_line2,
          city: event.pickup_city,
          state: event.pickup_state,
          postalCode: event.pickup_postal_code,
        },
        pickupDates: event.pickup_dates,
        paymentDueDays: event.payment_due_days,
        sendPaymentReminders: event.send_payment_reminders,
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
        `SELECT e.*, o.name as organization_name, o.slug as organization_slug, o.logo_url as organization_logo_url,
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
          logoUrl: event.organization_logo_url,
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
        // Self-managed payments fields
        paymentMode: event.payment_mode,
        paymentInstructions: event.payment_instructions,
        paymentLink: event.payment_link,
        paymentQrCodeUrl: event.payment_qr_code_url,
        fulfillmentType: event.fulfillment_type,
        pickupInstructions: event.pickup_instructions,
        pickupLocation: event.pickup_location,
        pickupAddress: {
          line1: event.pickup_address_line1,
          line2: event.pickup_address_line2,
          city: event.pickup_city,
          state: event.pickup_state,
          postalCode: event.pickup_postal_code,
        },
        pickupDates: event.pickup_dates,
        paymentDueDays: event.payment_due_days,
        sendPaymentReminders: event.send_payment_reminders,
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
    // Self-managed payments fields
    body('paymentMode').optional().isIn(['self_managed', 'integrated']),
    body('paymentInstructions').optional().isString(),
    body('paymentLink').optional().isURL().withMessage('Payment link must be a valid URL'),
    body('paymentQrCodeUrl').optional().isURL().withMessage('QR code URL must be a valid URL'),
    body('fulfillmentType').optional().isIn(['shipping', 'pickup', 'both', 'digital']),
    body('pickupInstructions').optional().isString(),
    body('pickupLocation').optional().isString(),
    body('pickupAddressLine1').optional().isString(),
    body('pickupAddressLine2').optional().isString(),
    body('pickupCity').optional().isString(),
    body('pickupState').optional().isString(),
    body('pickupPostalCode').optional().isString(),
    body('pickupDates').optional().isString(),
    body('paymentDueDays').optional().isInt({ min: 1, max: 90 }),
    body('sendPaymentReminders').optional().isBoolean(),
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
        // Self-managed payments fields
        paymentMode,
        paymentInstructions,
        paymentLink,
        paymentQrCodeUrl,
        fulfillmentType,
        pickupInstructions,
        pickupLocation,
        pickupAddressLine1,
        pickupAddressLine2,
        pickupCity,
        pickupState,
        pickupPostalCode,
        pickupDates,
        paymentDueDays,
        sendPaymentReminders,
      } = req.body

      // Validate self-managed payment requirements
      const effectivePaymentMode = paymentMode || event.payment_mode
      if (effectivePaymentMode === 'self_managed') {
        const effectiveInstructions = paymentInstructions !== undefined ? paymentInstructions : event.payment_instructions
        const effectiveLink = paymentLink !== undefined ? paymentLink : event.payment_link
        const effectiveQr = paymentQrCodeUrl !== undefined ? paymentQrCodeUrl : event.payment_qr_code_url
        if (!effectiveInstructions && !effectiveLink && !effectiveQr) {
          throw badRequest(
            'Self-managed payment events require at least one of: payment instructions, payment link, or payment QR code.'
          )
        }
      }

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
          payment_mode = COALESCE(@paymentMode, payment_mode),
          payment_instructions = COALESCE(@paymentInstructions, payment_instructions),
          payment_link = COALESCE(@paymentLink, payment_link),
          payment_qr_code_url = COALESCE(@paymentQrCodeUrl, payment_qr_code_url),
          fulfillment_type = COALESCE(@fulfillmentType, fulfillment_type),
          pickup_instructions = COALESCE(@pickupInstructions, pickup_instructions),
          pickup_location = COALESCE(@pickupLocation, pickup_location),
          pickup_address_line1 = COALESCE(@pickupAddressLine1, pickup_address_line1),
          pickup_address_line2 = COALESCE(@pickupAddressLine2, pickup_address_line2),
          pickup_city = COALESCE(@pickupCity, pickup_city),
          pickup_state = COALESCE(@pickupState, pickup_state),
          pickup_postal_code = COALESCE(@pickupPostalCode, pickup_postal_code),
          pickup_dates = COALESCE(@pickupDates, pickup_dates),
          payment_due_days = COALESCE(@paymentDueDays, payment_due_days),
          send_payment_reminders = COALESCE(@sendPaymentReminders, send_payment_reminders),
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
          paymentMode: paymentMode || null,
          paymentInstructions: paymentInstructions !== undefined ? paymentInstructions : null,
          paymentLink: paymentLink !== undefined ? paymentLink : null,
          paymentQrCodeUrl: paymentQrCodeUrl !== undefined ? paymentQrCodeUrl : null,
          fulfillmentType: fulfillmentType || null,
          pickupInstructions: pickupInstructions !== undefined ? pickupInstructions : null,
          pickupLocation: pickupLocation !== undefined ? pickupLocation : null,
          pickupAddressLine1: pickupAddressLine1 !== undefined ? pickupAddressLine1 : null,
          pickupAddressLine2: pickupAddressLine2 !== undefined ? pickupAddressLine2 : null,
          pickupCity: pickupCity !== undefined ? pickupCity : null,
          pickupState: pickupState !== undefined ? pickupState : null,
          pickupPostalCode: pickupPostalCode !== undefined ? pickupPostalCode : null,
          pickupDates: pickupDates !== undefined ? pickupDates : null,
          paymentDueDays: paymentDueDays || null,
          sendPaymentReminders: sendPaymentReminders !== undefined ? (sendPaymentReminders ? 1 : 0) : null,
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
        `SELECT e.*, o.name as organization_name, o.slug as organization_slug, o.logo_url as organization_logo_url,
                'owner' as user_role
         FROM auction_events e
         LEFT JOIN organizations o ON e.organization_id = o.id
         WHERE e.owner_id = @userId

         UNION

         SELECT e.*, o.name as organization_name, o.slug as organization_slug, o.logo_url as organization_logo_url,
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
          logoUrl: e.organization_logo_url,
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

// =============================================
// Donation Code Management Endpoints
// =============================================

// Helper to generate a unique donation code
function generateDonationCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Avoid confusing chars like 0, O, 1, I
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

/**
 * GET /api/events/:idOrSlug/donation-settings
 * Get donation settings for an event.
 * Requires event admin access.
 */
router.get(
  '/:idOrSlug/donation-settings',
  authenticate,
  [param('idOrSlug').notEmpty()],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const eventId = await resolveEventId(req.params.idOrSlug)
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
          donation_code,
          donation_code_enabled,
          donation_code_created_at,
          donation_code_expires_at,
          donation_requires_contact,
          donation_require_value_estimate,
          donation_max_images,
          donation_instructions,
          donation_notify_on_submission,
          donation_auto_thank_donor
         FROM auction_events
         WHERE id = @eventId`,
        { eventId }
      )

      if (result.recordset.length === 0) {
        throw notFound('Event not found')
      }

      const settings = result.recordset[0]
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'

      res.json({
        code: settings.donation_code,
        enabled: settings.donation_code_enabled,
        createdAt: settings.donation_code_created_at,
        expiresAt: settings.donation_code_expires_at,
        requiresContact: settings.donation_requires_contact,
        requireValueEstimate: settings.donation_require_value_estimate,
        maxImages: settings.donation_max_images,
        instructions: settings.donation_instructions,
        notifyOnSubmission: settings.donation_notify_on_submission,
        autoThankDonor: settings.donation_auto_thank_donor,
        donationUrl: settings.donation_code ? `${frontendUrl}/donate/${settings.donation_code}` : null,
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * POST /api/events/:idOrSlug/donation-settings/generate-code
 * Generate a new donation code for an event.
 * Requires event admin access.
 */
router.post(
  '/:idOrSlug/donation-settings/generate-code',
  authenticate,
  [param('idOrSlug').notEmpty()],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const eventId = await resolveEventId(req.params.idOrSlug)
      if (!eventId) {
        throw notFound('Event not found')
      }

      const userId = req.user!.id
      const access = await checkEventAccess(eventId, userId)
      if (!access) {
        throw forbidden('You do not have access to this event')
      }

      // Generate unique code
      let code: string
      let attempts = 0
      const maxAttempts = 10

      do {
        code = generateDonationCode()
        const existing = await dbQuery(
          'SELECT id FROM auction_events WHERE donation_code = @code',
          { code }
        )
        if (existing.recordset.length === 0) {
          break
        }
        attempts++
      } while (attempts < maxAttempts)

      if (attempts >= maxAttempts) {
        throw badRequest('Failed to generate unique code. Please try again.')
      }

      await dbQuery(
        `UPDATE auction_events
         SET donation_code = @code,
             donation_code_created_at = GETUTCDATE()
         WHERE id = @eventId`,
        { eventId, code }
      )

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'

      res.json({
        code,
        donationUrl: `${frontendUrl}/donate/${code}`,
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * PATCH /api/events/:idOrSlug/donation-settings
 * Update donation settings for an event.
 * Requires event admin access.
 */
router.patch(
  '/:idOrSlug/donation-settings',
  authenticate,
  [
    param('idOrSlug').notEmpty(),
    body('enabled').optional().isBoolean(),
    body('expiresAt').optional({ nullable: true }).isISO8601(),
    body('requiresContact').optional().isBoolean(),
    body('requireValueEstimate').optional().isBoolean(),
    body('maxImages').optional().isInt({ min: 0, max: 10 }),
    body('instructions').optional({ nullable: true }).trim().isLength({ max: 2000 }),
    body('notifyOnSubmission').optional().isBoolean(),
    body('autoThankDonor').optional().isBoolean(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const eventId = await resolveEventId(req.params.idOrSlug)
      if (!eventId) {
        throw notFound('Event not found')
      }

      const userId = req.user!.id
      const access = await checkEventAccess(eventId, userId)
      if (!access) {
        throw forbidden('You do not have access to this event')
      }

      const {
        enabled,
        expiresAt,
        requiresContact,
        requireValueEstimate,
        maxImages,
        instructions,
        notifyOnSubmission,
        autoThankDonor,
      } = req.body

      // Build update query
      const updates: string[] = []
      const params: Record<string, unknown> = { eventId }

      if (enabled !== undefined) {
        updates.push('donation_code_enabled = @enabled')
        params.enabled = enabled
      }
      if (expiresAt !== undefined) {
        updates.push('donation_code_expires_at = @expiresAt')
        params.expiresAt = expiresAt
      }
      if (requiresContact !== undefined) {
        updates.push('donation_requires_contact = @requiresContact')
        params.requiresContact = requiresContact
      }
      if (requireValueEstimate !== undefined) {
        updates.push('donation_require_value_estimate = @requireValueEstimate')
        params.requireValueEstimate = requireValueEstimate
      }
      if (maxImages !== undefined) {
        updates.push('donation_max_images = @maxImages')
        params.maxImages = maxImages
      }
      if (instructions !== undefined) {
        updates.push('donation_instructions = @instructions')
        params.instructions = instructions
      }
      if (notifyOnSubmission !== undefined) {
        updates.push('donation_notify_on_submission = @notifyOnSubmission')
        params.notifyOnSubmission = notifyOnSubmission
      }
      if (autoThankDonor !== undefined) {
        updates.push('donation_auto_thank_donor = @autoThankDonor')
        params.autoThankDonor = autoThankDonor
      }

      if (updates.length > 0) {
        await dbQuery(
          `UPDATE auction_events SET ${updates.join(', ')} WHERE id = @eventId`,
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
 * DELETE /api/events/:idOrSlug/donation-settings/code
 * Delete/regenerate the donation code (disables existing links).
 * Requires event admin access.
 */
router.delete(
  '/:idOrSlug/donation-settings/code',
  authenticate,
  [param('idOrSlug').notEmpty()],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const eventId = await resolveEventId(req.params.idOrSlug)
      if (!eventId) {
        throw notFound('Event not found')
      }

      const userId = req.user!.id
      const access = await checkEventAccess(eventId, userId)
      if (!access) {
        throw forbidden('You do not have access to this event')
      }

      await dbQuery(
        `UPDATE auction_events
         SET donation_code = NULL,
             donation_code_enabled = 0,
             donation_code_created_at = NULL,
             donation_code_expires_at = NULL
         WHERE id = @eventId`,
        { eventId }
      )

      res.json({ success: true, message: 'Donation code deleted' })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * POST /api/events/:idOrSlug/donation-settings/share-via-email
 * Send donation link invitation emails to multiple recipients.
 * Requires event admin access.
 */
router.post(
  '/:idOrSlug/donation-settings/share-via-email',
  authenticate,
  [
    param('idOrSlug').notEmpty(),
    body('emails').isArray({ min: 1, max: 50 }).withMessage('Must provide between 1 and 50 email addresses'),
    body('emails.*').isEmail().withMessage('Invalid email address'),
    body('customMessage').optional().isString().isLength({ max: 1000 }),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const eventId = await resolveEventId(req.params.idOrSlug)
      if (!eventId) {
        throw notFound('Event not found')
      }

      const userId = req.user!.id
      const access = await checkEventAccess(eventId, userId)
      if (!access) {
        throw forbidden('You do not have access to this event')
      }

      const { emails, customMessage } = req.body

      // Get event details including donation code and organization
      const result = await dbQuery(
        `SELECT e.name, e.donation_code, e.donation_code_enabled, e.access_code,
                o.name as organization_name
         FROM auction_events e
         LEFT JOIN organizations o ON e.organization_id = o.id
         WHERE e.id = @eventId`,
        { eventId }
      )

      if (result.recordset.length === 0) {
        throw notFound('Event not found')
      }

      const event = result.recordset[0]

      // Check if donation code exists and is enabled
      if (!event.donation_code) {
        throw badRequest('No donation code has been generated for this event. Please generate one first.')
      }

      if (!event.donation_code_enabled) {
        throw badRequest('Public donations are currently disabled for this event.')
      }

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
      const donationUrl = `${frontendUrl}/donate/${event.donation_code}`

      // Get sender name
      const userResult = await dbQuery(
        'SELECT display_name FROM users WHERE id = @userId',
        { userId }
      )
      const senderName = userResult.recordset[0]?.display_name || req.user!.name || req.user!.email

      // Send emails to all recipients
      const results: { email: string; success: boolean; error?: string }[] = []

      for (const email of emails) {
        try {
          const success = await sendDonationLinkEmail({
            recipientEmail: email,
            eventName: event.name,
            organizationName: event.organization_name || 'the organizer',
            donationUrl,
            accessCode: event.access_code,
            senderName,
            customMessage,
          })
          results.push({ email, success })
        } catch (emailError) {
          console.error(`Failed to send donation link email to ${email}:`, emailError)
          results.push({
            email,
            success: false,
            error: emailError instanceof Error ? emailError.message : 'Unknown error',
          })
        }
      }

      const successCount = results.filter((r) => r.success).length
      const failCount = results.filter((r) => !r.success).length

      res.json({
        success: true,
        message: `Sent ${successCount} email${successCount !== 1 ? 's' : ''} successfully${failCount > 0 ? `, ${failCount} failed` : ''}.`,
        results,
        totalSent: successCount,
        totalFailed: failCount,
      })
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
