-- Migration: Add donor info columns to event_items
-- These columns allow tracking donor information when items are added directly
-- by event organizers (not through the public donation submission flow)

-- Add donor_name column
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('event_items') AND name = 'donor_name')
    ALTER TABLE event_items ADD donor_name NVARCHAR(255) NULL;

GO

-- Add donor_email column
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('event_items') AND name = 'donor_email')
    ALTER TABLE event_items ADD donor_email NVARCHAR(255) NULL;

GO

-- Add category column (also missing, used in admin item creation)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('event_items') AND name = 'category')
    ALTER TABLE event_items ADD category NVARCHAR(100) NULL;

GO

PRINT 'Migration 017_event_items_donor_info.sql completed successfully!';
