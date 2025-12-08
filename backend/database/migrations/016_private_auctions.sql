-- Migration: 016_private_auctions.sql
-- Description: Add private auction support with invitation system
-- Created: 2024-12-08

-- =====================================================
-- Add visibility column to auction_events
-- =====================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('auction_events') AND name = 'visibility')
BEGIN
    ALTER TABLE auction_events ADD visibility NVARCHAR(20) DEFAULT 'public' CHECK (visibility IN ('public', 'private'));
    PRINT 'Added column: auction_events.visibility'
END
GO

-- =====================================================
-- Add invite_code for private auctions (separate from access_code)
-- =====================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('auction_events') AND name = 'invite_code')
BEGIN
    ALTER TABLE auction_events ADD invite_code NVARCHAR(12) NULL;
    PRINT 'Added column: auction_events.invite_code'
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_events_invite_code' AND object_id = OBJECT_ID('auction_events'))
BEGIN
    CREATE UNIQUE INDEX idx_events_invite_code ON auction_events(invite_code) WHERE invite_code IS NOT NULL;
    PRINT 'Created index: idx_events_invite_code'
END
GO

-- =====================================================
-- Event Invitations Table (for bidders)
-- =====================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'event_invitations')
BEGIN
    CREATE TABLE event_invitations (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        event_id UNIQUEIDENTIFIER NOT NULL,

        -- Invitation details
        email NVARCHAR(255) NOT NULL,
        name NVARCHAR(255),
        invitation_token NVARCHAR(64) UNIQUE,

        -- Role: bidder can bid, submitter can submit items, both can do both
        role NVARCHAR(20) DEFAULT 'bidder' CHECK (role IN ('bidder', 'submitter', 'both')),

        -- Status tracking
        status NVARCHAR(20) DEFAULT 'pending' CHECK (status IN (
            'pending',      -- Invited, not yet accepted
            'accepted',     -- User accepted the invitation
            'declined',     -- User explicitly declined
            'revoked'       -- Admin revoked the invitation
        )),

        -- Linked user (after acceptance)
        user_id NVARCHAR(128),

        -- Timing
        invited_at DATETIME2 DEFAULT GETUTCDATE(),
        invited_by NVARCHAR(128),
        accepted_at DATETIME2,
        expires_at DATETIME2,

        -- For QR code / link invites
        joined_via NVARCHAR(20) CHECK (joined_via IN ('email', 'link', 'qr_code')),

        CONSTRAINT FK_event_invitations_event FOREIGN KEY (event_id) REFERENCES auction_events(id) ON DELETE CASCADE,
        CONSTRAINT FK_event_invitations_user FOREIGN KEY (user_id) REFERENCES users(id),
        CONSTRAINT FK_event_invitations_inviter FOREIGN KEY (invited_by) REFERENCES users(id)
    );

    CREATE INDEX idx_event_invitations_event ON event_invitations(event_id, status);
    CREATE INDEX idx_event_invitations_email ON event_invitations(email);
    CREATE INDEX idx_event_invitations_token ON event_invitations(invitation_token);
    CREATE INDEX idx_event_invitations_user ON event_invitations(user_id);

    PRINT 'Created table: event_invitations'
END
GO

-- =====================================================
-- Event Participants Table (approved bidders/submitters for private events)
-- =====================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'event_participants')
BEGIN
    CREATE TABLE event_participants (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        event_id UNIQUEIDENTIFIER NOT NULL,
        user_id NVARCHAR(128) NOT NULL,

        -- Role permissions
        can_bid BIT DEFAULT 1,
        can_submit_items BIT DEFAULT 0,

        -- How they joined
        joined_via NVARCHAR(20) DEFAULT 'invitation' CHECK (joined_via IN ('invitation', 'invite_code', 'donation_code', 'admin_added')),
        invitation_id UNIQUEIDENTIFIER,

        -- Status
        is_active BIT DEFAULT 1,
        removed_at DATETIME2,
        removed_by NVARCHAR(128),
        removal_reason NVARCHAR(255),

        -- Activity tracking
        joined_at DATETIME2 DEFAULT GETUTCDATE(),
        last_activity_at DATETIME2,

        CONSTRAINT FK_event_participants_event FOREIGN KEY (event_id) REFERENCES auction_events(id) ON DELETE CASCADE,
        CONSTRAINT FK_event_participants_user FOREIGN KEY (user_id) REFERENCES users(id),
        CONSTRAINT FK_event_participants_invitation FOREIGN KEY (invitation_id) REFERENCES event_invitations(id),
        CONSTRAINT FK_event_participants_remover FOREIGN KEY (removed_by) REFERENCES users(id),
        CONSTRAINT UQ_event_participant UNIQUE (event_id, user_id)
    );

    CREATE INDEX idx_event_participants_event ON event_participants(event_id, is_active);
    CREATE INDEX idx_event_participants_user ON event_participants(user_id);

    PRINT 'Created table: event_participants'
END
GO

-- =====================================================
-- Add private_auctions_enabled feature flag
-- =====================================================
IF NOT EXISTS (SELECT 1 FROM feature_flags WHERE flag_key = 'private_auctions_enabled')
BEGIN
    INSERT INTO feature_flags (flag_key, flag_value, description)
    VALUES ('private_auctions_enabled', 1, 'Enable private auctions where bidders must be invited or use an invite code');
    PRINT 'Added private_auctions_enabled flag (enabled by default)'
END
GO

PRINT 'Migration 016_private_auctions.sql completed'
GO
