-- Migration: 009_fix_admin_case
-- Fix admin assignment with proper case-insensitive matching
-- Also handle any case variations of the email

-- First, let's see all users to debug
SELECT id, email, display_name, is_platform_admin FROM users;

-- Set admin flag using case-insensitive comparison
UPDATE users
SET is_platform_admin = 1
WHERE email LIKE 'nathan.prentice@gmail.com';

-- If that didn't work, try with COLLATE
UPDATE users
SET is_platform_admin = 1
WHERE email COLLATE SQL_Latin1_General_CP1_CI_AS = 'nathan.prentice@gmail.com';

-- Show the result
SELECT id, email, is_platform_admin FROM users WHERE is_platform_admin = 1;
GO
