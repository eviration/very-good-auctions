-- Migration: 007_platform_admins
-- Add platform admin column to users table

-- Add is_platform_admin column to users table
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('users') AND name = 'is_platform_admin'
)
BEGIN
    ALTER TABLE users ADD is_platform_admin BIT NOT NULL DEFAULT 0;
    PRINT 'Added is_platform_admin column to users table';
END
GO

-- Create index for faster admin lookups
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_users_is_platform_admin' AND object_id = OBJECT_ID('users')
)
BEGIN
    CREATE INDEX IX_users_is_platform_admin ON users(is_platform_admin) WHERE is_platform_admin = 1;
    PRINT 'Created IX_users_is_platform_admin index';
END
GO

-- Seed initial platform admin (nathan.prentice@gmail.com)
-- This will set the admin flag when the user first logs in and their record exists
UPDATE users
SET is_platform_admin = 1
WHERE LOWER(email) = 'nathan.prentice@gmail.com';

IF @@ROWCOUNT > 0
    PRINT 'Set nathan.prentice@gmail.com as platform admin';
ELSE
    PRINT 'User nathan.prentice@gmail.com not found - will be set as admin on first login';
GO

-- Create admin_audit_log table to track admin changes
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'admin_audit_log')
BEGIN
    CREATE TABLE admin_audit_log (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        action NVARCHAR(50) NOT NULL, -- 'grant_admin', 'revoke_admin'
        target_user_id NVARCHAR(128) NOT NULL,
        target_email NVARCHAR(255) NOT NULL,
        performed_by_user_id NVARCHAR(128) NOT NULL,
        performed_by_email NVARCHAR(255) NOT NULL,
        reason NVARCHAR(500) NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    );

    CREATE INDEX IX_admin_audit_log_target ON admin_audit_log(target_user_id);
    CREATE INDEX IX_admin_audit_log_performed_by ON admin_audit_log(performed_by_user_id);
    CREATE INDEX IX_admin_audit_log_created_at ON admin_audit_log(created_at DESC);

    PRINT 'Created admin_audit_log table';
END
GO
