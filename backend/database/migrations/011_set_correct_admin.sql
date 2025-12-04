-- Migration: 011_set_correct_admin
-- Set admin for the actual user in the database

-- Set admin for the user (using onmicrosoft.com email pattern)
UPDATE users
SET is_platform_admin = 1
WHERE email LIKE '%@verygoodauctions.onmicrosoft.com';
GO

-- Show who has admin now
SELECT id, email, is_platform_admin FROM users WHERE is_platform_admin = 1;
GO
