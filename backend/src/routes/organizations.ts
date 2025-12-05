import { Router, Request, Response, NextFunction } from 'express'
import { body, param, query, validationResult } from 'express-validator'
import crypto from 'crypto'
import multer from 'multer'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { authenticate, optionalAuth } from '../middleware/auth.js'
import { query as dbQuery } from '../config/database.js'
import { badRequest, notFound, forbidden } from '../middleware/errorHandler.js'
import { sendOrganizationInvitationEmail } from '../services/email.js'
import { uploadToBlob, deleteImage } from '../services/storage.js'
import {
  createOnboardingLink,
  getAccountStatus,
  createDashboardLink,
  getAccountBalance,
} from '../services/stripeConnect.js'
import {
  getOrganizationPayouts,
  getOrganizationTrust,
} from '../services/payouts.js'

const router = Router()

// Multer configuration for logo uploads
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit for logos
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Allowed: jpg, jpeg, png, gif, webp'))
    }
  },
})

// Helper function to generate slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
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

// Helper to ensure user exists (same pattern as auctions)
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

// Create organization
router.post(
  '/',
  authenticate,
  [
    body('name').isString().isLength({ min: 2, max: 255 }),
    body('description').optional().isString(),
    body('orgType').isIn(['nonprofit', 'school', 'religious', 'club', 'company', 'other']),
    body('contactEmail').isEmail(),
    body('contactPhone').optional().isString(),
    body('websiteUrl').optional().isURL(),
    body('taxId').optional().isString(),
    body('address').optional().isObject(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const userId = req.user!.id
      const { name, description, orgType, contactEmail, contactPhone, websiteUrl, taxId, address } = req.body

      // Ensure user exists in database
      await ensureUserExists(userId, req.user!.email, req.user!.name)

      // Generate unique slug
      let slug = generateSlug(name)
      let slugSuffix = 0
      let slugExists = true
      while (slugExists) {
        const candidateSlug = slugSuffix > 0 ? `${slug}-${slugSuffix}` : slug
        const existing = await dbQuery(
          'SELECT id FROM organizations WHERE slug = @slug',
          { slug: candidateSlug }
        )
        if (existing.recordset.length === 0) {
          slug = candidateSlug
          slugExists = false
        } else {
          slugSuffix++
        }
      }

      // Create organization
      const orgResult = await dbQuery(
        `INSERT INTO organizations (
          name, slug, description, org_type, contact_email, contact_phone,
          website_url, tax_id, address_line1, address_line2, city, state,
          postal_code, country, status, created_by, created_at, updated_at
        ) OUTPUT INSERTED.*
        VALUES (
          @name, @slug, @description, @orgType, @contactEmail, @contactPhone,
          @websiteUrl, @taxId, @addressLine1, @addressLine2, @city, @state,
          @postalCode, @country, 'pending', @createdBy, GETUTCDATE(), GETUTCDATE()
        )`,
        {
          name,
          slug,
          description: description || null,
          orgType,
          contactEmail,
          contactPhone: contactPhone || null,
          websiteUrl: websiteUrl || null,
          taxId: taxId || null,
          addressLine1: address?.line1 || null,
          addressLine2: address?.line2 || null,
          city: address?.city || null,
          state: address?.state || null,
          postalCode: address?.postalCode || null,
          country: address?.country || 'USA',
          createdBy: userId,
        }
      )

      const org = orgResult.recordset[0]

      // Add creator as owner
      await dbQuery(
        `INSERT INTO organization_members (
          organization_id, user_id, role, can_create_auctions, can_manage_members, can_view_financials, joined_at
        ) VALUES (
          @orgId, @userId, 'owner', 1, 1, 1, GETUTCDATE()
        )`,
        { orgId: org.id, userId }
      )

      res.status(201).json({
        id: org.id,
        name: org.name,
        slug: org.slug,
        description: org.description,
        orgType: org.org_type,
        contactEmail: org.contact_email,
        contactPhone: org.contact_phone,
        websiteUrl: org.website_url,
        taxId: org.tax_id,
        status: org.status,
        address: org.address_line1 ? {
          line1: org.address_line1,
          line2: org.address_line2,
          city: org.city,
          state: org.state,
          postalCode: org.postal_code,
          country: org.country,
        } : null,
        createdAt: org.created_at,
      })
    } catch (error) {
      next(error)
    }
  }
)

// List public organizations
router.get(
  '/',
  optionalAuth,
  [
    query('page').optional().isInt({ min: 1 }),
    query('pageSize').optional().isInt({ min: 1, max: 50 }),
    query('search').optional().isString(),
    query('orgType').optional().isIn(['nonprofit', 'school', 'religious', 'club', 'company', 'other']),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1
      const pageSize = parseInt(req.query.pageSize as string) || 12
      const search = req.query.search as string
      const orgType = req.query.orgType as string
      const offset = (page - 1) * pageSize

      let whereClause = "WHERE status IN ('verified', 'unverified')"
      const params: Record<string, any> = {}

      if (search) {
        whereClause += " AND (name LIKE @search OR description LIKE @search)"
        params.search = `%${search}%`
      }

      if (orgType) {
        whereClause += " AND org_type = @orgType"
        params.orgType = orgType
      }

      // Get total count
      const countResult = await dbQuery(
        `SELECT COUNT(*) as total FROM organizations ${whereClause}`,
        params
      )
      const totalItems = countResult.recordset[0].total

      // Get organizations with pagination
      const result = await dbQuery(
        `SELECT id, name, slug, description, logo_url, org_type, status, is_featured, created_at
         FROM organizations
         ${whereClause}
         ORDER BY is_featured DESC, created_at DESC
         OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`,
        { ...params, offset, pageSize }
      )

      const organizations = result.recordset.map((o: any) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        description: o.description,
        logoUrl: o.logo_url,
        orgType: o.org_type,
        status: o.status,
        isFeatured: o.is_featured,
        createdAt: o.created_at,
      }))

      res.json({
        data: organizations,
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

// Get organization by slug (public)
router.get(
  '/:slug',
  optionalAuth,
  param('slug').isString(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { slug } = req.params
      const userId = req.user?.id

      const result = await dbQuery(
        `SELECT o.*, u.display_name as creator_name
         FROM organizations o
         LEFT JOIN users u ON o.created_by = u.id
         WHERE o.slug = @slug`,
        { slug }
      )

      if (result.recordset.length === 0) {
        throw notFound('Organization not found')
      }

      const org = result.recordset[0]

      // Check if user is a member (for showing additional info)
      let membership = null
      if (userId) {
        const memberResult = await dbQuery(
          `SELECT role, can_create_auctions, can_manage_members, can_view_financials
           FROM organization_members
           WHERE organization_id = @orgId AND user_id = @userId`,
          { orgId: org.id, userId }
        )
        if (memberResult.recordset.length > 0) {
          membership = memberResult.recordset[0]
        }
      }

      // Get member count
      const memberCountResult = await dbQuery(
        `SELECT COUNT(*) as count FROM organization_members WHERE organization_id = @orgId`,
        { orgId: org.id }
      )

      res.json({
        id: org.id,
        name: org.name,
        slug: org.slug,
        description: org.description,
        logoUrl: org.logo_url,
        websiteUrl: org.website_url,
        orgType: org.org_type,
        status: org.status,
        isFeatured: org.is_featured,
        memberCount: memberCountResult.recordset[0].count,
        address: org.address_line1 ? {
          line1: org.address_line1,
          line2: org.address_line2,
          city: org.city,
          state: org.state,
          postalCode: org.postal_code,
          country: org.country,
        } : null,
        createdAt: org.created_at,
        // Only show sensitive info to members
        ...(membership ? {
          contactEmail: org.contact_email,
          contactPhone: org.contact_phone,
          taxId: org.tax_id,
          stripeOnboardingComplete: org.stripe_onboarding_complete,
          stripeChargesEnabled: org.stripe_charges_enabled,
          stripePayoutsEnabled: org.stripe_payouts_enabled,
        } : {}),
        membership: membership ? {
          role: membership.role,
          canCreateAuctions: membership.can_create_auctions,
          canManageMembers: membership.can_manage_members,
          canViewFinancials: membership.can_view_financials,
        } : null,
      })
    } catch (error) {
      next(error)
    }
  }
)

// Update organization
router.put(
  '/:id',
  authenticate,
  [
    param('id').isUUID(),
    body('name').optional().isString().isLength({ min: 2, max: 255 }),
    body('description').optional().isString(),
    body('contactEmail').optional().isEmail(),
    body('contactPhone').optional().isString(),
    body('websiteUrl').optional().isURL(),
    body('address').optional().isObject(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const { id } = req.params
      const userId = req.user!.id

      // Check if user is owner or admin
      const membership = await checkOrgMembership(id, userId, ['owner', 'admin'])
      if (!membership) {
        throw forbidden('Only owners and admins can update organization')
      }

      const { name, description, contactEmail, contactPhone, websiteUrl, address } = req.body

      await dbQuery(
        `UPDATE organizations SET
          name = COALESCE(@name, name),
          description = COALESCE(@description, description),
          contact_email = COALESCE(@contactEmail, contact_email),
          contact_phone = COALESCE(@contactPhone, contact_phone),
          website_url = COALESCE(@websiteUrl, website_url),
          address_line1 = COALESCE(@addressLine1, address_line1),
          address_line2 = COALESCE(@addressLine2, address_line2),
          city = COALESCE(@city, city),
          state = COALESCE(@state, state),
          postal_code = COALESCE(@postalCode, postal_code),
          country = COALESCE(@country, country),
          updated_at = GETUTCDATE()
         WHERE id = @id`,
        {
          id,
          name: name || null,
          description: description || null,
          contactEmail: contactEmail || null,
          contactPhone: contactPhone || null,
          websiteUrl: websiteUrl || null,
          addressLine1: address?.line1 || null,
          addressLine2: address?.line2 || null,
          city: address?.city || null,
          state: address?.state || null,
          postalCode: address?.postalCode || null,
          country: address?.country || null,
        }
      )

      res.json({ message: 'Organization updated successfully' })
    } catch (error) {
      next(error)
    }
  }
)

// Delete organization (owner only)
router.delete(
  '/:id',
  authenticate,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const userId = req.user!.id

      // Check if user is owner
      const membership = await checkOrgMembership(id, userId, ['owner'])
      if (!membership) {
        throw forbidden('Only owners can delete organization')
      }

      // Delete organization (cascades to members and invitations)
      await dbQuery(
        'DELETE FROM organizations WHERE id = @id',
        { id }
      )

      res.status(204).send()
    } catch (error) {
      next(error)
    }
  }
)

// Upload organization logo
router.post(
  '/:id/logo',
  authenticate,
  param('id').isUUID(),
  logoUpload.single('logo'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const userId = req.user!.id

      // Check if user is owner or admin
      const membership = await checkOrgMembership(id, userId, ['owner', 'admin'])
      if (!membership) {
        throw forbidden('Only owners and admins can update organization logo')
      }

      if (!req.file) {
        throw badRequest('No logo file provided')
      }

      // Get current logo URL to delete later
      const currentResult = await dbQuery(
        'SELECT logo_url FROM organizations WHERE id = @id',
        { id }
      )
      const currentLogoUrl = currentResult.recordset[0]?.logo_url

      // Generate unique blob name for the logo
      const ext = path.extname(req.file.originalname).toLowerCase() || '.png'
      const blobName = `organizations/${id}/logo-${uuidv4()}${ext}`

      // Upload to blob storage
      const logoUrl = await uploadToBlob(
        req.file.buffer,
        blobName,
        req.file.mimetype
      )

      // Update organization with new logo URL
      await dbQuery(
        `UPDATE organizations SET logo_url = @logoUrl, updated_at = GETUTCDATE() WHERE id = @id`,
        { id, logoUrl }
      )

      // Delete old logo if it exists
      if (currentLogoUrl) {
        try {
          await deleteImage(currentLogoUrl)
        } catch (deleteError) {
          console.error('Failed to delete old logo:', deleteError)
          // Don't fail the request if old logo deletion fails
        }
      }

      res.json({ logoUrl })
    } catch (error) {
      next(error)
    }
  }
)

// Delete organization logo
router.delete(
  '/:id/logo',
  authenticate,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const userId = req.user!.id

      // Check if user is owner or admin
      const membership = await checkOrgMembership(id, userId, ['owner', 'admin'])
      if (!membership) {
        throw forbidden('Only owners and admins can delete organization logo')
      }

      // Get current logo URL
      const result = await dbQuery(
        'SELECT logo_url FROM organizations WHERE id = @id',
        { id }
      )
      const logoUrl = result.recordset[0]?.logo_url

      if (logoUrl) {
        // Delete from blob storage
        await deleteImage(logoUrl)

        // Update organization
        await dbQuery(
          `UPDATE organizations SET logo_url = NULL, updated_at = GETUTCDATE() WHERE id = @id`,
          { id }
        )
      }

      res.status(204).send()
    } catch (error) {
      next(error)
    }
  }
)

// Get organization members
router.get(
  '/:id/members',
  authenticate,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const userId = req.user!.id

      // Check if user is a member
      const membership = await checkOrgMembership(id, userId)
      if (!membership) {
        throw forbidden('Only members can view member list')
      }

      const result = await dbQuery(
        `SELECT m.*, u.email, u.display_name
         FROM organization_members m
         INNER JOIN users u ON m.user_id = u.id
         WHERE m.organization_id = @id
         ORDER BY
           CASE m.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
           m.joined_at ASC`,
        { id }
      )

      const members = result.recordset.map((m: any) => ({
        id: m.id,
        userId: m.user_id,
        email: m.email,
        displayName: m.display_name,
        role: m.role,
        canCreateAuctions: m.can_create_auctions,
        canManageMembers: m.can_manage_members,
        canViewFinancials: m.can_view_financials,
        joinedAt: m.joined_at,
      }))

      res.json(members)
    } catch (error) {
      next(error)
    }
  }
)

// Add member directly (admin/owner only)
router.post(
  '/:id/members',
  authenticate,
  [
    param('id').isUUID(),
    body('userId').isString(),
    body('role').isIn(['admin', 'member']),
    body('canCreateAuctions').optional().isBoolean(),
    body('canManageMembers').optional().isBoolean(),
    body('canViewFinancials').optional().isBoolean(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const { id } = req.params
      const currentUserId = req.user!.id
      const { userId, role, canCreateAuctions, canManageMembers, canViewFinancials } = req.body

      // Check if current user can manage members
      const membership = await checkOrgMembership(id, currentUserId, ['owner', 'admin'])
      if (!membership || !membership.can_manage_members) {
        throw forbidden('You do not have permission to add members')
      }

      // Cannot add as owner
      if (role === 'owner') {
        throw badRequest('Cannot add members as owner')
      }

      // Check if user already a member
      const existing = await dbQuery(
        'SELECT id FROM organization_members WHERE organization_id = @orgId AND user_id = @userId',
        { orgId: id, userId }
      )
      if (existing.recordset.length > 0) {
        throw badRequest('User is already a member')
      }

      await dbQuery(
        `INSERT INTO organization_members (
          organization_id, user_id, role, can_create_auctions, can_manage_members,
          can_view_financials, invited_by, joined_at
        ) VALUES (
          @orgId, @userId, @role, @canCreateAuctions, @canManageMembers,
          @canViewFinancials, @invitedBy, GETUTCDATE()
        )`,
        {
          orgId: id,
          userId,
          role,
          canCreateAuctions: canCreateAuctions ? 1 : 0,
          canManageMembers: canManageMembers ? 1 : 0,
          canViewFinancials: canViewFinancials ? 1 : 0,
          invitedBy: currentUserId,
        }
      )

      res.status(201).json({ message: 'Member added successfully' })
    } catch (error) {
      next(error)
    }
  }
)

// Update member role/permissions
router.put(
  '/:id/members/:memberId',
  authenticate,
  [
    param('id').isUUID(),
    param('memberId').isUUID(),
    body('role').optional().isIn(['admin', 'member']),
    body('canCreateAuctions').optional().isBoolean(),
    body('canManageMembers').optional().isBoolean(),
    body('canViewFinancials').optional().isBoolean(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, memberId } = req.params
      const currentUserId = req.user!.id
      const { role, canCreateAuctions, canManageMembers, canViewFinancials } = req.body

      // Check if current user can manage members
      const membership = await checkOrgMembership(id, currentUserId, ['owner', 'admin'])
      if (!membership || !membership.can_manage_members) {
        throw forbidden('You do not have permission to update members')
      }

      // Get target member
      const targetResult = await dbQuery(
        'SELECT user_id, role FROM organization_members WHERE id = @memberId AND organization_id = @orgId',
        { memberId, orgId: id }
      )
      if (targetResult.recordset.length === 0) {
        throw notFound('Member not found')
      }

      const targetMember = targetResult.recordset[0]

      // Cannot modify owner
      if (targetMember.role === 'owner') {
        throw forbidden('Cannot modify owner')
      }

      // Only owner can promote to admin
      if (role === 'admin' && membership.role !== 'owner') {
        throw forbidden('Only owner can promote to admin')
      }

      await dbQuery(
        `UPDATE organization_members SET
          role = COALESCE(@role, role),
          can_create_auctions = COALESCE(@canCreateAuctions, can_create_auctions),
          can_manage_members = COALESCE(@canManageMembers, can_manage_members),
          can_view_financials = COALESCE(@canViewFinancials, can_view_financials)
         WHERE id = @memberId`,
        {
          memberId,
          role: role || null,
          canCreateAuctions: canCreateAuctions !== undefined ? (canCreateAuctions ? 1 : 0) : null,
          canManageMembers: canManageMembers !== undefined ? (canManageMembers ? 1 : 0) : null,
          canViewFinancials: canViewFinancials !== undefined ? (canViewFinancials ? 1 : 0) : null,
        }
      )

      res.json({ message: 'Member updated successfully' })
    } catch (error) {
      next(error)
    }
  }
)

// Remove member
router.delete(
  '/:id/members/:userId',
  authenticate,
  [
    param('id').isUUID(),
    param('userId').isString(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, userId: targetUserId } = req.params
      const currentUserId = req.user!.id

      // Get target member info
      const targetResult = await dbQuery(
        'SELECT role FROM organization_members WHERE organization_id = @orgId AND user_id = @userId',
        { orgId: id, userId: targetUserId }
      )
      if (targetResult.recordset.length === 0) {
        throw notFound('Member not found')
      }

      const targetRole = targetResult.recordset[0].role

      // Cannot remove owner
      if (targetRole === 'owner') {
        throw forbidden('Cannot remove owner')
      }

      // Check permissions (can remove self, or need manage permissions)
      if (targetUserId !== currentUserId) {
        const membership = await checkOrgMembership(id, currentUserId, ['owner', 'admin'])
        if (!membership || !membership.can_manage_members) {
          throw forbidden('You do not have permission to remove members')
        }
      }

      await dbQuery(
        'DELETE FROM organization_members WHERE organization_id = @orgId AND user_id = @userId',
        { orgId: id, userId: targetUserId }
      )

      res.status(204).send()
    } catch (error) {
      next(error)
    }
  }
)

// Send invitation
router.post(
  '/:id/invitations',
  authenticate,
  [
    param('id').isUUID(),
    body('email').isEmail(),
    body('role').isIn(['admin', 'member']),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const { id } = req.params
      const userId = req.user!.id
      const { email, role } = req.body

      // Check if user can manage members
      const membership = await checkOrgMembership(id, userId, ['owner', 'admin'])
      if (!membership || !membership.can_manage_members) {
        throw forbidden('You do not have permission to send invitations')
      }

      // Only owner can invite admins
      if (role === 'admin' && membership.role !== 'owner') {
        throw forbidden('Only owner can invite admins')
      }

      // Get organization name for the email
      const orgResult = await dbQuery(
        `SELECT name FROM organizations WHERE id = @orgId`,
        { orgId: id }
      )
      if (orgResult.recordset.length === 0) {
        throw notFound('Organization not found')
      }
      const organizationName = orgResult.recordset[0].name

      // Get inviter name for the email
      const inviterResult = await dbQuery(
        `SELECT display_name FROM users WHERE id = @userId`,
        { userId }
      )
      const inviterName = inviterResult.recordset[0]?.display_name || req.user!.name || 'A team member'

      // Check if email already has pending invitation
      const existingInvite = await dbQuery(
        `SELECT id FROM organization_invitations
         WHERE organization_id = @orgId AND email = @email AND status = 'pending'`,
        { orgId: id, email }
      )
      if (existingInvite.recordset.length > 0) {
        throw badRequest('Invitation already sent to this email')
      }

      // Check if user with this email is already a member
      const existingMember = await dbQuery(
        `SELECT om.id FROM organization_members om
         INNER JOIN users u ON om.user_id = u.id
         WHERE om.organization_id = @orgId AND u.email = @email`,
        { orgId: id, email }
      )
      if (existingMember.recordset.length > 0) {
        throw badRequest('User is already a member')
      }

      // Generate token
      const token = crypto.randomBytes(32).toString('hex')
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7) // 7 days expiry

      await dbQuery(
        `INSERT INTO organization_invitations (
          organization_id, email, role, invited_by, token, expires_at, created_at
        ) VALUES (
          @orgId, @email, @role, @invitedBy, @token, @expiresAt, GETUTCDATE()
        )`,
        {
          orgId: id,
          email,
          role,
          invitedBy: userId,
          token,
          expiresAt,
        }
      )

      // Send invitation email
      const emailSent = await sendOrganizationInvitationEmail({
        recipientEmail: email,
        inviterName,
        organizationName,
        role,
        invitationToken: token,
      })

      res.status(201).json({
        message: 'Invitation sent successfully',
        emailSent,
        token, // Return token for testing (in production, only send via email)
      })
    } catch (error) {
      next(error)
    }
  }
)

// List pending invitations
router.get(
  '/:id/invitations',
  authenticate,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const userId = req.user!.id

      // Check if user can manage members
      const membership = await checkOrgMembership(id, userId, ['owner', 'admin'])
      if (!membership || !membership.can_manage_members) {
        throw forbidden('You do not have permission to view invitations')
      }

      const result = await dbQuery(
        `SELECT i.*, u.display_name as inviter_name
         FROM organization_invitations i
         LEFT JOIN users u ON i.invited_by = u.id
         WHERE i.organization_id = @orgId AND i.status = 'pending'
         ORDER BY i.created_at DESC`,
        { orgId: id }
      )

      const invitations = result.recordset.map((i: any) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        inviterName: i.inviter_name,
        status: i.status,
        expiresAt: i.expires_at,
        createdAt: i.created_at,
      }))

      res.json(invitations)
    } catch (error) {
      next(error)
    }
  }
)

// Cancel invitation
router.delete(
  '/:id/invitations/:invitationId',
  authenticate,
  [
    param('id').isUUID(),
    param('invitationId').isUUID(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, invitationId } = req.params
      const userId = req.user!.id

      // Check if user can manage members
      const membership = await checkOrgMembership(id, userId, ['owner', 'admin'])
      if (!membership || !membership.can_manage_members) {
        throw forbidden('You do not have permission to cancel invitations')
      }

      await dbQuery(
        `DELETE FROM organization_invitations
         WHERE id = @invitationId AND organization_id = @orgId AND status = 'pending'`,
        { invitationId, orgId: id }
      )

      res.status(204).send()
    } catch (error) {
      next(error)
    }
  }
)

// Get user's organizations
router.get(
  '/my/list',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id

      const result = await dbQuery(
        `SELECT o.*, m.role, m.can_create_auctions, m.can_manage_members, m.can_view_financials
         FROM organizations o
         INNER JOIN organization_members m ON o.id = m.organization_id
         WHERE m.user_id = @userId
         ORDER BY m.role, o.name`,
        { userId }
      )

      const organizations = result.recordset.map((o: any) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        description: o.description,
        logoUrl: o.logo_url,
        orgType: o.org_type,
        status: o.status,
        membership: {
          role: o.role,
          canCreateAuctions: o.can_create_auctions,
          canManageMembers: o.can_manage_members,
          canViewFinancials: o.can_view_financials,
        },
        createdAt: o.created_at,
      }))

      res.json(organizations)
    } catch (error) {
      next(error)
    }
  }
)

// =============================================
// Stripe Connect Routes
// =============================================

// Start Stripe Connect onboarding
router.post(
  '/:id/stripe-connect',
  authenticate,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const userId = req.user!.id

      // Check if user is owner or admin
      const membership = await checkOrgMembership(id, userId, ['owner', 'admin'])
      if (!membership) {
        throw forbidden('Only owners and admins can manage Stripe Connect')
      }

      // Fetch organization slug for the return URL
      const orgResult = await dbQuery(
        'SELECT slug FROM organizations WHERE id = @id',
        { id }
      )
      if (orgResult.recordset.length === 0) {
        throw notFound('Organization not found')
      }
      const orgSlug = orgResult.recordset[0].slug

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
      const returnUrl = `${frontendUrl}/organizations/${orgSlug}/manage?stripe=success`
      const refreshUrl = `${frontendUrl}/organizations/${orgSlug}/manage?stripe=refresh`

      const onboardingUrl = await createOnboardingLink(id, returnUrl, refreshUrl)

      res.json({ url: onboardingUrl })
    } catch (error) {
      next(error)
    }
  }
)

// Get Stripe Connect status
router.get(
  '/:id/stripe-status',
  authenticate,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const userId = req.user!.id

      // Check if user is a member
      const membership = await checkOrgMembership(id, userId)
      if (!membership) {
        throw forbidden('Only members can view Stripe status')
      }

      const status = await getAccountStatus(id)

      res.json(status)
    } catch (error) {
      next(error)
    }
  }
)

// Get Stripe Express Dashboard link
router.get(
  '/:id/stripe-dashboard',
  authenticate,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const userId = req.user!.id

      // Check if user is owner or admin
      const membership = await checkOrgMembership(id, userId, ['owner', 'admin'])
      if (!membership) {
        throw forbidden('Only owners and admins can access Stripe dashboard')
      }

      const url = await createDashboardLink(id)

      res.json({ url })
    } catch (error) {
      next(error)
    }
  }
)

// Get Stripe account balance
router.get(
  '/:id/stripe-balance',
  authenticate,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const userId = req.user!.id

      // Check if user can view financials
      const membership = await checkOrgMembership(id, userId)
      if (!membership || !membership.can_view_financials) {
        throw forbidden('You do not have permission to view financial information')
      }

      const balance = await getAccountBalance(id)

      res.json(balance)
    } catch (error) {
      next(error)
    }
  }
)

// =============================================
// Payout Routes
// =============================================

// Get organization payouts
router.get(
  '/:id/payouts',
  authenticate,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const userId = req.user!.id

      // Check if user can view financials
      const membership = await checkOrgMembership(id, userId)
      if (!membership || !membership.can_view_financials) {
        throw forbidden('You do not have permission to view payouts')
      }

      const payouts = await getOrganizationPayouts(id)

      res.json(payouts)
    } catch (error) {
      next(error)
    }
  }
)

// Get organization trust level
router.get(
  '/:id/trust',
  authenticate,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const userId = req.user!.id

      // Check if user can view financials
      const membership = await checkOrgMembership(id, userId)
      if (!membership || !membership.can_view_financials) {
        throw forbidden('You do not have permission to view trust information')
      }

      const trust = await getOrganizationTrust(id)

      res.json(trust)
    } catch (error) {
      next(error)
    }
  }
)

export { router as organizationRoutes }
