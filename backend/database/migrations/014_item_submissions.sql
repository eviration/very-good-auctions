-- Migration: 014_item_submissions
-- Add item donation submissions feature allowing donors to submit items via public link/QR code

-- 1. Add donation settings to auction_events table
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('auction_events') AND name = 'donation_code')
BEGIN
    ALTER TABLE auction_events ADD
        donation_code NVARCHAR(12) NULL,
        donation_code_enabled BIT DEFAULT 0,
        donation_code_created_at DATETIME2 NULL,
        donation_code_expires_at DATETIME2 NULL,
        donation_requires_contact BIT DEFAULT 1,
        donation_require_value_estimate BIT DEFAULT 0,
        donation_max_images INT DEFAULT 5,
        donation_instructions NVARCHAR(MAX) NULL,
        donation_notify_on_submission BIT DEFAULT 1,
        donation_auto_thank_donor BIT DEFAULT 1;

    PRINT 'Added donation settings columns to auction_events';
END
GO

-- Create unique index on donation_code (filtered to non-null values)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_auction_events_donation_code')
BEGIN
    CREATE UNIQUE INDEX IX_auction_events_donation_code
        ON auction_events(donation_code)
        WHERE donation_code IS NOT NULL;

    PRINT 'Created unique index on donation_code';
END
GO

-- 2. Create item_submissions table
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'item_submissions')
BEGIN
    CREATE TABLE item_submissions (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        event_id UNIQUEIDENTIFIER NOT NULL,

        -- Item details
        name NVARCHAR(255) NOT NULL,
        description NVARCHAR(MAX) NULL,
        estimated_value DECIMAL(10,2) NULL,
        condition NVARCHAR(50) NULL,
        category NVARCHAR(100) NULL,

        -- Donor information (not a platform user)
        donor_name NVARCHAR(255) NULL,
        donor_email NVARCHAR(255) NULL,
        donor_phone NVARCHAR(50) NULL,
        donor_notes NVARCHAR(MAX) NULL,
        donor_anonymous BIT DEFAULT 0,

        -- Review workflow
        status NVARCHAR(20) DEFAULT 'pending',
        reviewed_by NVARCHAR(128) NULL,
        reviewed_at DATETIME2 NULL,
        review_notes NVARCHAR(500) NULL,
        rejection_reason NVARCHAR(500) NULL,

        -- Link to created event_item (after approval)
        event_item_id UNIQUEIDENTIFIER NULL,

        -- Metadata
        submitted_at DATETIME2 DEFAULT GETUTCDATE(),
        submitted_ip NVARCHAR(45) NULL,
        user_agent NVARCHAR(500) NULL,

        -- For tracking edits before approval
        last_edited_by NVARCHAR(128) NULL,
        last_edited_at DATETIME2 NULL,

        CONSTRAINT FK_item_submissions_event FOREIGN KEY (event_id)
            REFERENCES auction_events(id) ON DELETE CASCADE,
        CONSTRAINT FK_item_submissions_event_item FOREIGN KEY (event_item_id)
            REFERENCES event_items(id),
        CONSTRAINT CHK_item_submissions_status CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
        CONSTRAINT CHK_item_submissions_condition CHECK (condition IS NULL OR condition IN ('new', 'like_new', 'good', 'fair', 'for_parts'))
    );

    -- Create indexes
    CREATE INDEX IX_item_submissions_event ON item_submissions(event_id, status);
    CREATE INDEX IX_item_submissions_status ON item_submissions(status, submitted_at);
    CREATE INDEX IX_item_submissions_donor_email ON item_submissions(donor_email);

    PRINT 'Created item_submissions table';
END
GO

-- 3. Create submission_images table
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'submission_images')
BEGIN
    CREATE TABLE submission_images (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        submission_id UNIQUEIDENTIFIER NULL,

        -- Image storage
        blob_url NVARCHAR(500) NOT NULL,
        thumbnail_url NVARCHAR(500) NULL,
        original_filename NVARCHAR(255) NULL,
        file_size_bytes INT NULL,
        mime_type NVARCHAR(50) NULL,

        -- Ordering
        display_order INT DEFAULT 0,
        is_primary BIT DEFAULT 0,

        -- Metadata
        uploaded_at DATETIME2 DEFAULT GETUTCDATE(),

        CONSTRAINT FK_submission_images_submission FOREIGN KEY (submission_id)
            REFERENCES item_submissions(id) ON DELETE CASCADE
    );

    CREATE INDEX IX_submission_images_submission ON submission_images(submission_id, display_order);

    PRINT 'Created submission_images table';
END
GO
