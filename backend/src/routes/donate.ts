import { Router, Request, Response, NextFunction } from 'express'
import { body, param, validationResult } from 'express-validator'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { query as dbQuery } from '../config/database.js'
import { badRequest } from '../middleware/errorHandler.js'
import { uploadToBlob } from '../services/storage.js'
import {
  sendDonorThankYouEmail,
  sendNewSubmissionNotificationEmail,
} from '../services/email.js'

const router = Router()

// Configure multer for image uploads
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Allowed: jpg, jpeg, png, gif, webp'))
    }
  },
})

// Helper to validate email format
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * GET /api/donate/:code
 * Get event info for the donation form.
 * Public endpoint - no authentication required.
 */
router.get(
  '/:code',
  [param('code').isLength({ min: 6, max: 12 })],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Invalid donation code', errors.mapped())
      }

      const { code } = req.params

      // Find event by donation code
      const result = await dbQuery(
        `SELECT
          ae.id,
          ae.name,
          ae.description,
          ae.start_time,
          ae.end_time,
          ae.donation_code_enabled,
          ae.donation_code_expires_at,
          ae.donation_requires_contact,
          ae.donation_require_value_estimate,
          ae.donation_max_images,
          ae.donation_instructions,
          ae.status,
          o.name as organization_name,
          o.logo_url as organization_logo
         FROM auction_events ae
         INNER JOIN organizations o ON ae.organization_id = o.id
         WHERE ae.donation_code = @code`,
        { code: code.toUpperCase() }
      )

      if (result.recordset.length === 0) {
        res.status(404).json({ error: 'Donation link not found' })
        return
      }

      const event = result.recordset[0]

      // Check if donations are enabled
      if (!event.donation_code_enabled) {
        res.status(410).json({ error: 'This donation link is no longer active' })
        return
      }

      // Check if code has expired
      if (event.donation_code_expires_at && new Date(event.donation_code_expires_at) < new Date()) {
        res.status(410).json({ error: 'This donation link has expired' })
        return
      }

      // Check if event has ended
      if (event.status === 'ended' || event.status === 'cancelled') {
        res.status(410).json({ error: 'This event has ended and is no longer accepting donations' })
        return
      }

      res.json({
        event: {
          id: event.id,
          name: event.name,
          description: event.description,
          startsAt: event.start_time,
          endsAt: event.end_time,
        },
        organization: {
          name: event.organization_name,
          logoUrl: event.organization_logo,
        },
        settings: {
          requiresContact: event.donation_requires_contact,
          requireValueEstimate: event.donation_require_value_estimate,
          maxImages: event.donation_max_images,
          instructions: event.donation_instructions,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * POST /api/donate/:code/submit
 * Submit an item for donation.
 * Public endpoint - no authentication required.
 */
router.post(
  '/:code/submit',
  [
    param('code').isLength({ min: 6, max: 12 }),
    body('name').trim().isLength({ min: 1, max: 255 }).withMessage('Item name is required'),
    body('description').optional().trim().isLength({ max: 5000 }),
    body('estimatedValue').optional().isFloat({ min: 0, max: 999999 }),
    body('condition').optional().isIn(['new', 'like_new', 'good', 'fair', 'for_parts']),
    body('category').optional().trim().isLength({ max: 100 }),
    body('donorName').optional().trim().isLength({ max: 255 }),
    body('donorEmail').optional().trim().isEmail().normalizeEmail(),
    body('donorPhone').optional().trim().isLength({ max: 50 }),
    body('donorNotes').optional().trim().isLength({ max: 2000 }),
    body('donorAnonymous').optional().isBoolean(),
    body('imageIds').optional().isArray({ max: 10 }),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped())
      }

      const { code } = req.params
      const {
        name,
        description,
        estimatedValue,
        condition,
        category,
        donorName,
        donorEmail,
        donorPhone,
        donorNotes,
        donorAnonymous,
        imageIds,
      } = req.body

      // Validate donation code and get event
      const eventResult = await dbQuery(
        `SELECT
          ae.id,
          ae.name as event_name,
          ae.donation_code_enabled,
          ae.donation_code_expires_at,
          ae.donation_requires_contact,
          ae.donation_require_value_estimate,
          ae.donation_notify_on_submission,
          ae.donation_auto_thank_donor,
          ae.status,
          ae.end_time,
          o.name as org_name,
          o.contact_email as org_email
         FROM auction_events ae
         INNER JOIN organizations o ON ae.organization_id = o.id
         WHERE ae.donation_code = @code
           AND ae.donation_code_enabled = 1`,
        { code: code.toUpperCase() }
      )

      if (eventResult.recordset.length === 0) {
        res.status(404).json({ error: 'Invalid or expired donation link' })
        return
      }

      const event = eventResult.recordset[0]

      // Validate expiration
      if (event.donation_code_expires_at && new Date(event.donation_code_expires_at) < new Date()) {
        res.status(410).json({ error: 'This donation link has expired' })
        return
      }

      // Validate event hasn't ended
      if (event.status === 'ended' || event.status === 'cancelled') {
        res.status(410).json({ error: 'This event has ended' })
        return
      }

      // Validate required fields based on settings
      const validationErrors: string[] = []

      if (event.donation_requires_contact && !donorEmail?.trim()) {
        validationErrors.push('Email is required')
      }

      if (event.donation_require_value_estimate && !estimatedValue) {
        validationErrors.push('Estimated value is required')
      }

      if (donorEmail && !isValidEmail(donorEmail)) {
        validationErrors.push('Please enter a valid email address')
      }

      if (validationErrors.length > 0) {
        res.status(400).json({ errors: validationErrors })
        return
      }

      // Create submission
      const submissionId = uuidv4()

      await dbQuery(
        `INSERT INTO item_submissions (
          id, event_id, name, description, estimated_value, condition, category,
          donor_name, donor_email, donor_phone, donor_notes, donor_anonymous,
          submitted_ip, user_agent
         ) VALUES (
          @id, @eventId, @name, @description, @estimatedValue, @condition, @category,
          @donorName, @donorEmail, @donorPhone, @donorNotes, @donorAnonymous,
          @ip, @userAgent
         )`,
        {
          id: submissionId,
          eventId: event.id,
          name: name.trim(),
          description: description?.trim() || null,
          estimatedValue: estimatedValue || null,
          condition: condition || null,
          category: category || null,
          donorName: donorName?.trim() || null,
          donorEmail: donorEmail?.trim().toLowerCase() || null,
          donorPhone: donorPhone?.trim() || null,
          donorNotes: donorNotes?.trim() || null,
          donorAnonymous: donorAnonymous || false,
          ip: req.ip || req.socket.remoteAddress || null,
          userAgent: req.get('User-Agent') || null,
        }
      )

      // Link uploaded images to submission
      if (imageIds && imageIds.length > 0) {
        for (let i = 0; i < imageIds.length; i++) {
          await dbQuery(
            `UPDATE submission_images
             SET submission_id = @submissionId, display_order = @displayOrder
             WHERE id = @imageId AND submission_id IS NULL`,
            {
              submissionId,
              imageId: imageIds[i],
              displayOrder: i,
            }
          )
        }

        // Mark first image as primary
        if (imageIds[0]) {
          await dbQuery(
            `UPDATE submission_images SET is_primary = 1 WHERE id = @imageId`,
            { imageId: imageIds[0] }
          )
        }
      }

      // Send notifications
      if (event.donation_notify_on_submission && event.org_email) {
        try {
          await sendNewSubmissionNotificationEmail({
            recipientEmail: event.org_email,
            eventName: event.event_name,
            itemName: name,
            donorName: donorName || 'Anonymous',
            donorEmail: donorEmail || null,
            estimatedValue: estimatedValue || null,
          })
        } catch (err) {
          console.error('Failed to send new submission notification:', err)
        }
      }

      if (event.donation_auto_thank_donor && donorEmail) {
        try {
          await sendDonorThankYouEmail({
            recipientEmail: donorEmail,
            recipientName: donorName || 'Donor',
            itemName: name,
            eventName: event.event_name,
            organizationName: event.org_name,
            estimatedValue: estimatedValue || null,
          })
        } catch (err) {
          console.error('Failed to send donor thank you email:', err)
        }
      }

      res.status(201).json({
        success: true,
        submissionId,
        message: 'Thank you! Your item has been submitted for review.',
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * POST /api/donate/:code/upload-image
 * Upload an image for a submission.
 * Called before final submission to get image IDs.
 * Public endpoint - no authentication required.
 */
router.post(
  '/:code/upload-image',
  [param('code').isLength({ min: 6, max: 12 })],
  upload.single('image'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code } = req.params

      // Validate donation code is active
      const eventResult = await dbQuery(
        `SELECT id, donation_max_images
         FROM auction_events
         WHERE donation_code = @code
           AND donation_code_enabled = 1`,
        { code: code.toUpperCase() }
      )

      if (eventResult.recordset.length === 0) {
        res.status(404).json({ error: 'Invalid donation link' })
        return
      }

      if (!req.file) {
        res.status(400).json({ error: 'No image provided' })
        return
      }

      // Upload to blob storage
      const ext = req.file.originalname.toLowerCase().split('.').pop() || 'jpg'
      const blobName = `submissions/${uuidv4()}.${ext}`

      const contentTypes: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
      }

      const blobUrl = await uploadToBlob(
        req.file.buffer,
        blobName,
        contentTypes[ext] || 'image/jpeg'
      )

      // Create image record (not yet linked to a submission)
      const imageId = uuidv4()

      await dbQuery(
        `INSERT INTO submission_images (
          id, submission_id, blob_url, original_filename, file_size_bytes, mime_type
         ) VALUES (
          @id, NULL, @blobUrl, @filename, @fileSize, @mimeType
         )`,
        {
          id: imageId,
          blobUrl,
          filename: req.file.originalname,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
        }
      )

      res.json({
        imageId,
        imageUrl: blobUrl,
      })
    } catch (error) {
      next(error)
    }
  }
)

export { router as donateRoutes }
