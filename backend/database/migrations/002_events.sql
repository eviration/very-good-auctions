-- Migration: Event-Based Multi-Item Auctions
-- Creates auction_events, event_items, event_item_images, event_item_bids,
-- event_item_silent_bids, platform_fees, and user_notifications tables

-- =====================================================
-- 1. Platform Fees Table (must be created first for FK)
-- =====================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='platform_fees' AND xtype='U')
CREATE TABLE platform_fees (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),

    -- Who paid
    user_id NVARCHAR(128),
    organization_id UNIQUEIDENTIFIER,

    -- What they paid for (event_id added after auction_events table created)
    event_id UNIQUEIDENTIFIER,

    fee_type NVARCHAR(50) NOT NULL CHECK (fee_type IN (
        'event_small',
        'event_medium',
        'event_large',
        'event_unlimited',
        'item_sale'
    )),

    amount DECIMAL(10,2) NOT NULL,

    -- Payment info
    stripe_payment_intent_id NVARCHAR(255),
    status NVARCHAR(50) DEFAULT 'pending' CHECK (status IN (
        'pending',
        'paid',
        'refunded',
        'waived'
    )),

    -- Refund eligibility
    refund_eligible_until DATETIME2,
    refunded_at DATETIME2,
    refund_reason NVARCHAR(255),

    created_at DATETIME2 DEFAULT GETUTCDATE(),

    CONSTRAINT fk_platform_fees_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_platform_fees_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_platform_fees_org' AND object_id = OBJECT_ID('platform_fees'))
    CREATE INDEX idx_platform_fees_org ON platform_fees(organization_id);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_platform_fees_user' AND object_id = OBJECT_ID('platform_fees'))
    CREATE INDEX idx_platform_fees_user ON platform_fees(user_id);

GO

-- =====================================================
-- 2. Auction Events Table
-- =====================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='auction_events' AND xtype='U')
CREATE TABLE auction_events (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),

    -- Polymorphic ownership (one or the other, not both)
    organization_id UNIQUEIDENTIFIER NULL,
    owner_id NVARCHAR(128) NULL,

    -- Basic info
    name NVARCHAR(255) NOT NULL,
    slug NVARCHAR(100) NOT NULL,
    description NVARCHAR(MAX),
    cover_image_url NVARCHAR(500),

    -- Timing
    start_time DATETIME2 NOT NULL,
    end_time DATETIME2 NOT NULL,
    submission_deadline DATETIME2,

    -- Auction settings
    auction_type NVARCHAR(20) DEFAULT 'standard' CHECK (auction_type IN ('standard', 'silent')),
    is_multi_item BIT DEFAULT 1,

    -- Bid increment settings
    increment_type NVARCHAR(10) DEFAULT 'fixed' CHECK (increment_type IN ('fixed', 'percent')),
    increment_value DECIMAL(10,2) DEFAULT 1.00,

    -- Buy now at event level
    buy_now_enabled BIT DEFAULT 0,

    -- Access control (same code for submission + bidding)
    access_code NVARCHAR(6),

    -- Tier & limits
    tier NVARCHAR(20) NOT NULL CHECK (tier IN ('small', 'medium', 'large', 'unlimited')),
    max_items INT NOT NULL,

    -- Status
    status NVARCHAR(50) DEFAULT 'draft' CHECK (status IN (
        'draft',
        'scheduled',
        'active',
        'ended',
        'cancelled'
    )),

    -- Payment
    fee_id UNIQUEIDENTIFIER,

    -- Stats (denormalized for performance)
    item_count INT DEFAULT 0,
    total_bids INT DEFAULT 0,
    total_raised DECIMAL(12,2) DEFAULT 0,

    -- Metadata
    created_by NVARCHAR(128) NOT NULL,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),

    CONSTRAINT chk_event_owner CHECK (
        (organization_id IS NOT NULL AND owner_id IS NULL) OR
        (organization_id IS NULL AND owner_id IS NOT NULL)
    ),
    CONSTRAINT fk_events_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    CONSTRAINT fk_events_owner FOREIGN KEY (owner_id) REFERENCES users(id),
    CONSTRAINT fk_events_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_events_fee FOREIGN KEY (fee_id) REFERENCES platform_fees(id)
);

GO

-- Indexes for auction_events
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_events_org' AND object_id = OBJECT_ID('auction_events'))
    CREATE INDEX idx_events_org ON auction_events(organization_id);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_events_owner' AND object_id = OBJECT_ID('auction_events'))
    CREATE INDEX idx_events_owner ON auction_events(owner_id);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_events_status' AND object_id = OBJECT_ID('auction_events'))
    CREATE INDEX idx_events_status ON auction_events(status, start_time);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_events_slug' AND object_id = OBJECT_ID('auction_events'))
    CREATE UNIQUE INDEX idx_events_slug ON auction_events(slug) WHERE organization_id IS NULL;

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_events_org_slug' AND object_id = OBJECT_ID('auction_events'))
    CREATE UNIQUE INDEX idx_events_org_slug ON auction_events(organization_id, slug) WHERE organization_id IS NOT NULL;

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_events_access_code' AND object_id = OBJECT_ID('auction_events'))
    CREATE INDEX idx_events_access_code ON auction_events(access_code);

GO

-- Add FK from platform_fees to auction_events (now that it exists)
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'fk_platform_fees_event')
    ALTER TABLE platform_fees ADD CONSTRAINT fk_platform_fees_event
        FOREIGN KEY (event_id) REFERENCES auction_events(id);

GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_platform_fees_event' AND object_id = OBJECT_ID('platform_fees'))
    CREATE INDEX idx_platform_fees_event ON platform_fees(event_id);

GO

-- =====================================================
-- 3. Event Items Table (with submission workflow)
-- =====================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='event_items' AND xtype='U')
CREATE TABLE event_items (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    event_id UNIQUEIDENTIFIER NOT NULL,

    -- Item info
    title NVARCHAR(255) NOT NULL,
    description NVARCHAR(MAX),
    condition NVARCHAR(50),

    -- Pricing
    starting_price DECIMAL(10,2),
    buy_now_price DECIMAL(10,2),
    current_bid DECIMAL(10,2),
    bid_count INT DEFAULT 0,

    -- Buy now tracking
    buy_now_purchased_by NVARCHAR(128),
    buy_now_purchased_at DATETIME2,

    -- Winner (populated after auction ends)
    winning_bid_id UNIQUEIDENTIFIER,
    winner_id NVARCHAR(128),
    winner_notified_at DATETIME2,

    -- Submission tracking
    submitted_by NVARCHAR(128) NOT NULL,

    -- Review workflow
    submission_status NVARCHAR(50) DEFAULT 'pending' CHECK (submission_status IN (
        'pending',
        'approved',
        'rejected',
        'resubmit_requested'
    )),
    reviewed_by NVARCHAR(128),
    reviewed_at DATETIME2,
    rejection_reason NVARCHAR(500),
    allow_resubmit BIT DEFAULT 0,

    -- Item status (for approved items)
    status NVARCHAR(50) DEFAULT 'pending' CHECK (status IN (
        'pending',
        'active',
        'sold',
        'won',
        'unsold',
        'removed'
    )),
    removed_reason NVARCHAR(255),
    removed_at DATETIME2,
    removed_by NVARCHAR(128),

    display_order INT DEFAULT 0,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),

    CONSTRAINT fk_event_items_event FOREIGN KEY (event_id) REFERENCES auction_events(id) ON DELETE CASCADE,
    CONSTRAINT fk_event_items_submitter FOREIGN KEY (submitted_by) REFERENCES users(id),
    CONSTRAINT fk_event_items_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id),
    CONSTRAINT fk_event_items_winner FOREIGN KEY (winner_id) REFERENCES users(id),
    CONSTRAINT fk_event_items_remover FOREIGN KEY (removed_by) REFERENCES users(id),
    CONSTRAINT fk_event_items_buyer FOREIGN KEY (buy_now_purchased_by) REFERENCES users(id)
);

GO

-- Indexes for event_items
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_event_items_event' AND object_id = OBJECT_ID('event_items'))
    CREATE INDEX idx_event_items_event ON event_items(event_id);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_event_items_submitter' AND object_id = OBJECT_ID('event_items'))
    CREATE INDEX idx_event_items_submitter ON event_items(submitted_by);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_event_items_submission_status' AND object_id = OBJECT_ID('event_items'))
    CREATE INDEX idx_event_items_submission_status ON event_items(event_id, submission_status);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_event_items_status' AND object_id = OBJECT_ID('event_items'))
    CREATE INDEX idx_event_items_status ON event_items(event_id, status);

GO

-- =====================================================
-- 4. Event Item Images Table
-- =====================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='event_item_images' AND xtype='U')
CREATE TABLE event_item_images (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    item_id UNIQUEIDENTIFIER NOT NULL,

    blob_url NVARCHAR(500) NOT NULL,
    display_order INT DEFAULT 0,
    is_primary BIT DEFAULT 0,

    uploaded_by NVARCHAR(128) NOT NULL,
    created_at DATETIME2 DEFAULT GETUTCDATE(),

    CONSTRAINT fk_event_item_images_item FOREIGN KEY (item_id) REFERENCES event_items(id) ON DELETE CASCADE,
    CONSTRAINT fk_event_item_images_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_event_item_images_item' AND object_id = OBJECT_ID('event_item_images'))
    CREATE INDEX idx_event_item_images_item ON event_item_images(item_id);

GO

-- =====================================================
-- 5. Event Item Bids Table (Standard Auctions)
-- =====================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='event_item_bids' AND xtype='U')
CREATE TABLE event_item_bids (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    item_id UNIQUEIDENTIFIER NOT NULL,
    bidder_id NVARCHAR(128) NOT NULL,

    amount DECIMAL(10,2) NOT NULL,
    is_winning BIT DEFAULT 0,

    created_at DATETIME2 DEFAULT GETUTCDATE(),

    CONSTRAINT fk_event_item_bids_item FOREIGN KEY (item_id) REFERENCES event_items(id) ON DELETE CASCADE,
    CONSTRAINT fk_event_item_bids_bidder FOREIGN KEY (bidder_id) REFERENCES users(id)
);

GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_event_item_bids_item' AND object_id = OBJECT_ID('event_item_bids'))
    CREATE INDEX idx_event_item_bids_item ON event_item_bids(item_id);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_event_item_bids_bidder' AND object_id = OBJECT_ID('event_item_bids'))
    CREATE INDEX idx_event_item_bids_bidder ON event_item_bids(bidder_id);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_event_item_bids_winning' AND object_id = OBJECT_ID('event_item_bids'))
    CREATE INDEX idx_event_item_bids_winning ON event_item_bids(item_id, is_winning) WHERE is_winning = 1;

GO

-- =====================================================
-- 6. Event Item Silent Bids Table (Silent Auctions)
-- =====================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='event_item_silent_bids' AND xtype='U')
CREATE TABLE event_item_silent_bids (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    item_id UNIQUEIDENTIFIER NOT NULL,
    bidder_id NVARCHAR(128) NOT NULL,

    amount DECIMAL(10,2) NOT NULL,
    initial_amount DECIMAL(10,2) NOT NULL,
    increase_count INT DEFAULT 0,
    last_increased_at DATETIME2,

    is_winner BIT DEFAULT 0,
    winner_notified_at DATETIME2,

    notify_on_outbid BIT DEFAULT 1,
    last_outbid_notification_at DATETIME2,

    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),

    CONSTRAINT fk_event_silent_bids_item FOREIGN KEY (item_id) REFERENCES event_items(id) ON DELETE CASCADE,
    CONSTRAINT fk_event_silent_bids_bidder FOREIGN KEY (bidder_id) REFERENCES users(id),
    CONSTRAINT uq_silent_bid_per_user UNIQUE (item_id, bidder_id)
);

GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_event_silent_bids_item' AND object_id = OBJECT_ID('event_item_silent_bids'))
    CREATE INDEX idx_event_silent_bids_item ON event_item_silent_bids(item_id);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_event_silent_bids_bidder' AND object_id = OBJECT_ID('event_item_silent_bids'))
    CREATE INDEX idx_event_silent_bids_bidder ON event_item_silent_bids(bidder_id);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_event_silent_bids_ranking' AND object_id = OBJECT_ID('event_item_silent_bids'))
    CREATE INDEX idx_event_silent_bids_ranking ON event_item_silent_bids(item_id, amount DESC, created_at ASC);

GO

-- =====================================================
-- 7. User Notifications Table
-- =====================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='user_notifications' AND xtype='U')
CREATE TABLE user_notifications (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    user_id NVARCHAR(128) NOT NULL,

    notification_type NVARCHAR(50) NOT NULL CHECK (notification_type IN (
        'item_approved',
        'item_rejected',
        'resubmit_requested',
        'event_live',
        'outbid',
        'auction_won',
        'auction_lost',
        'item_removed',
        'bid_cancelled'
    )),

    -- Related entities
    event_id UNIQUEIDENTIFIER,
    item_id UNIQUEIDENTIFIER,

    title NVARCHAR(255) NOT NULL,
    message NVARCHAR(MAX),

    -- Delivery status
    read_at DATETIME2,
    email_sent_at DATETIME2,
    facebook_sent_at DATETIME2,

    created_at DATETIME2 DEFAULT GETUTCDATE()
);

GO

-- Add FKs for user_notifications (separate for idempotency)
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'fk_notifications_user')
    ALTER TABLE user_notifications ADD CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id) REFERENCES users(id);

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'fk_notifications_event')
    ALTER TABLE user_notifications ADD CONSTRAINT fk_notifications_event
        FOREIGN KEY (event_id) REFERENCES auction_events(id) ON DELETE SET NULL;

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'fk_notifications_item')
    ALTER TABLE user_notifications ADD CONSTRAINT fk_notifications_item
        FOREIGN KEY (item_id) REFERENCES event_items(id) ON DELETE SET NULL;

GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_notifications_user' AND object_id = OBJECT_ID('user_notifications'))
    CREATE INDEX idx_notifications_user ON user_notifications(user_id, read_at);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_notifications_unread' AND object_id = OBJECT_ID('user_notifications'))
    CREATE INDEX idx_notifications_unread ON user_notifications(user_id, created_at DESC) WHERE read_at IS NULL;

GO

PRINT 'Events migration (002_events.sql) completed successfully!';
