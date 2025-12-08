# Item Donation Submissions - Implementation Plan

## Overview

This feature allows organizations to generate a QR code or link that donors can use to submit items for auction events. Donors fill out a simple form (no account required), and the organization reviews and approves submissions before they appear in the event.

**Relationship to Self-Managed Payments Plan:** This feature is independent but complementary. It can be implemented before, after, or in parallel with the self-managed payments feature. Both features share the same event structure.

---

## User Stories

1. **As an org admin**, I want to generate a donation link/QR code so donors can submit items without me doing data entry
2. **As a donor**, I want to submit an item for auction without creating an account
3. **As an org admin**, I want to review submissions and approve, edit, or reject them
4. **As a donor**, I want to be notified when my item is approved or if there's an issue

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│         ORG ENABLES DONATIONS FOR EVENT                      │
│         Generates unique donation code                       │
│         Gets shareable link + QR code                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              ORG SHARES LINK/QR CODE                         │
│         Email, flyer, social media, newsletter              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              DONOR SCANS QR / CLICKS LINK                    │
│              verygoodauctions.com/donate/[CODE]             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              DONOR FILLS OUT ITEM FORM                       │
│  • Item name & description                                  │
│  • Photos (up to 5)                                         │
│  • Estimated value                                          │
│  • Condition                                                │
│  • Donor name & email                                       │
│  • Optional notes                                           │
│  (No account required)                                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│           SUBMISSION SAVED AS "PENDING"                      │
│           Donor sees thank you page                         │
│           Org admin receives email notification             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              ORG REVIEWS IN DASHBOARD                        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ APPROVE        → Item added to event               │   │
│  │                  Donor notified                     │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ EDIT & APPROVE → Org adjusts details               │   │
│  │                  Item added to event               │   │
│  │                  Donor notified                     │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ REJECT         → Submission removed                │   │
│  │                  Donor notified (optional)         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Database Schema

### 1.1 Add Donation Settings to Events Table

```sql
-- Add donation submission settings to auction_events
ALTER TABLE auction_events ADD
    -- Donation code for public submission link
    donation_code NVARCHAR(12),
    donation_code_enabled BIT DEFAULT 0,
    donation_code_created_at DATETIME2,
    donation_code_expires_at DATETIME2,
    
    -- Submission settings
    donation_requires_contact BIT DEFAULT 1,      -- Require donor email
    donation_require_value_estimate BIT DEFAULT 0, -- Require estimated value
    donation_max_images INT DEFAULT 5,
    donation_instructions NVARCHAR(MAX),          -- Custom instructions shown on form
    
    -- Notification settings
    donation_notify_on_submission BIT DEFAULT 1,  -- Email org on new submission
    donation_auto_thank_donor BIT DEFAULT 1;      -- Send thank you email to donor

-- Add unique constraint on donation_code
CREATE UNIQUE INDEX idx_donation_code ON auction_events(donation_code) WHERE donation_code IS NOT NULL;
```

### 1.2 Create Item Submissions Table

```sql
CREATE TABLE item_submissions (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    event_id UNIQUEIDENTIFIER NOT NULL,
    
    -- Item details (mirrors event_items structure)
    name NVARCHAR(255) NOT NULL,
    description NVARCHAR(MAX),
    estimated_value DECIMAL(10,2),
    condition NVARCHAR(50) CHECK (condition IN (
        'new',
        'like_new',
        'good',
        'fair',
        'for_parts'
    )),
    category NVARCHAR(100),
    
    -- Donor information (not a platform user)
    donor_name NVARCHAR(255),
    donor_email NVARCHAR(255),
    donor_phone NVARCHAR(50),
    donor_notes NVARCHAR(MAX),              -- Anything donor wants to tell org
    donor_anonymous BIT DEFAULT 0,          -- Donor prefers not to be named publicly
    
    -- Review workflow
    status NVARCHAR(20) DEFAULT 'pending' CHECK (status IN (
        'pending',      -- Awaiting review
        'approved',     -- Added to event
        'rejected',     -- Not accepted
        'withdrawn'     -- Donor withdrew submission
    )),
    reviewed_by NVARCHAR(128),              -- User ID of reviewer
    reviewed_at DATETIME2,
    review_notes NVARCHAR(500),             -- Internal notes (not shown to donor)
    rejection_reason NVARCHAR(500),         -- Reason shown to donor if rejected
    
    -- Link to created event_item (after approval)
    event_item_id UNIQUEIDENTIFIER,
    
    -- Metadata
    submitted_at DATETIME2 DEFAULT GETUTCDATE(),
    submitted_ip NVARCHAR(45),
    user_agent NVARCHAR(500),
    
    -- For tracking edits before approval
    last_edited_by NVARCHAR(128),
    last_edited_at DATETIME2,
    
    FOREIGN KEY (event_id) REFERENCES auction_events(id) ON DELETE CASCADE,
    FOREIGN KEY (event_item_id) REFERENCES event_items(id)
);

CREATE INDEX idx_submissions_event ON item_submissions(event_id, status);
CREATE INDEX idx_submissions_status ON item_submissions(status, submitted_at);
CREATE INDEX idx_submissions_donor_email ON item_submissions(donor_email);
```

### 1.3 Create Submission Images Table

```sql
CREATE TABLE submission_images (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    submission_id UNIQUEIDENTIFIER NOT NULL,
    
    -- Image storage
    image_url NVARCHAR(500) NOT NULL,           -- URL in blob storage
    thumbnail_url NVARCHAR(500),                -- Smaller version for listings
    original_filename NVARCHAR(255),
    file_size_bytes INT,
    mime_type NVARCHAR(50),
    
    -- Ordering
    display_order INT DEFAULT 0,
    is_primary BIT DEFAULT 0,                   -- Main image for the item
    
    -- Metadata
    uploaded_at DATETIME2 DEFAULT GETUTCDATE(),
    
    FOREIGN KEY (submission_id) REFERENCES item_submissions(id) ON DELETE CASCADE
);

CREATE INDEX idx_submission_images ON submission_images(submission_id, display_order);
```

### 1.4 Create Migration Script

**File:** `migrations/YYYYMMDD_add_item_submissions.sql`

```sql
-- Migration: Add Item Donation Submissions
-- Description: Allows donors to submit items for auction via public link/QR code

BEGIN TRANSACTION;

-- 1. Add donation settings to auction_events
ALTER TABLE auction_events ADD
    donation_code NVARCHAR(12),
    donation_code_enabled BIT DEFAULT 0,
    donation_code_created_at DATETIME2,
    donation_code_expires_at DATETIME2,
    donation_requires_contact BIT DEFAULT 1,
    donation_require_value_estimate BIT DEFAULT 0,
    donation_max_images INT DEFAULT 5,
    donation_instructions NVARCHAR(MAX),
    donation_notify_on_submission BIT DEFAULT 1,
    donation_auto_thank_donor BIT DEFAULT 1;

-- 2. Create unique index on donation_code
CREATE UNIQUE INDEX idx_donation_code ON auction_events(donation_code) 
    WHERE donation_code IS NOT NULL;

-- 3. Create item_submissions table
CREATE TABLE item_submissions (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    event_id UNIQUEIDENTIFIER NOT NULL,
    name NVARCHAR(255) NOT NULL,
    description NVARCHAR(MAX),
    estimated_value DECIMAL(10,2),
    condition NVARCHAR(50),
    category NVARCHAR(100),
    donor_name NVARCHAR(255),
    donor_email NVARCHAR(255),
    donor_phone NVARCHAR(50),
    donor_notes NVARCHAR(MAX),
    donor_anonymous BIT DEFAULT 0,
    status NVARCHAR(20) DEFAULT 'pending',
    reviewed_by NVARCHAR(128),
    reviewed_at DATETIME2,
    review_notes NVARCHAR(500),
    rejection_reason NVARCHAR(500),
    event_item_id UNIQUEIDENTIFIER,
    submitted_at DATETIME2 DEFAULT GETUTCDATE(),
    submitted_ip NVARCHAR(45),
    user_agent NVARCHAR(500),
    last_edited_by NVARCHAR(128),
    last_edited_at DATETIME2,
    FOREIGN KEY (event_id) REFERENCES auction_events(id) ON DELETE CASCADE,
    FOREIGN KEY (event_item_id) REFERENCES event_items(id)
);

-- 4. Add check constraints
ALTER TABLE item_submissions ADD CONSTRAINT chk_submission_status 
    CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn'));

ALTER TABLE item_submissions ADD CONSTRAINT chk_submission_condition 
    CHECK (condition IN ('new', 'like_new', 'good', 'fair', 'for_parts') OR condition IS NULL);

-- 5. Create indexes
CREATE INDEX idx_submissions_event ON item_submissions(event_id, status);
CREATE INDEX idx_submissions_status ON item_submissions(status, submitted_at);
CREATE INDEX idx_submissions_donor_email ON item_submissions(donor_email);

-- 6. Create submission_images table
CREATE TABLE submission_images (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    submission_id UNIQUEIDENTIFIER NOT NULL,
    image_url NVARCHAR(500) NOT NULL,
    thumbnail_url NVARCHAR(500),
    original_filename NVARCHAR(255),
    file_size_bytes INT,
    mime_type NVARCHAR(50),
    display_order INT DEFAULT 0,
    is_primary BIT DEFAULT 0,
    uploaded_at DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (submission_id) REFERENCES item_submissions(id) ON DELETE CASCADE
);

CREATE INDEX idx_submission_images ON submission_images(submission_id, display_order);

COMMIT;
```

---

## Phase 2: Backend API Endpoints

### 2.1 Public Endpoints (No Auth Required)

**File:** `src/routes/donate.ts`

```typescript
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';

const router = Router();
const upload = multer({ /* config */ });

/**
 * GET /api/donate/:code
 * 
 * Get event info for the donation form.
 * Public endpoint - no authentication required.
 */
router.get('/:code', async (req, res) => {
  const { code } = req.params;
  
  // Find event by donation code
  const event = await db.query(`
    SELECT 
      ae.id,
      ae.name,
      ae.description,
      ae.starts_at,
      ae.ends_at,
      ae.donation_code_enabled,
      ae.donation_code_expires_at,
      ae.donation_requires_contact,
      ae.donation_require_value_estimate,
      ae.donation_max_images,
      ae.donation_instructions,
      o.name as organization_name,
      o.logo_url as organization_logo
    FROM auction_events ae
    JOIN organizations o ON ae.organization_id = o.id
    WHERE ae.donation_code = @code
  `, { code: code.toUpperCase() });
  
  if (!event.length) {
    return res.status(404).json({ error: 'Donation link not found' });
  }
  
  const e = event[0];
  
  // Check if donations are enabled
  if (!e.donation_code_enabled) {
    return res.status(410).json({ error: 'This donation link is no longer active' });
  }
  
  // Check if code has expired
  if (e.donation_code_expires_at && new Date(e.donation_code_expires_at) < new Date()) {
    return res.status(410).json({ error: 'This donation link has expired' });
  }
  
  // Check if event has already ended
  if (e.ends_at && new Date(e.ends_at) < new Date()) {
    return res.status(410).json({ error: 'This event has ended and is no longer accepting donations' });
  }
  
  return res.json({
    event: {
      id: e.id,
      name: e.name,
      description: e.description,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
    },
    organization: {
      name: e.organization_name,
      logoUrl: e.organization_logo,
    },
    settings: {
      requiresContact: e.donation_requires_contact,
      requireValueEstimate: e.donation_require_value_estimate,
      maxImages: e.donation_max_images,
      instructions: e.donation_instructions,
    },
  });
});

/**
 * POST /api/donate/:code/submit
 * 
 * Submit an item for donation.
 * Public endpoint - no authentication required.
 */
router.post('/:code/submit', async (req, res) => {
  const { code } = req.params;
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
    imageIds,  // Array of image IDs from prior uploads
  } = req.body;
  
  // Validate donation code and get event
  const event = await db.query(`
    SELECT 
      ae.id,
      ae.donation_code_enabled,
      ae.donation_code_expires_at,
      ae.donation_requires_contact,
      ae.donation_require_value_estimate,
      ae.donation_notify_on_submission,
      ae.donation_auto_thank_donor,
      ae.ends_at,
      ae.name as event_name,
      o.name as org_name,
      o.contact_email as org_email
    FROM auction_events ae
    JOIN organizations o ON ae.organization_id = o.id
    WHERE ae.donation_code = @code
      AND ae.donation_code_enabled = 1
  `, { code: code.toUpperCase() });
  
  if (!event.length) {
    return res.status(404).json({ error: 'Invalid or expired donation link' });
  }
  
  const e = event[0];
  
  // Validate expiration
  if (e.donation_code_expires_at && new Date(e.donation_code_expires_at) < new Date()) {
    return res.status(410).json({ error: 'This donation link has expired' });
  }
  
  // Validate event hasn't ended
  if (e.ends_at && new Date(e.ends_at) < new Date()) {
    return res.status(410).json({ error: 'This event has ended' });
  }
  
  // Validate required fields
  const errors: string[] = [];
  
  if (!name?.trim()) {
    errors.push('Item name is required');
  }
  
  if (e.donation_requires_contact && !donorEmail?.trim()) {
    errors.push('Email is required');
  }
  
  if (e.donation_require_value_estimate && !estimatedValue) {
    errors.push('Estimated value is required');
  }
  
  if (donorEmail && !isValidEmail(donorEmail)) {
    errors.push('Please enter a valid email address');
  }
  
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  
  // Create submission
  const submissionId = uuidv4();
  
  await db.query(`
    INSERT INTO item_submissions (
      id, event_id, name, description, estimated_value, condition, category,
      donor_name, donor_email, donor_phone, donor_notes, donor_anonymous,
      submitted_ip, user_agent
    ) VALUES (
      @id, @eventId, @name, @description, @estimatedValue, @condition, @category,
      @donorName, @donorEmail, @donorPhone, @donorNotes, @donorAnonymous,
      @ip, @userAgent
    )
  `, {
    id: submissionId,
    eventId: e.id,
    name: name.trim(),
    description: description?.trim(),
    estimatedValue: estimatedValue || null,
    condition: condition || null,
    category: category || null,
    donorName: donorName?.trim(),
    donorEmail: donorEmail?.trim().toLowerCase(),
    donorPhone: donorPhone?.trim(),
    donorNotes: donorNotes?.trim(),
    donorAnonymous: donorAnonymous || false,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });
  
  // Link uploaded images to submission
  if (imageIds?.length > 0) {
    await db.query(`
      UPDATE submission_images 
      SET submission_id = @submissionId
      WHERE id IN (${imageIds.map((_, i) => `@img${i}`).join(',')})
        AND submission_id IS NULL
    `, {
      submissionId,
      ...imageIds.reduce((acc, id, i) => ({ ...acc, [`img${i}`]: id }), {}),
    });
  }
  
  // Send notifications
  if (e.donation_notify_on_submission) {
    await sendNewSubmissionNotification({
      to: e.org_email,
      eventName: e.event_name,
      itemName: name,
      donorName: donorName || 'Anonymous',
      donorEmail: donorEmail,
    });
  }
  
  if (e.donation_auto_thank_donor && donorEmail) {
    await sendDonorThankYou({
      to: donorEmail,
      donorName: donorName,
      itemName: name,
      eventName: e.event_name,
      organizationName: e.org_name,
    });
  }
  
  return res.status(201).json({
    success: true,
    submissionId,
    message: 'Thank you! Your item has been submitted for review.',
  });
});

/**
 * POST /api/donate/:code/upload-image
 * 
 * Upload an image for a submission.
 * Called before final submission to get image IDs.
 * Public endpoint - no authentication required.
 */
router.post('/:code/upload-image', upload.single('image'), async (req, res) => {
  const { code } = req.params;
  
  // Validate donation code is active
  const event = await db.query(`
    SELECT id, donation_max_images
    FROM auction_events
    WHERE donation_code = @code
      AND donation_code_enabled = 1
  `, { code: code.toUpperCase() });
  
  if (!event.length) {
    return res.status(404).json({ error: 'Invalid donation link' });
  }
  
  if (!req.file) {
    return res.status(400).json({ error: 'No image provided' });
  }
  
  // Upload to blob storage (Azure Blob, S3, etc.)
  const imageUrl = await uploadToStorage(req.file, 'submission-images');
  const thumbnailUrl = await createThumbnail(req.file, 'submission-thumbnails');
  
  // Create image record (not yet linked to a submission)
  const imageId = uuidv4();
  
  await db.query(`
    INSERT INTO submission_images (
      id, submission_id, image_url, thumbnail_url, 
      original_filename, file_size_bytes, mime_type, display_order
    ) VALUES (
      @id, NULL, @imageUrl, @thumbnailUrl,
      @filename, @fileSize, @mimeType, 0
    )
  `, {
    id: imageId,
    imageUrl,
    thumbnailUrl,
    filename: req.file.originalname,
    fileSize: req.file.size,
    mimeType: req.file.mimetype,
  });
  
  return res.json({
    imageId,
    imageUrl,
    thumbnailUrl,
  });
});

export default router;
```

### 2.2 Organization Admin Endpoints

**File:** `src/routes/submissions.ts`

```typescript
import { Router } from 'express';
import { requireAuth, requireOrgAdmin } from '../middleware/auth';

const router = Router();

/**
 * GET /api/organizations/:orgId/events/:eventId/submissions
 * 
 * List all submissions for an event.
 */
router.get(
  '/organizations/:orgId/events/:eventId/submissions',
  requireAuth,
  requireOrgAdmin,
  async (req, res) => {
    const { eventId } = req.params;
    const { status } = req.query;  // Optional filter: pending, approved, rejected
    
    let query = `
      SELECT 
        s.*,
        (SELECT COUNT(*) FROM submission_images WHERE submission_id = s.id) as image_count,
        (SELECT TOP 1 thumbnail_url FROM submission_images WHERE submission_id = s.id ORDER BY is_primary DESC, display_order) as primary_image
      FROM item_submissions s
      WHERE s.event_id = @eventId
    `;
    
    const params: any = { eventId };
    
    if (status) {
      query += ` AND s.status = @status`;
      params.status = status;
    }
    
    query += ` ORDER BY 
      CASE s.status WHEN 'pending' THEN 0 ELSE 1 END,
      s.submitted_at DESC
    `;
    
    const submissions = await db.query(query, params);
    
    // Get counts by status
    const counts = await db.query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM item_submissions
      WHERE event_id = @eventId
      GROUP BY status
    `, { eventId });
    
    return res.json({
      submissions,
      counts: {
        pending: counts.find(c => c.status === 'pending')?.count || 0,
        approved: counts.find(c => c.status === 'approved')?.count || 0,
        rejected: counts.find(c => c.status === 'rejected')?.count || 0,
      },
    });
  }
);

/**
 * GET /api/organizations/:orgId/events/:eventId/submissions/:submissionId
 * 
 * Get a single submission with all details.
 */
router.get(
  '/organizations/:orgId/events/:eventId/submissions/:submissionId',
  requireAuth,
  requireOrgAdmin,
  async (req, res) => {
    const { eventId, submissionId } = req.params;
    
    const submission = await db.query(`
      SELECT s.*
      FROM item_submissions s
      WHERE s.id = @submissionId AND s.event_id = @eventId
    `, { submissionId, eventId });
    
    if (!submission.length) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    
    const images = await db.query(`
      SELECT * FROM submission_images
      WHERE submission_id = @submissionId
      ORDER BY is_primary DESC, display_order
    `, { submissionId });
    
    return res.json({
      ...submission[0],
      images,
    });
  }
);

/**
 * POST /api/organizations/:orgId/events/:eventId/submissions/:submissionId/approve
 * 
 * Approve a submission and create an event item.
 */
router.post(
  '/organizations/:orgId/events/:eventId/submissions/:submissionId/approve',
  requireAuth,
  requireOrgAdmin,
  async (req, res) => {
    const { eventId, submissionId } = req.params;
    const { 
      // Optional overrides for the created item
      name,
      description,
      startingBid,
      reservePrice,
      category,
      reviewNotes,
    } = req.body;
    
    const userId = req.user.id;
    
    // Get submission
    const submission = await db.query(`
      SELECT s.*, ae.name as event_name, o.name as org_name
      FROM item_submissions s
      JOIN auction_events ae ON s.event_id = ae.id
      JOIN organizations o ON ae.organization_id = o.id
      WHERE s.id = @submissionId AND s.event_id = @eventId AND s.status = 'pending'
    `, { submissionId, eventId });
    
    if (!submission.length) {
      return res.status(404).json({ error: 'Submission not found or already processed' });
    }
    
    const sub = submission[0];
    
    // Create event item from submission
    const itemId = uuidv4();
    
    await db.query(`
      INSERT INTO event_items (
        id, event_id, name, description, starting_bid, reserve_price, 
        category, condition, status, created_by
      ) VALUES (
        @id, @eventId, @name, @description, @startingBid, @reservePrice,
        @category, @condition, 'draft', @createdBy
      )
    `, {
      id: itemId,
      eventId,
      name: name || sub.name,
      description: description || sub.description,
      startingBid: startingBid || sub.estimated_value || 0,
      reservePrice: reservePrice || null,
      category: category || sub.category,
      condition: sub.condition,
      createdBy: userId,
    });
    
    // Copy images to event_item_images
    const images = await db.query(`
      SELECT * FROM submission_images WHERE submission_id = @submissionId
    `, { submissionId });
    
    for (const img of images) {
      await db.query(`
        INSERT INTO event_item_images (
          id, event_item_id, image_url, thumbnail_url, display_order, is_primary
        ) VALUES (
          NEWID(), @itemId, @imageUrl, @thumbnailUrl, @displayOrder, @isPrimary
        )
      `, {
        itemId,
        imageUrl: img.image_url,
        thumbnailUrl: img.thumbnail_url,
        displayOrder: img.display_order,
        isPrimary: img.is_primary,
      });
    }
    
    // Update submission status
    await db.query(`
      UPDATE item_submissions SET
        status = 'approved',
        reviewed_by = @reviewedBy,
        reviewed_at = GETUTCDATE(),
        review_notes = @reviewNotes,
        event_item_id = @itemId
      WHERE id = @submissionId
    `, {
      submissionId,
      reviewedBy: userId,
      reviewNotes: reviewNotes || null,
      itemId,
    });
    
    // Notify donor
    if (sub.donor_email) {
      await sendSubmissionApproved({
        to: sub.donor_email,
        donorName: sub.donor_name,
        itemName: sub.name,
        eventName: sub.event_name,
        organizationName: sub.org_name,
      });
    }
    
    return res.json({
      success: true,
      eventItemId: itemId,
      message: 'Submission approved and item created',
    });
  }
);

/**
 * PUT /api/organizations/:orgId/events/:eventId/submissions/:submissionId
 * 
 * Edit a submission before approving.
 */
router.put(
  '/organizations/:orgId/events/:eventId/submissions/:submissionId',
  requireAuth,
  requireOrgAdmin,
  async (req, res) => {
    const { eventId, submissionId } = req.params;
    const {
      name,
      description,
      estimatedValue,
      condition,
      category,
    } = req.body;
    
    const userId = req.user.id;
    
    // Verify submission exists and is pending
    const submission = await db.query(`
      SELECT id FROM item_submissions
      WHERE id = @submissionId AND event_id = @eventId AND status = 'pending'
    `, { submissionId, eventId });
    
    if (!submission.length) {
      return res.status(404).json({ error: 'Submission not found or already processed' });
    }
    
    // Update submission
    await db.query(`
      UPDATE item_submissions SET
        name = COALESCE(@name, name),
        description = COALESCE(@description, description),
        estimated_value = COALESCE(@estimatedValue, estimated_value),
        condition = COALESCE(@condition, condition),
        category = COALESCE(@category, category),
        last_edited_by = @editedBy,
        last_edited_at = GETUTCDATE()
      WHERE id = @submissionId
    `, {
      submissionId,
      name,
      description,
      estimatedValue,
      condition,
      category,
      editedBy: userId,
    });
    
    return res.json({ success: true });
  }
);

/**
 * POST /api/organizations/:orgId/events/:eventId/submissions/:submissionId/reject
 * 
 * Reject a submission.
 */
router.post(
  '/organizations/:orgId/events/:eventId/submissions/:submissionId/reject',
  requireAuth,
  requireOrgAdmin,
  async (req, res) => {
    const { eventId, submissionId } = req.params;
    const { reason, notifyDonor = true } = req.body;
    
    const userId = req.user.id;
    
    // Get submission
    const submission = await db.query(`
      SELECT s.*, ae.name as event_name, o.name as org_name
      FROM item_submissions s
      JOIN auction_events ae ON s.event_id = ae.id
      JOIN organizations o ON ae.organization_id = o.id
      WHERE s.id = @submissionId AND s.event_id = @eventId AND s.status = 'pending'
    `, { submissionId, eventId });
    
    if (!submission.length) {
      return res.status(404).json({ error: 'Submission not found or already processed' });
    }
    
    const sub = submission[0];
    
    // Update submission status
    await db.query(`
      UPDATE item_submissions SET
        status = 'rejected',
        reviewed_by = @reviewedBy,
        reviewed_at = GETUTCDATE(),
        rejection_reason = @reason
      WHERE id = @submissionId
    `, {
      submissionId,
      reviewedBy: userId,
      reason: reason || null,
    });
    
    // Optionally notify donor
    if (notifyDonor && sub.donor_email) {
      await sendSubmissionRejected({
        to: sub.donor_email,
        donorName: sub.donor_name,
        itemName: sub.name,
        eventName: sub.event_name,
        organizationName: sub.org_name,
        reason: reason,
      });
    }
    
    return res.json({ success: true });
  }
);

export default router;
```

### 2.3 Donation Code Management Endpoints

**File:** `src/routes/donationCode.ts`

```typescript
import { Router } from 'express';
import { requireAuth, requireOrgAdmin } from '../middleware/auth';
import QRCode from 'qrcode';

const router = Router();

// Characters for donation code (no ambiguous chars: 0/O, 1/I/L)
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateDonationCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/**
 * POST /api/organizations/:orgId/events/:eventId/donation-code
 * 
 * Generate or regenerate a donation code for an event.
 */
router.post(
  '/organizations/:orgId/events/:eventId/donation-code',
  requireAuth,
  requireOrgAdmin,
  async (req, res) => {
    const { eventId } = req.params;
    const {
      expiresAt,
      instructions,
      requiresContact = true,
      requireValueEstimate = false,
      maxImages = 5,
      notifyOnSubmission = true,
      autoThankDonor = true,
    } = req.body;
    
    // Generate unique code
    let code: string;
    let attempts = 0;
    
    do {
      code = generateDonationCode();
      const existing = await db.query(
        `SELECT id FROM auction_events WHERE donation_code = @code`,
        { code }
      );
      if (!existing.length) break;
      attempts++;
    } while (attempts < 10);
    
    if (attempts >= 10) {
      return res.status(500).json({ error: 'Failed to generate unique code' });
    }
    
    // Update event with donation settings
    await db.query(`
      UPDATE auction_events SET
        donation_code = @code,
        donation_code_enabled = 1,
        donation_code_created_at = GETUTCDATE(),
        donation_code_expires_at = @expiresAt,
        donation_instructions = @instructions,
        donation_requires_contact = @requiresContact,
        donation_require_value_estimate = @requireValueEstimate,
        donation_max_images = @maxImages,
        donation_notify_on_submission = @notifyOnSubmission,
        donation_auto_thank_donor = @autoThankDonor
      WHERE id = @eventId
    `, {
      eventId,
      code,
      expiresAt: expiresAt || null,
      instructions: instructions || null,
      requiresContact,
      requireValueEstimate,
      maxImages,
      notifyOnSubmission,
      autoThankDonor,
    });
    
    const donationUrl = `${process.env.FRONTEND_URL}/donate/${code}`;
    
    return res.json({
      code,
      donationUrl,
      enabled: true,
    });
  }
);

/**
 * GET /api/organizations/:orgId/events/:eventId/donation-code
 * 
 * Get current donation code settings.
 */
router.get(
  '/organizations/:orgId/events/:eventId/donation-code',
  requireAuth,
  requireOrgAdmin,
  async (req, res) => {
    const { eventId } = req.params;
    
    const event = await db.query(`
      SELECT 
        donation_code,
        donation_code_enabled,
        donation_code_created_at,
        donation_code_expires_at,
        donation_instructions,
        donation_requires_contact,
        donation_require_value_estimate,
        donation_max_images,
        donation_notify_on_submission,
        donation_auto_thank_donor
      FROM auction_events
      WHERE id = @eventId
    `, { eventId });
    
    if (!event.length) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    const e = event[0];
    
    if (!e.donation_code) {
      return res.json({ enabled: false });
    }
    
    const donationUrl = `${process.env.FRONTEND_URL}/donate/${e.donation_code}`;
    
    return res.json({
      code: e.donation_code,
      donationUrl,
      enabled: e.donation_code_enabled,
      createdAt: e.donation_code_created_at,
      expiresAt: e.donation_code_expires_at,
      settings: {
        instructions: e.donation_instructions,
        requiresContact: e.donation_requires_contact,
        requireValueEstimate: e.donation_require_value_estimate,
        maxImages: e.donation_max_images,
        notifyOnSubmission: e.donation_notify_on_submission,
        autoThankDonor: e.donation_auto_thank_donor,
      },
    });
  }
);

/**
 * DELETE /api/organizations/:orgId/events/:eventId/donation-code
 * 
 * Disable the donation code (doesn't delete, just disables).
 */
router.delete(
  '/organizations/:orgId/events/:eventId/donation-code',
  requireAuth,
  requireOrgAdmin,
  async (req, res) => {
    const { eventId } = req.params;
    
    await db.query(`
      UPDATE auction_events SET
        donation_code_enabled = 0
      WHERE id = @eventId
    `, { eventId });
    
    return res.json({ success: true, enabled: false });
  }
);

/**
 * GET /api/organizations/:orgId/events/:eventId/donation-qr
 * 
 * Get QR code image for the donation link.
 */
router.get(
  '/organizations/:orgId/events/:eventId/donation-qr',
  requireAuth,
  requireOrgAdmin,
  async (req, res) => {
    const { eventId } = req.params;
    const { format = 'png', size = 256 } = req.query;
    
    const event = await db.query(`
      SELECT donation_code, donation_code_enabled
      FROM auction_events
      WHERE id = @eventId
    `, { eventId });
    
    if (!event.length || !event[0].donation_code) {
      return res.status(404).json({ error: 'No donation code found' });
    }
    
    const donationUrl = `${process.env.FRONTEND_URL}/donate/${event[0].donation_code}`;
    
    if (format === 'svg') {
      const svg = await QRCode.toString(donationUrl, { type: 'svg' });
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.send(svg);
    } else {
      const png = await QRCode.toBuffer(donationUrl, {
        width: parseInt(size as string) || 256,
        margin: 2,
      });
      res.setHeader('Content-Type', 'image/png');
      return res.send(png);
    }
  }
);

/**
 * PATCH /api/organizations/:orgId/events/:eventId/donation-code
 * 
 * Update donation code settings (without regenerating code).
 */
router.patch(
  '/organizations/:orgId/events/:eventId/donation-code',
  requireAuth,
  requireOrgAdmin,
  async (req, res) => {
    const { eventId } = req.params;
    const {
      enabled,
      expiresAt,
      instructions,
      requiresContact,
      requireValueEstimate,
      maxImages,
      notifyOnSubmission,
      autoThankDonor,
    } = req.body;
    
    // Build dynamic update query
    const updates: string[] = [];
    const params: any = { eventId };
    
    if (enabled !== undefined) {
      updates.push('donation_code_enabled = @enabled');
      params.enabled = enabled;
    }
    if (expiresAt !== undefined) {
      updates.push('donation_code_expires_at = @expiresAt');
      params.expiresAt = expiresAt;
    }
    if (instructions !== undefined) {
      updates.push('donation_instructions = @instructions');
      params.instructions = instructions;
    }
    if (requiresContact !== undefined) {
      updates.push('donation_requires_contact = @requiresContact');
      params.requiresContact = requiresContact;
    }
    if (requireValueEstimate !== undefined) {
      updates.push('donation_require_value_estimate = @requireValueEstimate');
      params.requireValueEstimate = requireValueEstimate;
    }
    if (maxImages !== undefined) {
      updates.push('donation_max_images = @maxImages');
      params.maxImages = maxImages;
    }
    if (notifyOnSubmission !== undefined) {
      updates.push('donation_notify_on_submission = @notifyOnSubmission');
      params.notifyOnSubmission = notifyOnSubmission;
    }
    if (autoThankDonor !== undefined) {
      updates.push('donation_auto_thank_donor = @autoThankDonor');
      params.autoThankDonor = autoThankDonor;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }
    
    await db.query(`
      UPDATE auction_events SET ${updates.join(', ')} WHERE id = @eventId
    `, params);
    
    return res.json({ success: true });
  }
);

export default router;
```

---

## Phase 3: Email Templates

### 3.1 Donor Thank You Email

**File:** `src/emails/templates/donor-thank-you.ts`

```
Subject: Thank you for your donation to [Event Name]!

---

Hi [Donor Name],

Thank you for submitting an item to [Event Name]!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ITEM SUBMITTED

📦 [Item Name]
{{#if estimatedValue}}
💰 Estimated Value: $[Estimated Value]
{{/if}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHAT'S NEXT

[Organization Name] will review your submission and add it to the 
auction. You'll receive an email when your item is approved.

Questions? Contact [Organization Name] at [Org Email]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Thank you for supporting [Organization Name]!

Very Good Auctions
```

### 3.2 New Submission Notification (to Org)

**File:** `src/emails/templates/new-submission-notification.ts`

```
Subject: New item submission for [Event Name]

---

A new item has been submitted for [Event Name]:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 [Item Name]
👤 Donor: [Donor Name] ([Donor Email])
{{#if estimatedValue}}
💰 Estimated Value: $[Estimated Value]
{{/if}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[REVIEW SUBMISSION BUTTON → submissions dashboard URL]

Very Good Auctions
```

### 3.3 Submission Approved Email

**File:** `src/emails/templates/submission-approved.ts`

```
Subject: 🎉 Your item has been added to [Event Name]!

---

Hi [Donor Name],

Great news! Your item has been approved and added to [Event Name].

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 [Item Name]

Your generous donation will help support [Organization Name]'s 
fundraising efforts. Thank you!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{{#if eventStartsAt}}
The auction begins on [Event Start Date]. We'll let you know 
how your item does!
{{/if}}

Thank you for your support,
[Organization Name]

---
Very Good Auctions
```

### 3.4 Submission Rejected Email (Optional)

**File:** `src/emails/templates/submission-rejected.ts`

```
Subject: Update on your item submission for [Event Name]

---

Hi [Donor Name],

Thank you for your interest in donating to [Event Name]. 
Unfortunately, we weren't able to include your item in this auction.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 [Item Name]

{{#if reason}}
Reason: [Reason]
{{/if}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If you have questions or would like to discuss other ways to 
contribute, please contact [Organization Name] at [Org Email].

Thank you for your support,
[Organization Name]

---
Very Good Auctions
```

---

## Phase 4: Frontend Components

### 4.1 Public Donation Form Page

**File:** `src/pages/DonatePage.tsx`

```tsx
// Route: /donate/:code

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

interface DonationInfo {
  event: { id: string; name: string; description: string };
  organization: { name: string; logoUrl: string };
  settings: {
    requiresContact: boolean;
    requireValueEstimate: boolean;
    maxImages: number;
    instructions: string;
  };
}

function DonatePage() {
  const { code } = useParams<{ code: string }>();
  const [info, setInfo] = useState<DonationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [condition, setCondition] = useState('');
  const [donorName, setDonorName] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const [donorPhone, setDonorPhone] = useState('');
  const [donorNotes, setDonorNotes] = useState('');
  const [donorAnonymous, setDonorAnonymous] = useState(false);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  
  useEffect(() => {
    fetchDonationInfo();
  }, [code]);
  
  async function fetchDonationInfo() {
    try {
      const res = await fetch(`/api/donate/${code}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to load donation form');
      }
      setInfo(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  
  async function handleImageUpload(file: File) {
    const formData = new FormData();
    formData.append('image', file);
    
    const res = await fetch(`/api/donate/${code}/upload-image`, {
      method: 'POST',
      body: formData,
    });
    
    if (!res.ok) throw new Error('Failed to upload image');
    
    const data = await res.json();
    setImages([...images, data]);
  }
  
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      const res = await fetch(`/api/donate/${code}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          estimatedValue: estimatedValue ? parseFloat(estimatedValue) : null,
          condition,
          donorName,
          donorEmail,
          donorPhone,
          donorNotes,
          donorAnonymous,
          imageIds: images.map(img => img.imageId),
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.errors?.join(', ') || data.error);
      }
      
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }
  
  if (loading) return <LoadingSpinner />;
  
  if (error) {
    return (
      <div className="max-w-md mx-auto mt-12 text-center">
        <h1 className="text-xl font-bold text-red-600 mb-4">Unable to Load</h1>
        <p className="text-gray-600">{error}</p>
      </div>
    );
  }
  
  if (submitted) {
    return (
      <div className="max-w-md mx-auto mt-12 text-center">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold mb-4">Thank You!</h1>
        <p className="text-gray-600 mb-6">
          Your item has been submitted for review. {info.organization.name} will 
          review your submission and add it to the auction.
        </p>
        {donorEmail && (
          <p className="text-sm text-gray-500">
            We'll send a confirmation to {donorEmail}
          </p>
        )}
      </div>
    );
  }
  
  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="text-center mb-8">
        {info.organization.logoUrl && (
          <img 
            src={info.organization.logoUrl} 
            alt={info.organization.name}
            className="h-16 mx-auto mb-4"
          />
        )}
        <h1 className="text-2xl font-bold">Donate an Item</h1>
        <p className="text-lg text-gray-600">{info.event.name}</p>
        <p className="text-gray-500">{info.organization.name}</p>
      </div>
      
      {/* Custom Instructions */}
      {info.settings.instructions && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="whitespace-pre-wrap">{info.settings.instructions}</p>
        </div>
      )}
      
      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Item Details Section */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Item Details</h2>
          
          <div className="space-y-4">
            <Input
              label="Item Name"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Handmade Quilt"
            />
            
            <Textarea
              label="Description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the item, including size, materials, condition details, etc."
              rows={4}
            />
            
            <Input
              label="Estimated Value"
              type="number"
              min="0"
              step="0.01"
              required={info.settings.requireValueEstimate}
              value={estimatedValue}
              onChange={e => setEstimatedValue(e.target.value)}
              placeholder="0.00"
              prefix="$"
              hint="This helps set a starting bid. The organization may adjust."
            />
            
            <Select
              label="Condition"
              value={condition}
              onChange={e => setCondition(e.target.value)}
            >
              <option value="">Select condition</option>
              <option value="new">New (unused, in original packaging)</option>
              <option value="like_new">Like New (unused or barely used)</option>
              <option value="good">Good (minor wear, fully functional)</option>
              <option value="fair">Fair (visible wear, works fine)</option>
            </Select>
            
            <ImageUploader
              images={images}
              onUpload={handleImageUpload}
              onRemove={(id) => setImages(images.filter(img => img.imageId !== id))}
              maxImages={info.settings.maxImages}
            />
          </div>
        </section>
        
        {/* Donor Information Section */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Your Information</h2>
          
          <div className="space-y-4">
            <Input
              label="Your Name"
              value={donorName}
              onChange={e => setDonorName(e.target.value)}
              placeholder="Jane Smith"
            />
            
            <Input
              label="Email"
              type="email"
              required={info.settings.requiresContact}
              value={donorEmail}
              onChange={e => setDonorEmail(e.target.value)}
              placeholder="jane@example.com"
              hint="We'll notify you when your item is approved"
            />
            
            <Input
              label="Phone (optional)"
              type="tel"
              value={donorPhone}
              onChange={e => setDonorPhone(e.target.value)}
              placeholder="(555) 123-4567"
            />
            
            <Textarea
              label="Anything else we should know? (optional)"
              value={donorNotes}
              onChange={e => setDonorNotes(e.target.value)}
              placeholder="e.g., I can drop off the item at the school office"
              rows={3}
            />
            
            <Checkbox
              label="I prefer to remain anonymous (my name won't be displayed publicly)"
              checked={donorAnonymous}
              onChange={e => setDonorAnonymous(e.target.checked)}
            />
          </div>
        </section>
        
        {/* Submit */}
        <div className="pt-4">
          <Button
            type="submit"
            disabled={submitting}
            className="w-full"
          >
            {submitting ? 'Submitting...' : 'Submit Donation'}
          </Button>
          
          <p className="text-sm text-gray-500 mt-4 text-center">
            By submitting, you confirm this item is yours to donate and agree to our{' '}
            <a href="/terms" className="text-blue-600 hover:underline">Terms of Service</a>.
          </p>
        </div>
      </form>
    </div>
  );
}

export default DonatePage;
```

### 4.2 Submissions Review Dashboard

**File:** `src/pages/OrgEventSubmissions.tsx`

```tsx
// Route: /organizations/:slug/events/:eventId/submissions

import { useState } from 'react';
import { useParams } from 'react-router-dom';

function OrgEventSubmissions() {
  const { slug, eventId } = useParams();
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  
  const { data, isLoading, refetch } = useSubmissions(eventId, statusFilter);
  const { data: codeData } = useDonationCode(eventId);
  
  async function handleApprove(submissionId: string) {
    await approveSubmission(eventId, submissionId);
    refetch();
  }
  
  async function handleReject(submissionId: string, reason?: string) {
    await rejectSubmission(eventId, submissionId, { reason });
    refetch();
  }
  
  return (
    <div className="p-6">
      {/* Header with Donation Link */}
      <div className="flex justify-between items-start mb-6">
        <h1 className="text-2xl font-bold">Item Submissions</h1>
        
        <div className="text-right">
          {codeData?.enabled ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-green-600">✓</span>
                <span className="font-medium">Donations Enabled</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={codeData.donationUrl}
                  className="text-sm bg-white border rounded px-2 py-1 w-64"
                />
                <Button size="sm" onClick={() => copyToClipboard(codeData.donationUrl)}>
                  Copy
                </Button>
                <Button size="sm" variant="outline" onClick={() => openQrModal()}>
                  QR
                </Button>
              </div>
              <Button 
                size="sm" 
                variant="ghost" 
                className="mt-2 text-red-600"
                onClick={() => disableDonationCode()}
              >
                Disable Link
              </Button>
            </div>
          ) : (
            <Button onClick={() => openEnableDonationsModal()}>
              Enable Donation Link
            </Button>
          )}
        </div>
      </div>
      
      {/* Status Tabs */}
      <div className="flex gap-4 mb-6 border-b">
        <TabButton 
          active={statusFilter === 'pending'}
          onClick={() => setStatusFilter('pending')}
          count={data?.counts.pending}
        >
          Pending Review
        </TabButton>
        <TabButton 
          active={statusFilter === 'approved'}
          onClick={() => setStatusFilter('approved')}
          count={data?.counts.approved}
        >
          Approved
        </TabButton>
        <TabButton 
          active={statusFilter === 'rejected'}
          onClick={() => setStatusFilter('rejected')}
          count={data?.counts.rejected}
        >
          Rejected
        </TabButton>
      </div>
      
      {/* Submissions List */}
      {isLoading ? (
        <LoadingSpinner />
      ) : data?.submissions.length === 0 ? (
        <EmptyState 
          icon="📦"
          title="No submissions yet"
          description={
            statusFilter === 'pending' 
              ? "Share your donation link to start receiving item submissions."
              : `No ${statusFilter} submissions.`
          }
        />
      ) : (
        <div className="space-y-4">
          {data.submissions.map(submission => (
            <SubmissionCard
              key={submission.id}
              submission={submission}
              onApprove={() => handleApprove(submission.id)}
              onReject={(reason) => handleReject(submission.id, reason)}
              onEdit={() => openEditModal(submission)}
              onViewDetails={() => openDetailsModal(submission)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SubmissionCard({ submission, onApprove, onReject, onEdit, onViewDetails }) {
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  
  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex gap-4">
        {/* Image */}
        <div className="w-24 h-24 bg-gray-100 rounded overflow-hidden flex-shrink-0">
          {submission.primary_image ? (
            <img 
              src={submission.primary_image} 
              alt={submission.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              No image
            </div>
          )}
        </div>
        
        {/* Details */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg">{submission.name}</h3>
          
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 mt-1">
            {submission.estimated_value && (
              <span>Est. Value: ${submission.estimated_value.toFixed(2)}</span>
            )}
            {submission.condition && (
              <span>Condition: {formatCondition(submission.condition)}</span>
            )}
            <span>{submission.image_count} image{submission.image_count !== 1 ? 's' : ''}</span>
          </div>
          
          <div className="text-sm text-gray-600 mt-2">
            <span className="font-medium">Donor:</span>{' '}
            {submission.donor_name || 'Anonymous'}
            {submission.donor_email && (
              <span className="text-gray-400"> ({submission.donor_email})</span>
            )}
          </div>
          
          <div className="text-sm text-gray-400 mt-1">
            Submitted {formatRelativeTime(submission.submitted_at)}
          </div>
        </div>
        
        {/* Actions */}
        {submission.status === 'pending' && (
          <div className="flex flex-col gap-2">
            <Button size="sm" onClick={onApprove}>
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={onEdit}>
              Edit & Approve
            </Button>
            <Button 
              size="sm" 
              variant="ghost" 
              className="text-red-600"
              onClick={() => setShowRejectForm(true)}
            >
              Reject
            </Button>
            <Button size="sm" variant="ghost" onClick={onViewDetails}>
              View Details
            </Button>
          </div>
        )}
        
        {submission.status === 'approved' && (
          <div className="text-green-600 flex items-center">
            ✓ Approved
          </div>
        )}
        
        {submission.status === 'rejected' && (
          <div className="text-red-600 flex items-center">
            ✗ Rejected
          </div>
        )}
      </div>
      
      {/* Reject Form */}
      {showRejectForm && (
        <div className="mt-4 pt-4 border-t">
          <Textarea
            label="Reason for rejection (optional - will be sent to donor)"
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            rows={2}
          />
          <div className="flex gap-2 mt-2">
            <Button 
              size="sm" 
              variant="destructive"
              onClick={() => {
                onReject(rejectReason);
                setShowRejectForm(false);
              }}
            >
              Confirm Rejection
            </Button>
            <Button 
              size="sm" 
              variant="ghost"
              onClick={() => setShowRejectForm(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

### 4.3 Enable Donations Modal

**File:** `src/components/EnableDonationsModal.tsx`

```tsx
function EnableDonationsModal({ eventId, onClose, onEnabled }) {
  const [instructions, setInstructions] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [requiresContact, setRequiresContact] = useState(true);
  const [requireValueEstimate, setRequireValueEstimate] = useState(false);
  const [notifyOnSubmission, setNotifyOnSubmission] = useState(true);
  const [loading, setLoading] = useState(false);
  
  async function handleEnable() {
    setLoading(true);
    try {
      const result = await enableDonationCode(eventId, {
        instructions,
        expiresAt: expiresAt || null,
        requiresContact,
        requireValueEstimate,
        notifyOnSubmission,
      });
      onEnabled(result);
      onClose();
    } catch (err) {
      // Handle error
    } finally {
      setLoading(false);
    }
  }
  
  return (
    <Modal title="Enable Donation Link" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-gray-600">
          Generate a link that donors can use to submit items for your auction.
          You'll review and approve submissions before they appear.
        </p>
        
        <Textarea
          label="Instructions for Donors (optional)"
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          placeholder="e.g., We're accepting new or gently used items valued at $25 or more."
          rows={3}
        />
        
        <Input
          label="Link Expires (optional)"
          type="datetime-local"
          value={expiresAt}
          onChange={e => setExpiresAt(e.target.value)}
          hint="Leave blank for no expiration"
        />
        
        <div className="space-y-2">
          <Checkbox
            label="Require donor email address"
            checked={requiresContact}
            onChange={e => setRequiresContact(e.target.checked)}
          />
          <Checkbox
            label="Require estimated value"
            checked={requireValueEstimate}
            onChange={e => setRequireValueEstimate(e.target.checked)}
          />
          <Checkbox
            label="Email me when new items are submitted"
            checked={notifyOnSubmission}
            onChange={e => setNotifyOnSubmission(e.target.checked)}
          />
        </div>
        
        <div className="flex gap-2 pt-4">
          <Button onClick={handleEnable} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Donation Link'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

### 4.4 QR Code Modal

**File:** `src/components/DonationQrModal.tsx`

```tsx
function DonationQrModal({ eventId, donationUrl, onClose }) {
  const [qrSize, setQrSize] = useState(256);
  
  const qrImageUrl = `/api/organizations/${orgId}/events/${eventId}/donation-qr?size=${qrSize}`;
  
  async function downloadQr() {
    const res = await fetch(qrImageUrl);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'donation-qr-code.png';
    a.click();
    URL.revokeObjectURL(url);
  }
  
  return (
    <Modal title="Donation QR Code" onClose={onClose}>
      <div className="text-center">
        <img 
          src={qrImageUrl} 
          alt="Donation QR Code"
          className="mx-auto mb-4"
          style={{ width: qrSize, height: qrSize }}
        />
        
        <p className="text-sm text-gray-600 mb-4 break-all">
          {donationUrl}
        </p>
        
        <div className="flex justify-center gap-2 mb-4">
          <Button onClick={downloadQr}>
            Download QR Code
          </Button>
          <Button variant="outline" onClick={() => copyToClipboard(donationUrl)}>
            Copy Link
          </Button>
        </div>
        
        <div className="text-sm text-gray-500">
          <p>Print this QR code on flyers, posters, or include in emails.</p>
          <p>Donors can scan it to submit items directly.</p>
        </div>
      </div>
    </Modal>
  );
}
```

---

## Phase 5: Navigation & Routing

### 5.1 Add Routes

**File:** `src/App.tsx` or router config

```tsx
// Public donation route (no auth)
<Route path="/donate/:code" element={<DonatePage />} />

// Org admin route
<Route 
  path="/organizations/:slug/events/:eventId/submissions" 
  element={<OrgEventSubmissions />} 
/>
```

### 5.2 Add Navigation Links

In event management navigation:

```tsx
// Add to event management tabs
<NavLink to={`/organizations/${slug}/events/${eventId}/items`}>
  Items
</NavLink>
<NavLink to={`/organizations/${slug}/events/${eventId}/submissions`}>
  Submissions
  {pendingCount > 0 && (
    <Badge variant="warning">{pendingCount}</Badge>
  )}
</NavLink>
```

---

## Phase 6: Image Storage

### 6.1 Storage Configuration

Images should be stored in blob storage (Azure Blob, AWS S3, etc.). 

**File:** `src/services/storage.ts`

```typescript
import { BlobServiceClient } from '@azure/storage-blob';

const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING!
);

export async function uploadToStorage(
  file: Express.Multer.File,
  container: string
): Promise<string> {
  const containerClient = blobServiceClient.getContainerClient(container);
  
  // Generate unique filename
  const filename = `${Date.now()}-${file.originalname}`;
  const blockBlobClient = containerClient.getBlockBlobClient(filename);
  
  await blockBlobClient.upload(file.buffer, file.size, {
    blobHTTPHeaders: { blobContentType: file.mimetype },
  });
  
  return blockBlobClient.url;
}

export async function createThumbnail(
  file: Express.Multer.File,
  container: string
): Promise<string> {
  // Use sharp or similar to resize
  const sharp = require('sharp');
  const thumbnail = await sharp(file.buffer)
    .resize(300, 300, { fit: 'cover' })
    .jpeg({ quality: 80 })
    .toBuffer();
  
  const containerClient = blobServiceClient.getContainerClient(container);
  const filename = `${Date.now()}-thumb-${file.originalname}`;
  const blockBlobClient = containerClient.getBlockBlobClient(filename);
  
  await blockBlobClient.upload(thumbnail, thumbnail.length, {
    blobHTTPHeaders: { blobContentType: 'image/jpeg' },
  });
  
  return blockBlobClient.url;
}
```

---

## Testing Checklist

### Donation Code Management
- [ ] Can generate donation code for event
- [ ] Code is unique across all events
- [ ] Can disable/enable donation code
- [ ] Can update donation settings
- [ ] QR code generates correctly
- [ ] QR code downloads correctly

### Public Donation Form
- [ ] Form loads with correct event/org info
- [ ] Expired codes show appropriate error
- [ ] Disabled codes show appropriate error
- [ ] Required fields are enforced based on settings
- [ ] Images upload successfully
- [ ] Form submits successfully
- [ ] Thank you page displays after submission

### Submission Review
- [ ] Pending submissions appear in dashboard
- [ ] Can filter by status
- [ ] Can approve submission (creates event item)
- [ ] Can edit and approve submission
- [ ] Can reject submission with reason
- [ ] Images copied to event item on approval

### Notifications
- [ ] Donor receives thank you email
- [ ] Org receives new submission notification
- [ ] Donor receives approval notification
- [ ] Donor receives rejection notification (if enabled)

### Edge Cases
- [ ] Handle submission after event has ended
- [ ] Handle maximum image uploads
- [ ] Handle large images (resize/compress)
- [ ] Handle duplicate submissions from same donor

---

## Files Summary

### New Files to Create

| File | Purpose |
|------|---------|
| `migrations/YYYYMMDD_add_item_submissions.sql` | Database migration |
| `src/routes/donate.ts` | Public donation endpoints |
| `src/routes/submissions.ts` | Org admin submission management |
| `src/routes/donationCode.ts` | Donation code management |
| `src/pages/DonatePage.tsx` | Public donation form |
| `src/pages/OrgEventSubmissions.tsx` | Submission review dashboard |
| `src/components/EnableDonationsModal.tsx` | Enable donations settings |
| `src/components/DonationQrModal.tsx` | QR code display/download |
| `src/components/SubmissionCard.tsx` | Submission list item |
| `src/components/ImageUploader.tsx` | Multi-image upload component |
| `src/emails/templates/donor-thank-you.ts` | Thank you email |
| `src/emails/templates/new-submission-notification.ts` | Notify org |
| `src/emails/templates/submission-approved.ts` | Approval email |
| `src/emails/templates/submission-rejected.ts` | Rejection email |

### Files to Modify

| File | Changes |
|------|---------|
| `src/App.tsx` | Add routes |
| Event management nav | Add Submissions tab |
| `src/services/storage.ts` | Add upload functions (if not exists) |

---

## Estimated Effort

| Phase | Time |
|-------|------|
| Phase 1: Database | 1 hour |
| Phase 2: Backend API | 4-5 hours |
| Phase 3: Email Templates | 1-2 hours |
| Phase 4: Frontend Components | 5-6 hours |
| Phase 5: Navigation | 30 minutes |
| Phase 6: Image Storage | 1-2 hours |
| Testing | 2 hours |

**Total: 15-19 hours (2-3 days)**

---

## Dependencies

This feature requires:
- Image upload/storage capability (Azure Blob, S3, etc.)
- Email sending service (already used for other notifications)
- QR code library (`qrcode` npm package)
- Image processing library (`sharp` for thumbnails)

No dependency on Self-Managed Payments - these features are independent.

---

## Notes for Claude Code

1. **Start with database migration** - Run this first
2. **Public routes need no auth** - The `/donate/:code` routes are intentionally public
3. **Follow existing patterns** - Look at how event items and images are handled
4. **Rate limiting** - Consider adding rate limiting to public submission endpoint
5. **Image validation** - Validate file types and sizes on upload
6. **Cleanup job** - Consider a job to delete orphaned images (uploaded but never attached to a submission)
