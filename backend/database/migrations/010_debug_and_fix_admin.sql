-- Migration: 010_debug_and_fix_admin
-- Debug: show all users and set admin

-- Show all users (will be logged by migrate.ts)
SELECT id, email, display_name, is_platform_admin FROM users;
GO

-- Set admin using various matching approaches
UPDATE users
SET is_platform_admin = 1
WHERE email LIKE '%nathan.prentice%';
GO

-- Show who has admin now
SELECT id, email, is_platform_admin FROM users WHERE is_platform_admin = 1;
GO
