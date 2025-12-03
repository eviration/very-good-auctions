-- Migration: Add feedback and feature request system
-- =====================================================
-- User feedback, feature requests, admin responses

-- 1. Feedback table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID('feedback') AND type = 'U')
BEGIN
    CREATE TABLE feedback (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),

        -- Who submitted the feedback
        user_id NVARCHAR(128) NOT NULL,
        user_email NVARCHAR(255) NOT NULL,
        user_name NVARCHAR(255) NOT NULL,

        -- Context (optional - where the feedback came from)
        organization_id UNIQUEIDENTIFIER NULL,
        event_id UNIQUEIDENTIFIER NULL,

        -- Feedback content
        feedback_type NVARCHAR(50) NOT NULL,
        title NVARCHAR(255) NOT NULL,
        description NVARCHAR(MAX) NOT NULL,

        -- Categorization and prioritization
        priority NVARCHAR(20) DEFAULT 'medium',
        category NVARCHAR(100) NULL,
        tags NVARCHAR(500) NULL,

        -- Status tracking
        status NVARCHAR(50) DEFAULT 'new',

        -- Admin assignment
        assigned_to NVARCHAR(128) NULL,

        -- Resolution
        resolution_notes NVARCHAR(MAX) NULL,
        resolved_at DATETIME2 NULL,
        resolved_by NVARCHAR(128) NULL,

        -- Timestamps
        created_at DATETIME2 DEFAULT GETUTCDATE(),
        updated_at DATETIME2 DEFAULT GETUTCDATE(),

        -- Constraints
        CONSTRAINT FK_feedback_user FOREIGN KEY (user_id) REFERENCES users(id),
        CONSTRAINT FK_feedback_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
        CONSTRAINT FK_feedback_event FOREIGN KEY (event_id) REFERENCES auction_events(id),
        CONSTRAINT CK_feedback_type CHECK (feedback_type IN ('bug', 'feature', 'improvement', 'question', 'other')),
        CONSTRAINT CK_feedback_priority CHECK (priority IN ('low', 'medium', 'high', 'critical')),
        CONSTRAINT CK_feedback_status CHECK (status IN ('new', 'under_review', 'planned', 'in_progress', 'completed', 'wont_fix', 'duplicate'))
    );

    CREATE INDEX idx_feedback_user ON feedback(user_id);
    CREATE INDEX idx_feedback_org ON feedback(organization_id);
    CREATE INDEX idx_feedback_event ON feedback(event_id);
    CREATE INDEX idx_feedback_status ON feedback(status);
    CREATE INDEX idx_feedback_type ON feedback(feedback_type);
    CREATE INDEX idx_feedback_priority ON feedback(priority);
    CREATE INDEX idx_feedback_created ON feedback(created_at DESC);
END

GO

-- 2. Feedback responses table (admin responses to feedback)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID('feedback_responses') AND type = 'U')
BEGIN
    CREATE TABLE feedback_responses (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),

        feedback_id UNIQUEIDENTIFIER NOT NULL,

        -- Who responded
        responder_id NVARCHAR(128) NOT NULL,
        responder_name NVARCHAR(255) NOT NULL,
        is_admin BIT DEFAULT 0,

        -- Response content
        message NVARCHAR(MAX) NOT NULL,

        -- Internal note (only visible to admins)
        is_internal BIT DEFAULT 0,

        -- Timestamps
        created_at DATETIME2 DEFAULT GETUTCDATE(),
        updated_at DATETIME2 DEFAULT GETUTCDATE(),

        CONSTRAINT FK_feedback_response_feedback FOREIGN KEY (feedback_id) REFERENCES feedback(id) ON DELETE CASCADE,
        CONSTRAINT FK_feedback_response_user FOREIGN KEY (responder_id) REFERENCES users(id)
    );

    CREATE INDEX idx_feedback_responses_feedback ON feedback_responses(feedback_id);
    CREATE INDEX idx_feedback_responses_responder ON feedback_responses(responder_id);
    CREATE INDEX idx_feedback_responses_created ON feedback_responses(created_at);
END

GO

-- 3. Feedback votes table (for feature request voting)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID('feedback_votes') AND type = 'U')
BEGIN
    CREATE TABLE feedback_votes (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),

        feedback_id UNIQUEIDENTIFIER NOT NULL,
        user_id NVARCHAR(128) NOT NULL,

        created_at DATETIME2 DEFAULT GETUTCDATE(),

        CONSTRAINT FK_feedback_vote_feedback FOREIGN KEY (feedback_id) REFERENCES feedback(id) ON DELETE CASCADE,
        CONSTRAINT FK_feedback_vote_user FOREIGN KEY (user_id) REFERENCES users(id),
        CONSTRAINT UQ_feedback_vote UNIQUE (feedback_id, user_id)
    );

    CREATE INDEX idx_feedback_votes_feedback ON feedback_votes(feedback_id);
    CREATE INDEX idx_feedback_votes_user ON feedback_votes(user_id);
END

GO
