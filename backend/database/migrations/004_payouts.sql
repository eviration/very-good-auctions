-- Migration: Add payout system tables
-- =====================================================

-- 0. Add is_admin field to users table for platform admin access
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'is_admin')
BEGIN
    ALTER TABLE users ADD is_admin BIT DEFAULT 0;
END

GO

-- 1. Add payout fields to auction_events table
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('auction_events') AND name = 'payout_eligible_at')
BEGIN
    ALTER TABLE auction_events ADD
        payout_eligible_at DATETIME2 NULL,
        payout_status NVARCHAR(50) DEFAULT 'pending',
        payout_held_reason NVARCHAR(255) NULL,
        payout_transferred_at DATETIME2 NULL,
        payout_amount DECIMAL(12,2) NULL;
END

GO

-- Add check constraint for payout_status
IF NOT EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CK_event_payout_status')
BEGIN
    ALTER TABLE auction_events ADD CONSTRAINT CK_event_payout_status CHECK (payout_status IN (
        'pending',       -- Waiting for hold period
        'eligible',      -- Ready to pay out
        'processing',    -- Transfer initiated
        'completed',     -- Money sent
        'held',          -- Flagged for review
        'failed'
    ));
END

GO

-- 2. Organization trust levels table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID('organization_trust') AND type = 'U')
BEGIN
    CREATE TABLE organization_trust (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        organization_id UNIQUEIDENTIFIER NOT NULL UNIQUE,

        -- Stats
        successful_events INT DEFAULT 0,
        total_payouts DECIMAL(12,2) DEFAULT 0,
        chargeback_count INT DEFAULT 0,
        chargeback_amount DECIMAL(12,2) DEFAULT 0,

        -- Trust level
        trust_level NVARCHAR(50) DEFAULT 'new',

        -- Limits
        auto_payout_limit DECIMAL(12,2) DEFAULT 500,

        created_at DATETIME2 DEFAULT GETUTCDATE(),
        updated_at DATETIME2 DEFAULT GETUTCDATE(),

        CONSTRAINT FK_org_trust_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        CONSTRAINT CK_trust_level CHECK (trust_level IN (
            'new',           -- First event
            'established',   -- 2-5 successful events
            'trusted',       -- 5+ events, good standing
            'verified_np',   -- Verified nonprofit
            'flagged'        -- Has chargeback history
        ))
    );

    CREATE INDEX idx_org_trust_level ON organization_trust(trust_level);
END

GO

-- 3. Organization payouts table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID('organization_payouts') AND type = 'U')
BEGIN
    CREATE TABLE organization_payouts (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        organization_id UNIQUEIDENTIFIER NOT NULL,
        event_id UNIQUEIDENTIFIER NOT NULL,

        -- Amounts
        gross_amount DECIMAL(12,2) NOT NULL,       -- Total sales
        stripe_fees DECIMAL(12,2) NOT NULL,        -- Processing fees
        platform_fee DECIMAL(12,2) NOT NULL,       -- Our fee (already paid)
        reserve_amount DECIMAL(12,2) NOT NULL,     -- 10% held back
        net_payout DECIMAL(12,2) NOT NULL,         -- What they get now

        -- Stripe transfer
        stripe_transfer_id NVARCHAR(255) NULL,

        -- Status
        status NVARCHAR(50) DEFAULT 'pending',

        -- Review
        flags NVARCHAR(MAX) NULL,                  -- JSON array of flags
        requires_review BIT DEFAULT 0,
        reviewed_by NVARCHAR(128) NULL,
        reviewed_at DATETIME2 NULL,
        review_notes NVARCHAR(MAX) NULL,

        -- Timing
        eligible_at DATETIME2 NOT NULL,
        processed_at DATETIME2 NULL,
        completed_at DATETIME2 NULL,

        created_at DATETIME2 DEFAULT GETUTCDATE(),

        CONSTRAINT FK_org_payouts_organization FOREIGN KEY (organization_id) REFERENCES organizations(id),
        CONSTRAINT FK_org_payouts_event FOREIGN KEY (event_id) REFERENCES auction_events(id),
        CONSTRAINT CK_payout_status CHECK (status IN (
            'pending',
            'processing',
            'completed',
            'failed',
            'held'
        ))
    );

    CREATE INDEX idx_org_payouts_org ON organization_payouts(organization_id);
    CREATE INDEX idx_org_payouts_status ON organization_payouts(status, eligible_at);
    CREATE INDEX idx_org_payouts_review ON organization_payouts(requires_review, status);
END

GO

-- 4. Payout reserves table (10% held for 30 days)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID('payout_reserves') AND type = 'U')
BEGIN
    CREATE TABLE payout_reserves (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        payout_id UNIQUEIDENTIFIER NOT NULL,
        organization_id UNIQUEIDENTIFIER NOT NULL,

        amount DECIMAL(12,2) NOT NULL,
        release_at DATETIME2 NOT NULL,            -- 30 days after initial payout

        status NVARCHAR(50) DEFAULT 'held',

        stripe_transfer_id NVARCHAR(255) NULL,
        released_at DATETIME2 NULL,

        created_at DATETIME2 DEFAULT GETUTCDATE(),

        CONSTRAINT FK_reserves_payout FOREIGN KEY (payout_id) REFERENCES organization_payouts(id),
        CONSTRAINT FK_reserves_organization FOREIGN KEY (organization_id) REFERENCES organizations(id),
        CONSTRAINT CK_reserve_status CHECK (status IN (
            'held',
            'released',
            'forfeited'                            -- If chargebacks exceeded reserve
        ))
    );

    CREATE INDEX idx_reserves_status ON payout_reserves(status, release_at);
    CREATE INDEX idx_reserves_org ON payout_reserves(organization_id);
END

GO

-- 5. Chargebacks table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID('chargebacks') AND type = 'U')
BEGIN
    CREATE TABLE chargebacks (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        organization_id UNIQUEIDENTIFIER NOT NULL,
        event_id UNIQUEIDENTIFIER NULL,
        payout_id UNIQUEIDENTIFIER NULL,

        -- Stripe info
        stripe_dispute_id NVARCHAR(255) NOT NULL UNIQUE,
        stripe_payment_intent_id NVARCHAR(255) NOT NULL,

        amount DECIMAL(10,2) NOT NULL,
        reason NVARCHAR(100) NULL,

        status NVARCHAR(50) DEFAULT 'open',

        deducted_from_reserve BIT DEFAULT 0,

        created_at DATETIME2 DEFAULT GETUTCDATE(),
        resolved_at DATETIME2 NULL,

        CONSTRAINT FK_chargebacks_organization FOREIGN KEY (organization_id) REFERENCES organizations(id),
        CONSTRAINT FK_chargebacks_event FOREIGN KEY (event_id) REFERENCES auction_events(id),
        CONSTRAINT FK_chargebacks_payout FOREIGN KEY (payout_id) REFERENCES organization_payouts(id),
        CONSTRAINT CK_chargeback_status CHECK (status IN (
            'open',
            'won',          -- We won dispute
            'lost',         -- Buyer won
            'closed'
        ))
    );

    CREATE INDEX idx_chargebacks_org ON chargebacks(organization_id);
    CREATE INDEX idx_chargebacks_status ON chargebacks(status);
    CREATE INDEX idx_chargebacks_event ON chargebacks(event_id);
END

GO

-- 6. Create default trust record for existing organizations
INSERT INTO organization_trust (id, organization_id, trust_level, auto_payout_limit)
SELECT NEWID(), id, 'new', 500
FROM organizations
WHERE id NOT IN (SELECT organization_id FROM organization_trust);

GO
