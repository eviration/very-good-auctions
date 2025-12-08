-- Migration: Self-Managed Payments Support
-- Adds payment mode, fulfillment tracking, and self-managed payment fields
-- Allows organizations to handle payments externally (Venmo, PayPal, cash, etc.)

-- =====================================================
-- 1. Add columns to auction_events for payment mode
-- =====================================================

-- Payment mode selection
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('auction_events') AND name = 'payment_mode')
    ALTER TABLE auction_events ADD payment_mode NVARCHAR(20) DEFAULT 'integrated';

GO

-- Self-managed payment info (only used when payment_mode = 'self_managed')
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('auction_events') AND name = 'payment_instructions')
    ALTER TABLE auction_events ADD payment_instructions NVARCHAR(MAX);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('auction_events') AND name = 'payment_link')
    ALTER TABLE auction_events ADD payment_link NVARCHAR(500);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('auction_events') AND name = 'payment_qr_code_url')
    ALTER TABLE auction_events ADD payment_qr_code_url NVARCHAR(500);

GO

-- Fulfillment configuration
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('auction_events') AND name = 'fulfillment_type')
    ALTER TABLE auction_events ADD fulfillment_type NVARCHAR(20) DEFAULT 'shipping';

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('auction_events') AND name = 'pickup_instructions')
    ALTER TABLE auction_events ADD pickup_instructions NVARCHAR(MAX);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('auction_events') AND name = 'pickup_location')
    ALTER TABLE auction_events ADD pickup_location NVARCHAR(500);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('auction_events') AND name = 'pickup_address_line1')
    ALTER TABLE auction_events ADD pickup_address_line1 NVARCHAR(255);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('auction_events') AND name = 'pickup_address_line2')
    ALTER TABLE auction_events ADD pickup_address_line2 NVARCHAR(255);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('auction_events') AND name = 'pickup_city')
    ALTER TABLE auction_events ADD pickup_city NVARCHAR(100);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('auction_events') AND name = 'pickup_state')
    ALTER TABLE auction_events ADD pickup_state NVARCHAR(50);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('auction_events') AND name = 'pickup_postal_code')
    ALTER TABLE auction_events ADD pickup_postal_code NVARCHAR(20);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('auction_events') AND name = 'pickup_dates')
    ALTER TABLE auction_events ADD pickup_dates NVARCHAR(500);

GO

-- Payment reminder settings
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('auction_events') AND name = 'payment_due_days')
    ALTER TABLE auction_events ADD payment_due_days INT DEFAULT 7;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('auction_events') AND name = 'send_payment_reminders')
    ALTER TABLE auction_events ADD send_payment_reminders BIT DEFAULT 1;

GO

-- Add check constraint for payment_mode
IF NOT EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'chk_payment_mode')
    ALTER TABLE auction_events ADD CONSTRAINT chk_payment_mode
        CHECK (payment_mode IN ('self_managed', 'integrated'));

GO

-- Add check constraint for fulfillment_type
IF NOT EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'chk_event_fulfillment_type')
    ALTER TABLE auction_events ADD CONSTRAINT chk_event_fulfillment_type
        CHECK (fulfillment_type IN ('shipping', 'pickup', 'both', 'digital'));

GO

-- =====================================================
-- 2. Add columns to event_items for payment/fulfillment tracking
-- =====================================================

-- Payment status (org confirms manually for self-managed)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('event_items') AND name = 'payment_status')
    ALTER TABLE event_items ADD payment_status NVARCHAR(20) DEFAULT 'pending';

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('event_items') AND name = 'payment_confirmed_at')
    ALTER TABLE event_items ADD payment_confirmed_at DATETIME2;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('event_items') AND name = 'payment_confirmed_by')
    ALTER TABLE event_items ADD payment_confirmed_by NVARCHAR(128);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('event_items') AND name = 'payment_method_used')
    ALTER TABLE event_items ADD payment_method_used NVARCHAR(100);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('event_items') AND name = 'payment_notes')
    ALTER TABLE event_items ADD payment_notes NVARCHAR(500);

GO

-- Fulfillment status
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('event_items') AND name = 'fulfillment_status')
    ALTER TABLE event_items ADD fulfillment_status NVARCHAR(20) DEFAULT 'pending';

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('event_items') AND name = 'fulfillment_type')
    ALTER TABLE event_items ADD fulfillment_type NVARCHAR(20);

GO

-- Shipping info (when fulfillment_type = 'shipping')
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('event_items') AND name = 'tracking_number')
    ALTER TABLE event_items ADD tracking_number NVARCHAR(100);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('event_items') AND name = 'tracking_carrier')
    ALTER TABLE event_items ADD tracking_carrier NVARCHAR(50);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('event_items') AND name = 'tracking_url')
    ALTER TABLE event_items ADD tracking_url NVARCHAR(500);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('event_items') AND name = 'shipped_at')
    ALTER TABLE event_items ADD shipped_at DATETIME2;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('event_items') AND name = 'estimated_delivery')
    ALTER TABLE event_items ADD estimated_delivery NVARCHAR(100);

GO

-- Pickup info (when fulfillment_type = 'pickup')
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('event_items') AND name = 'pickup_ready_at')
    ALTER TABLE event_items ADD pickup_ready_at DATETIME2;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('event_items') AND name = 'pickup_completed_at')
    ALTER TABLE event_items ADD pickup_completed_at DATETIME2;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('event_items') AND name = 'pickup_completed_by')
    ALTER TABLE event_items ADD pickup_completed_by NVARCHAR(255);

GO

-- Digital delivery (when fulfillment_type = 'digital')
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('event_items') AND name = 'digital_delivery_info')
    ALTER TABLE event_items ADD digital_delivery_info NVARCHAR(MAX);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('event_items') AND name = 'digital_delivered_at')
    ALTER TABLE event_items ADD digital_delivered_at DATETIME2;

GO

-- General fulfillment
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('event_items') AND name = 'fulfillment_notes')
    ALTER TABLE event_items ADD fulfillment_notes NVARCHAR(500);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('event_items') AND name = 'fulfilled_at')
    ALTER TABLE event_items ADD fulfilled_at DATETIME2;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('event_items') AND name = 'fulfilled_by')
    ALTER TABLE event_items ADD fulfilled_by NVARCHAR(128);

GO

-- Add check constraints for event_items
IF NOT EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'chk_item_payment_status')
    ALTER TABLE event_items ADD CONSTRAINT chk_item_payment_status
        CHECK (payment_status IN ('pending', 'paid', 'payment_issue', 'waived', 'refunded'));

GO

IF NOT EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'chk_item_fulfillment_status')
    ALTER TABLE event_items ADD CONSTRAINT chk_item_fulfillment_status
        CHECK (fulfillment_status IN ('pending', 'processing', 'ready_for_pickup', 'shipped', 'out_for_delivery', 'delivered', 'picked_up', 'issue'));

GO

IF NOT EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'chk_item_fulfillment_type')
    ALTER TABLE event_items ADD CONSTRAINT chk_item_fulfillment_type
        CHECK (fulfillment_type IS NULL OR fulfillment_type IN ('shipping', 'pickup', 'digital'));

GO

-- =====================================================
-- 3. Create payment_reminders table
-- =====================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='payment_reminders' AND xtype='U')
CREATE TABLE payment_reminders (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    event_item_id UNIQUEIDENTIFIER NOT NULL,
    user_id NVARCHAR(128) NOT NULL,

    reminder_number INT NOT NULL,
    sent_at DATETIME2 DEFAULT GETUTCDATE(),

    CONSTRAINT fk_reminders_item FOREIGN KEY (event_item_id) REFERENCES event_items(id) ON DELETE CASCADE,
    CONSTRAINT fk_reminders_user FOREIGN KEY (user_id) REFERENCES users(id)
);

GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_reminders_item' AND object_id = OBJECT_ID('payment_reminders'))
    CREATE INDEX idx_reminders_item ON payment_reminders(event_item_id);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_reminders_user' AND object_id = OBJECT_ID('payment_reminders'))
    CREATE INDEX idx_reminders_user ON payment_reminders(user_id);

GO

-- =====================================================
-- 4. Add indexes for new columns
-- =====================================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_events_payment_mode' AND object_id = OBJECT_ID('auction_events'))
    CREATE INDEX idx_events_payment_mode ON auction_events(payment_mode);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_items_payment_status' AND object_id = OBJECT_ID('event_items'))
    CREATE INDEX idx_items_payment_status ON event_items(payment_status);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_items_fulfillment_status' AND object_id = OBJECT_ID('event_items'))
    CREATE INDEX idx_items_fulfillment_status ON event_items(fulfillment_status);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_items_winner_payment' AND object_id = OBJECT_ID('event_items'))
    CREATE INDEX idx_items_winner_payment ON event_items(winner_id, payment_status) WHERE winner_id IS NOT NULL;

GO

-- =====================================================
-- 5. Add notification types for self-managed payments
-- =====================================================

-- Drop and recreate the check constraint to add new notification types
IF EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CK__user_noti__notif__7C4F7684')
    ALTER TABLE user_notifications DROP CONSTRAINT CK__user_noti__notif__7C4F7684;

-- The constraint might have a different auto-generated name, try to find it
DECLARE @constraintName NVARCHAR(128)
SELECT @constraintName = name
FROM sys.check_constraints
WHERE parent_object_id = OBJECT_ID('user_notifications')
  AND definition LIKE '%notification_type%'

IF @constraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE user_notifications DROP CONSTRAINT ' + @constraintName)
END

GO

-- Add the new constraint with additional notification types
IF NOT EXISTS (SELECT * FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID('user_notifications') AND definition LIKE '%payment_reminder%')
    ALTER TABLE user_notifications ADD CONSTRAINT chk_notification_type CHECK (notification_type IN (
        'item_approved',
        'item_rejected',
        'resubmit_requested',
        'event_live',
        'outbid',
        'auction_won',
        'auction_lost',
        'item_removed',
        'bid_cancelled',
        -- New self-managed payment notification types
        'payment_reminder',
        'payment_confirmed',
        'item_shipped',
        'ready_for_pickup',
        'item_delivered',
        'digital_delivered'
    ));

GO

-- =====================================================
-- 6. Update existing events to use integrated mode
-- =====================================================
UPDATE auction_events
SET payment_mode = 'integrated'
WHERE payment_mode IS NULL;

UPDATE auction_events
SET fulfillment_type = 'shipping'
WHERE fulfillment_type IS NULL;

GO

PRINT 'Self-managed payments migration (012_self_managed_payments.sql) completed successfully!';
