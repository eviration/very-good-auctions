-- Migration: Add bid_placed notification type
-- =====================================================

-- Drop and recreate the constraint to include bid_placed
IF EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CK__user_noti__notif__XXXXXXX' OR parent_object_id = OBJECT_ID('user_notifications'))
BEGIN
    -- Get the actual constraint name dynamically
    DECLARE @constraintName NVARCHAR(255)
    SELECT @constraintName = name
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('user_notifications')
    AND parent_column_id = (
        SELECT column_id FROM sys.columns
        WHERE object_id = OBJECT_ID('user_notifications')
        AND name = 'notification_type'
    )

    IF @constraintName IS NOT NULL
    BEGIN
        EXEC('ALTER TABLE user_notifications DROP CONSTRAINT ' + @constraintName)
    END
END

GO

-- Add the new constraint with bid_placed
ALTER TABLE user_notifications ADD CONSTRAINT CK_notification_type CHECK (notification_type IN (
    'item_approved',
    'item_rejected',
    'resubmit_requested',
    'event_live',
    'outbid',
    'auction_won',
    'auction_lost',
    'item_removed',
    'bid_cancelled',
    'bid_placed'
));

GO
