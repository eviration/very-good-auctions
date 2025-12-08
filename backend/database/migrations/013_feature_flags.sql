-- Migration: 013_feature_flags
-- Add feature flags table for platform-wide configuration

-- Create feature_flags table
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'feature_flags')
BEGIN
    CREATE TABLE feature_flags (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        flag_key NVARCHAR(100) NOT NULL UNIQUE,
        flag_value BIT NOT NULL DEFAULT 1,
        description NVARCHAR(500) NULL,
        updated_by NVARCHAR(128) NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    );

    CREATE UNIQUE INDEX IX_feature_flags_key ON feature_flags(flag_key);

    PRINT 'Created feature_flags table';
END
GO

-- Create feature_flag_audit_log table to track changes
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'feature_flag_audit_log')
BEGIN
    CREATE TABLE feature_flag_audit_log (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        flag_key NVARCHAR(100) NOT NULL,
        old_value BIT NULL,
        new_value BIT NOT NULL,
        changed_by_user_id NVARCHAR(128) NOT NULL,
        changed_by_email NVARCHAR(255) NOT NULL,
        reason NVARCHAR(500) NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    );

    CREATE INDEX IX_feature_flag_audit_log_flag ON feature_flag_audit_log(flag_key);
    CREATE INDEX IX_feature_flag_audit_log_created_at ON feature_flag_audit_log(created_at DESC);

    PRINT 'Created feature_flag_audit_log table';
END
GO

-- Seed default feature flags
-- Integrated payments (Stripe Connect)
IF NOT EXISTS (SELECT 1 FROM feature_flags WHERE flag_key = 'integrated_payments_enabled')
BEGIN
    INSERT INTO feature_flags (flag_key, flag_value, description)
    VALUES ('integrated_payments_enabled', 1, 'Enable integrated payments via Stripe Connect for auction winners');
    PRINT 'Added integrated_payments_enabled flag (enabled by default)';
END
GO

-- Self-managed payments
IF NOT EXISTS (SELECT 1 FROM feature_flags WHERE flag_key = 'self_managed_payments_enabled')
BEGIN
    INSERT INTO feature_flags (flag_key, flag_value, description)
    VALUES ('self_managed_payments_enabled', 1, 'Enable self-managed payments where organizations handle payments directly');
    PRINT 'Added self_managed_payments_enabled flag (enabled by default)';
END
GO

-- Free mode (no platform fees)
IF NOT EXISTS (SELECT 1 FROM feature_flags WHERE flag_key = 'free_mode_enabled')
BEGIN
    INSERT INTO feature_flags (flag_key, flag_value, description)
    VALUES ('free_mode_enabled', 0, 'Enable free mode which waives all platform fees for auctions');
    PRINT 'Added free_mode_enabled flag (disabled by default)';
END
GO

-- Silent auctions
IF NOT EXISTS (SELECT 1 FROM feature_flags WHERE flag_key = 'silent_auctions_enabled')
BEGIN
    INSERT INTO feature_flags (flag_key, flag_value, description)
    VALUES ('silent_auctions_enabled', 1, 'Enable silent auction type where bids are hidden until auction ends');
    PRINT 'Added silent_auctions_enabled flag (enabled by default)';
END
GO

-- Standard auctions
IF NOT EXISTS (SELECT 1 FROM feature_flags WHERE flag_key = 'standard_auctions_enabled')
BEGIN
    INSERT INTO feature_flags (flag_key, flag_value, description)
    VALUES ('standard_auctions_enabled', 1, 'Enable standard auction type where bids are visible in real-time');
    PRINT 'Added standard_auctions_enabled flag (enabled by default)';
END
GO
