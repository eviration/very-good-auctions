-- Migration: 015_uat_system.sql
-- Description: Creates tables for UAT (User Acceptance Testing) environment
-- Created: 2024-12-08

-- =====================================================
-- UAT Settings Table (singleton - only one row)
-- =====================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'uat_settings')
BEGIN
    CREATE TABLE uat_settings (
        id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- Only one row allowed

        -- Global time offset (in seconds)
        -- Positive = future, Negative = past
        global_time_offset_seconds BIGINT DEFAULT 0,

        -- Pause time (freeze at this moment)
        time_frozen_at DATETIME2,
        is_time_frozen BIT DEFAULT 0,

        -- Last modified
        updated_at DATETIME2 DEFAULT GETUTCDATE(),
        updated_by NVARCHAR(128)
    );

    -- Insert the singleton row
    INSERT INTO uat_settings (id) VALUES (1);
    PRINT 'Created table: uat_settings'
END
GO

-- =====================================================
-- UAT Sessions Table
-- =====================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'uat_sessions')
BEGIN
    CREATE TABLE uat_sessions (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        name NVARCHAR(255) NOT NULL,           -- "Sprint 5 Testing", "Beta Round 2"
        description NVARCHAR(MAX),

        -- Session timing
        starts_at DATETIME2 NOT NULL,
        ends_at DATETIME2,
        status NVARCHAR(20) DEFAULT 'scheduled' CHECK (status IN (
            'scheduled',
            'active',
            'paused',
            'completed'
        )),

        -- Configuration
        features_to_test NVARCHAR(MAX),         -- JSON array of features
        test_scenarios NVARCHAR(MAX),           -- JSON array of scenarios

        created_at DATETIME2 DEFAULT GETUTCDATE(),
        created_by NVARCHAR(128)
    );
    PRINT 'Created table: uat_sessions'
END
GO

-- =====================================================
-- UAT Testers Table
-- =====================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'uat_testers')
BEGIN
    CREATE TABLE uat_testers (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),

        -- Invitation
        email NVARCHAR(255) NOT NULL,
        name NVARCHAR(255),
        invitation_token NVARCHAR(64) UNIQUE,
        invitation_sent_at DATETIME2,
        invitation_expires_at DATETIME2,

        -- Status
        status NVARCHAR(20) DEFAULT 'invited' CHECK (status IN (
            'invited',        -- Email sent, not yet registered
            'registered',     -- Created account
            'active',         -- Participating in testing
            'inactive'        -- No longer testing
        )),
        registered_at DATETIME2,
        last_active_at DATETIME2,

        -- Linked user (after registration)
        user_id NVARCHAR(128),

        -- UAT session (optional - can be session-specific or general)
        uat_session_id UNIQUEIDENTIFIER,

        -- Tester role
        role NVARCHAR(20) DEFAULT 'tester' CHECK (role IN (
            'tester',         -- Regular tester
            'power_tester',   -- Can access more controls
            'admin'           -- Full UAT admin
        )),

        -- Contact preferences
        notify_on_new_session BIT DEFAULT 1,
        notify_on_session_start BIT DEFAULT 1,

        created_at DATETIME2 DEFAULT GETUTCDATE(),

        FOREIGN KEY (uat_session_id) REFERENCES uat_sessions(id)
    );

    CREATE INDEX idx_uat_testers_email ON uat_testers(email);
    CREATE INDEX idx_uat_testers_token ON uat_testers(invitation_token);
    CREATE INDEX idx_uat_testers_user_id ON uat_testers(user_id);
    CREATE INDEX idx_uat_testers_status ON uat_testers(status);
    PRINT 'Created table: uat_testers'
END
GO

-- =====================================================
-- UAT Feedback Table
-- =====================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'uat_feedback')
BEGIN
    CREATE TABLE uat_feedback (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),

        -- Who submitted
        tester_id UNIQUEIDENTIFIER,
        user_id NVARCHAR(128),

        -- Context
        uat_session_id UNIQUEIDENTIFIER,
        page_url NVARCHAR(500),
        feature_area NVARCHAR(100),             -- e.g., "bidding", "checkout", "org-dashboard"

        -- Feedback content
        feedback_type NVARCHAR(20) CHECK (feedback_type IN (
            'bug',
            'suggestion',
            'question',
            'praise',
            'other'
        )),
        title NVARCHAR(255),
        description NVARCHAR(MAX),
        steps_to_reproduce NVARCHAR(MAX),
        expected_behavior NVARCHAR(MAX),
        actual_behavior NVARCHAR(MAX),

        -- Attachments
        screenshot_urls NVARCHAR(MAX),          -- JSON array of URLs

        -- Browser/device info (auto-captured)
        browser_info NVARCHAR(500),
        device_info NVARCHAR(255),
        screen_resolution NVARCHAR(50),

        -- Status tracking
        status NVARCHAR(20) DEFAULT 'new' CHECK (status IN (
            'new',
            'reviewed',
            'in_progress',
            'resolved',
            'wont_fix',
            'duplicate'
        )),
        priority NVARCHAR(20) CHECK (priority IN (
            'critical',
            'high',
            'medium',
            'low'
        )),
        assigned_to NVARCHAR(128),
        resolution_notes NVARCHAR(MAX),
        resolved_at DATETIME2,

        -- Metadata
        submitted_at DATETIME2 DEFAULT GETUTCDATE(),

        FOREIGN KEY (tester_id) REFERENCES uat_testers(id),
        FOREIGN KEY (uat_session_id) REFERENCES uat_sessions(id)
    );

    CREATE INDEX idx_uat_feedback_session ON uat_feedback(uat_session_id, status);
    CREATE INDEX idx_uat_feedback_tester ON uat_feedback(tester_id);
    CREATE INDEX idx_uat_feedback_status ON uat_feedback(status);
    CREATE INDEX idx_uat_feedback_type ON uat_feedback(feedback_type);
    PRINT 'Created table: uat_feedback'
END
GO

-- =====================================================
-- Add UAT columns to auction_events
-- =====================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('auction_events') AND name = 'is_test_event')
BEGIN
    ALTER TABLE auction_events ADD is_test_event BIT DEFAULT 0;
    PRINT 'Added column: auction_events.is_test_event'
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('auction_events') AND name = 'simulated_current_time')
BEGIN
    ALTER TABLE auction_events ADD simulated_current_time DATETIME2;
    PRINT 'Added column: auction_events.simulated_current_time'
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('auction_events') AND name = 'phase_override')
BEGIN
    ALTER TABLE auction_events ADD phase_override NVARCHAR(20) CHECK (phase_override IN (
        'draft',
        'scheduled',
        'active',
        'ending_soon',
        'ended',
        'closed'
    ));
    PRINT 'Added column: auction_events.phase_override'
END
GO

PRINT 'Migration 015_uat_system.sql completed'
GO
