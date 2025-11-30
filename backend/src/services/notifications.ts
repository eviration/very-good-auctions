import { query as dbQuery } from '../config/database.js'

// Notification types matching database constraint
export type NotificationType =
  | 'item_approved'
  | 'item_rejected'
  | 'resubmit_requested'
  | 'event_live'
  | 'outbid'
  | 'auction_won'
  | 'auction_lost'
  | 'item_removed'
  | 'bid_cancelled'

interface CreateNotificationParams {
  userId: string
  type: NotificationType
  title: string
  message: string
  eventId?: string
  itemId?: string
}

// Create a notification in the database
export async function createNotification(params: CreateNotificationParams): Promise<string> {
  const { userId, type, title, message, eventId, itemId } = params

  const result = await dbQuery(
    `INSERT INTO user_notifications (user_id, notification_type, title, message, event_id, item_id)
     OUTPUT INSERTED.id
     VALUES (@userId, @type, @title, @message, @eventId, @itemId)`,
    { userId, type, title, message, eventId: eventId || null, itemId: itemId || null }
  )

  return result.recordset[0].id
}

// Get just the unread count (lightweight query for polling)
export async function getUnreadCount(userId: string): Promise<number> {
  const result = await dbQuery(
    `SELECT COUNT(*) as count FROM user_notifications WHERE user_id = @userId AND read_at IS NULL`,
    { userId }
  )
  return result.recordset[0].count
}

// Get user's notifications with pagination
export async function getUserNotifications(
  userId: string,
  options: { limit?: number; offset?: number; unreadOnly?: boolean } = {}
): Promise<{
  notifications: Array<{
    id: string
    type: NotificationType
    title: string
    message: string
    eventId: string | null
    itemId: string | null
    readAt: string | null
    createdAt: string
  }>
  total: number
  unreadCount: number
}> {
  const { limit = 20, offset = 0, unreadOnly = false } = options

  const whereClause = unreadOnly ? 'AND read_at IS NULL' : ''

  const [notificationsResult, countResult, unreadResult] = await Promise.all([
    dbQuery(
      `SELECT id, notification_type, title, message, event_id, item_id, read_at, created_at
       FROM user_notifications
       WHERE user_id = @userId ${whereClause}
       ORDER BY created_at DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      { userId, limit, offset }
    ),
    dbQuery(
      `SELECT COUNT(*) as total FROM user_notifications WHERE user_id = @userId ${whereClause}`,
      { userId }
    ),
    dbQuery(
      `SELECT COUNT(*) as count FROM user_notifications WHERE user_id = @userId AND read_at IS NULL`,
      { userId }
    ),
  ])

  return {
    notifications: notificationsResult.recordset.map((row: any) => ({
      id: row.id,
      type: row.notification_type,
      title: row.title,
      message: row.message,
      eventId: row.event_id,
      itemId: row.item_id,
      readAt: row.read_at,
      createdAt: row.created_at,
    })),
    total: countResult.recordset[0].total,
    unreadCount: unreadResult.recordset[0].count,
  }
}

// Mark notification as read
export async function markAsRead(notificationId: string, userId: string): Promise<boolean> {
  const result = await dbQuery(
    `UPDATE user_notifications
     SET read_at = GETUTCDATE()
     WHERE id = @notificationId AND user_id = @userId AND read_at IS NULL`,
    { notificationId, userId }
  )

  return result.rowsAffected[0] > 0
}

// Mark all notifications as read
export async function markAllAsRead(userId: string): Promise<number> {
  const result = await dbQuery(
    `UPDATE user_notifications
     SET read_at = GETUTCDATE()
     WHERE user_id = @userId AND read_at IS NULL`,
    { userId }
  )

  return result.rowsAffected[0]
}

// Delete a notification
export async function deleteNotification(notificationId: string, userId: string): Promise<boolean> {
  const result = await dbQuery(
    `DELETE FROM user_notifications WHERE id = @notificationId AND user_id = @userId`,
    { notificationId, userId }
  )

  return result.rowsAffected[0] > 0
}

// =====================================================
// Notification Creation Helpers (called from other services)
// =====================================================

// Notify user when their item submission is approved
export async function notifyItemApproved(
  userId: string,
  itemTitle: string,
  eventName: string,
  eventId: string,
  itemId: string
): Promise<string> {
  return createNotification({
    userId,
    type: 'item_approved',
    title: 'Item Approved',
    message: `Your item "${itemTitle}" has been approved for ${eventName}!`,
    eventId,
    itemId,
  })
}

// Notify user when their item submission is rejected
export async function notifyItemRejected(
  userId: string,
  itemTitle: string,
  eventName: string,
  reason: string,
  eventId: string,
  itemId: string
): Promise<string> {
  return createNotification({
    userId,
    type: 'item_rejected',
    title: 'Item Rejected',
    message: `Your item "${itemTitle}" was not approved for ${eventName}. Reason: ${reason}`,
    eventId,
    itemId,
  })
}

// Notify user when resubmission is requested
export async function notifyResubmitRequested(
  userId: string,
  itemTitle: string,
  eventName: string,
  reason: string,
  eventId: string,
  itemId: string
): Promise<string> {
  return createNotification({
    userId,
    type: 'resubmit_requested',
    title: 'Resubmission Requested',
    message: `Please update your item "${itemTitle}" for ${eventName}. Feedback: ${reason}`,
    eventId,
    itemId,
  })
}

// Notify users when an event goes live
export async function notifyEventLive(
  userId: string,
  eventName: string,
  eventId: string
): Promise<string> {
  return createNotification({
    userId,
    type: 'event_live',
    title: 'Auction Now Live!',
    message: `${eventName} is now live! Start bidding now.`,
    eventId,
  })
}

// Notify user when they've been outbid
export async function notifyOutbid(
  userId: string,
  itemTitle: string,
  newBidAmount: number,
  eventId: string,
  itemId: string
): Promise<string> {
  return createNotification({
    userId,
    type: 'outbid',
    title: 'You\'ve Been Outbid',
    message: `Someone outbid you on "${itemTitle}". New bid: $${newBidAmount.toFixed(2)}`,
    eventId,
    itemId,
  })
}

// Notify user when they won an auction
export async function notifyAuctionWon(
  userId: string,
  itemTitle: string,
  winningAmount: number,
  eventId: string,
  itemId: string
): Promise<string> {
  return createNotification({
    userId,
    type: 'auction_won',
    title: 'Congratulations! You Won!',
    message: `You won "${itemTitle}" with a bid of $${winningAmount.toFixed(2)}. Please complete payment.`,
    eventId,
    itemId,
  })
}

// Notify user when they lost an auction (were outbid at the end)
export async function notifyAuctionLost(
  userId: string,
  itemTitle: string,
  eventId: string,
  itemId: string
): Promise<string> {
  return createNotification({
    userId,
    type: 'auction_lost',
    title: 'Auction Ended',
    message: `The auction for "${itemTitle}" has ended and you were outbid.`,
    eventId,
    itemId,
  })
}

// Notify user when their item is removed
export async function notifyItemRemoved(
  userId: string,
  itemTitle: string,
  reason: string,
  eventId: string,
  itemId: string
): Promise<string> {
  return createNotification({
    userId,
    type: 'item_removed',
    title: 'Item Removed',
    message: `Your item "${itemTitle}" has been removed. Reason: ${reason}`,
    eventId,
    itemId,
  })
}

// Notify bidder when their bid is cancelled (item removed)
export async function notifyBidCancelled(
  userId: string,
  itemTitle: string,
  eventId: string,
  itemId: string
): Promise<string> {
  return createNotification({
    userId,
    type: 'bid_cancelled',
    title: 'Bid Cancelled',
    message: `Your bid on "${itemTitle}" has been cancelled because the item was removed.`,
    eventId,
    itemId,
  })
}

// Batch notify all bidders on an item (e.g., when event goes live or item removed)
export async function notifyAllBiddersOnItem(
  itemId: string,
  notificationFn: (userId: string) => Promise<string>
): Promise<void> {
  // Get all unique bidders on this item (both standard and silent bids)
  const biddersResult = await dbQuery(
    `SELECT DISTINCT bidder_id FROM (
       SELECT bidder_id FROM event_item_bids WHERE item_id = @itemId
       UNION
       SELECT bidder_id FROM event_item_silent_bids WHERE item_id = @itemId
     ) AS all_bidders`,
    { itemId }
  )

  await Promise.all(
    biddersResult.recordset.map((row: any) => notificationFn(row.bidder_id))
  )
}

// Notify all item submitters when event goes live
export async function notifyEventSubmittersLive(eventId: string, eventName: string): Promise<void> {
  const submittersResult = await dbQuery(
    `SELECT DISTINCT submitted_by FROM event_items
     WHERE event_id = @eventId AND submission_status = 'approved'`,
    { eventId }
  )

  await Promise.all(
    submittersResult.recordset.map((row: any) =>
      notifyEventLive(row.submitted_by, eventName, eventId)
    )
  )
}
