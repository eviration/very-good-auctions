-- Migration: 008_ensure_admin
-- Ensure nathan.prentice@gmail.com is set as platform admin
-- This migration re-runs the admin assignment in case the account didn't exist when migration 007 ran

UPDATE users
SET is_platform_admin = 1
WHERE LOWER(email) = 'nathan.prentice@gmail.com';

IF @@ROWCOUNT > 0
    PRINT 'Set nathan.prentice@gmail.com as platform admin';
ELSE
    PRINT 'User nathan.prentice@gmail.com not found';
GO
