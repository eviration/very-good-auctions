import { query as dbQuery } from '../config/database.js'
import {
  sendAuctionWonEmail,
  sendOutbidEmail,
  sendEventCancelledEmail,
  sendEventLiveEmail,
  sendItemApprovedEmail,
  sendItemRejectedEmail,
  sendResubmitRequestedEmail,
  sendAuctionLostEmail,
  sendBidConfirmationEmail,
} from './email.js'

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
  | 'bid_placed'
  // Self-managed payment notification types
  | 'payment_reminder'
  | 'payment_confirmed'
  | 'item_shipped'
  | 'ready_for_pickup'
  | 'item_delivered'
  | 'digital_delivered'

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

// Helper to get user info for email notifications
async function getUserInfo(userId: string): Promise<{ email: string; name: string } | null> {
  const result = await dbQuery(
    `SELECT email, name FROM users WHERE id = @userId`,
    { userId }
  )
  if (result.recordset.length === 0) return null
  return { email: result.recordset[0].email, name: result.recordset[0].name }
}

// Helper to get event info
async function getEventInfo(eventId: string): Promise<{
  name: string
  slug: string
  organizationName: string
  endTime: Date
} | null> {
  const result = await dbQuery(
    `SELECT ae.name, ae.slug, ae.end_time, o.name as org_name
     FROM auction_events ae
     LEFT JOIN organizations o ON ae.organization_id = o.id
     WHERE ae.id = @eventId`,
    { eventId }
  )
  if (result.recordset.length === 0) return null
  return {
    name: result.recordset[0].name,
    slug: result.recordset[0].slug,
    organizationName: result.recordset[0].org_name || 'Unknown Organization',
    endTime: new Date(result.recordset[0].end_time),
  }
}

// Notify user when their item submission is approved
export async function notifyItemApproved(
  userId: string,
  itemTitle: string,
  eventName: string,
  eventId: string,
  itemId: string
): Promise<string> {
  // Create in-app notification
  const notificationId = await createNotification({
    userId,
    type: 'item_approved',
    title: 'Item Approved',
    message: `Your item "${itemTitle}" has been approved for ${eventName}!`,
    eventId,
    itemId,
  })

  // Send email (fire and forget, don't block on email)
  getUserInfo(userId).then(async (user) => {
    if (user) {
      const event = await getEventInfo(eventId)
      if (event) {
        sendItemApprovedEmail({
          recipientEmail: user.email,
          recipientName: user.name,
          itemTitle,
          eventName,
          eventSlug: event.slug,
        }).catch((err) => console.error('Failed to send item approved email:', err))
      }
    }
  })

  return notificationId
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
  const notificationId = await createNotification({
    userId,
    type: 'item_rejected',
    title: 'Item Rejected',
    message: `Your item "${itemTitle}" was not approved for ${eventName}. Reason: ${reason}`,
    eventId,
    itemId,
  })

  // Send email
  getUserInfo(userId).then((user) => {
    if (user) {
      sendItemRejectedEmail({
        recipientEmail: user.email,
        recipientName: user.name,
        itemTitle,
        eventName,
        rejectionReason: reason,
      }).catch((err) => console.error('Failed to send item rejected email:', err))
    }
  })

  return notificationId
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
  const notificationId = await createNotification({
    userId,
    type: 'resubmit_requested',
    title: 'Resubmission Requested',
    message: `Please update your item "${itemTitle}" for ${eventName}. Feedback: ${reason}`,
    eventId,
    itemId,
  })

  // Send email
  getUserInfo(userId).then(async (user) => {
    if (user) {
      const event = await getEventInfo(eventId)
      if (event) {
        sendResubmitRequestedEmail({
          recipientEmail: user.email,
          recipientName: user.name,
          itemTitle,
          eventName,
          eventSlug: event.slug,
          reason,
        }).catch((err) => console.error('Failed to send resubmit requested email:', err))
      }
    }
  })

  return notificationId
}

// Notify users when an event goes live (in-app only - batch email handled separately)
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
  itemId: string,
  previousBidAmount?: number
): Promise<string> {
  const notificationId = await createNotification({
    userId,
    type: 'outbid',
    title: 'You\'ve Been Outbid',
    message: `Someone outbid you on "${itemTitle}". New bid: $${newBidAmount.toFixed(2)}`,
    eventId,
    itemId,
  })

  // Send email
  getUserInfo(userId).then(async (user) => {
    if (user) {
      const event = await getEventInfo(eventId)
      if (event) {
        sendOutbidEmail({
          recipientEmail: user.email,
          recipientName: user.name,
          itemTitle,
          newHighBid: newBidAmount,
          yourBid: previousBidAmount || newBidAmount - 1, // fallback if not provided
          eventName: event.name,
          eventSlug: event.slug,
          itemId,
        }).catch((err) => console.error('Failed to send outbid email:', err))
      }
    }
  })

  return notificationId
}

// Notify user when they won an auction
export async function notifyAuctionWon(
  userId: string,
  itemTitle: string,
  winningAmount: number,
  eventId: string,
  itemId: string
): Promise<string> {
  const notificationId = await createNotification({
    userId,
    type: 'auction_won',
    title: 'Congratulations! You Won!',
    message: `You won "${itemTitle}" with a bid of $${winningAmount.toFixed(2)}. Please complete payment.`,
    eventId,
    itemId,
  })

  // Send email
  getUserInfo(userId).then(async (user) => {
    if (user) {
      const event = await getEventInfo(eventId)
      if (event) {
        sendAuctionWonEmail({
          recipientEmail: user.email,
          recipientName: user.name,
          itemTitle,
          winningBid: winningAmount,
          eventName: event.name,
          organizationName: event.organizationName,
          eventSlug: event.slug,
        }).catch((err) => console.error('Failed to send auction won email:', err))
      }
    }
  })

  return notificationId
}

// Notify user when they lost an auction (were outbid at the end)
export async function notifyAuctionLost(
  userId: string,
  itemTitle: string,
  eventId: string,
  itemId: string,
  userBid?: number,
  winningBid?: number
): Promise<string> {
  const notificationId = await createNotification({
    userId,
    type: 'auction_lost',
    title: 'Auction Ended',
    message: `The auction for "${itemTitle}" has ended and you were outbid.`,
    eventId,
    itemId,
  })

  // Send email (only if we have bid amounts)
  if (userBid !== undefined && winningBid !== undefined) {
    getUserInfo(userId).then(async (user) => {
      if (user) {
        const event = await getEventInfo(eventId)
        if (event) {
          sendAuctionLostEmail({
            recipientEmail: user.email,
            recipientName: user.name,
            itemTitle,
            yourBid: userBid,
            winningBid: winningBid,
            eventName: event.name,
          }).catch((err) => console.error('Failed to send auction lost email:', err))
        }
      }
    })
  }

  return notificationId
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

// Notify all item submitters when event goes live (includes email)
export async function notifyEventSubmittersLive(eventId: string, eventName: string): Promise<void> {
  // Get submitters with their items and user info
  const submittersResult = await dbQuery(
    `SELECT
       u.id as user_id, u.email, u.name,
       STRING_AGG(ei.title, '|||') as item_titles
     FROM event_items ei
     JOIN users u ON ei.submitted_by = u.id
     WHERE ei.event_id = @eventId AND ei.submission_status = 'approved'
     GROUP BY u.id, u.email, u.name`,
    { eventId }
  )

  const event = await getEventInfo(eventId)

  await Promise.all(
    submittersResult.recordset.map(async (row: any) => {
      // Create in-app notification
      await notifyEventLive(row.user_id, eventName, eventId)

      // Send email with all their items
      if (event && row.email) {
        const itemTitles = row.item_titles ? row.item_titles.split('|||') : []
        sendEventLiveEmail({
          recipientEmail: row.email,
          recipientName: row.name,
          eventName,
          organizationName: event.organizationName,
          itemTitles,
          eventSlug: event.slug,
          endTime: event.endTime,
        }).catch((err) => console.error('Failed to send event live email:', err))
      }
    })
  )
}

// Notify user when they place a bid
export async function notifyBidPlaced(
  userId: string,
  itemTitle: string,
  bidAmount: number,
  eventId: string,
  itemId: string,
  auctionType: 'standard' | 'silent'
): Promise<string> {
  const notificationId = await createNotification({
    userId,
    type: 'bid_placed',
    title: 'Bid Confirmed',
    message: `Your bid of $${bidAmount.toFixed(2)} on "${itemTitle}" has been placed.`,
    eventId,
    itemId,
  })

  // Send email
  getUserInfo(userId).then(async (user) => {
    if (user) {
      const event = await getEventInfo(eventId)
      if (event) {
        sendBidConfirmationEmail({
          recipientEmail: user.email,
          recipientName: user.name,
          itemTitle,
          bidAmount,
          eventName: event.name,
          eventSlug: event.slug,
          itemId,
          auctionType,
          auctionEndTime: event.endTime,
        }).catch((err) => console.error('Failed to send bid confirmation email:', err))
      }
    }
  })

  return notificationId
}

// Notify all bidders when event is cancelled (includes email)
export async function notifyEventBiddersCancelled(
  eventId: string,
  eventName: string,
  organizationName: string
): Promise<void> {
  // Get all bidders with their bid item titles
  const biddersResult = await dbQuery(
    `SELECT
       u.id as user_id, u.email, u.name,
       STRING_AGG(ei.title, '|||') as item_titles
     FROM (
       SELECT DISTINCT bidder_id, item_id FROM event_item_bids
       WHERE item_id IN (SELECT id FROM event_items WHERE event_id = @eventId)
       UNION
       SELECT DISTINCT bidder_id, item_id FROM event_item_silent_bids
       WHERE item_id IN (SELECT id FROM event_items WHERE event_id = @eventId)
     ) AS bids
     JOIN users u ON bids.bidder_id = u.id
     JOIN event_items ei ON bids.item_id = ei.id
     GROUP BY u.id, u.email, u.name`,
    { eventId }
  )

  await Promise.all(
    biddersResult.recordset.map(async (row: any) => {
      // Create in-app notification
      await createNotification({
        userId: row.user_id,
        type: 'bid_cancelled',
        title: 'Auction Cancelled',
        message: `The ${eventName} auction has been cancelled. Your bids have been removed.`,
        eventId,
      })

      // Send email
      if (row.email) {
        const itemTitles = row.item_titles ? row.item_titles.split('|||') : []
        sendEventCancelledEmail({
          recipientEmail: row.email,
          recipientName: row.name,
          eventName,
          organizationName,
          itemTitles,
        }).catch((err) => console.error('Failed to send event cancelled email:', err))
      }
    })
  )
}

// =====================================================
// Self-Managed Payments Notification Functions
// =====================================================

// Notify winner when their payment has been confirmed
export async function notifyPaymentConfirmed(
  userId: string,
  itemTitle: string,
  eventId: string,
  itemId: string,
  paymentMethod?: string
): Promise<string> {
  const message = paymentMethod
    ? `Your payment for "${itemTitle}" via ${paymentMethod} has been confirmed!`
    : `Your payment for "${itemTitle}" has been confirmed!`

  const notificationId = await createNotification({
    userId,
    type: 'payment_confirmed',
    title: 'Payment Confirmed',
    message,
    eventId,
    itemId,
  })

  // TODO: Add email sending when email template is ready
  // getUserInfo(userId).then(async (user) => {
  //   if (user) {
  //     sendPaymentConfirmedEmail({...}).catch(err => console.error(...))
  //   }
  // })

  return notificationId
}

// Notify winner when their item has been shipped
export async function notifyItemShipped(
  userId: string,
  itemTitle: string,
  eventId: string,
  itemId: string,
  tracking?: { number: string; carrier: string; url: string | null }
): Promise<string> {
  let message = `Your item "${itemTitle}" has been shipped!`
  if (tracking) {
    message += ` Tracking: ${tracking.carrier.toUpperCase()} ${tracking.number}`
  }

  const notificationId = await createNotification({
    userId,
    type: 'item_shipped',
    title: 'Item Shipped',
    message,
    eventId,
    itemId,
  })

  // TODO: Add email sending when email template is ready

  return notificationId
}

// Notify winner when their item is ready for pickup
export async function notifyReadyForPickup(
  userId: string,
  itemTitle: string,
  eventId: string,
  itemId: string,
  pickupLocation?: string
): Promise<string> {
  let message = `Your item "${itemTitle}" is ready for pickup!`
  if (pickupLocation) {
    message += ` Location: ${pickupLocation}`
  }

  const notificationId = await createNotification({
    userId,
    type: 'ready_for_pickup',
    title: 'Ready for Pickup',
    message,
    eventId,
    itemId,
  })

  // TODO: Add email sending when email template is ready

  return notificationId
}

// Notify winner when their digital item has been delivered
export async function notifyDigitalDelivered(
  userId: string,
  itemTitle: string,
  eventId: string,
  itemId: string
): Promise<string> {
  const notificationId = await createNotification({
    userId,
    type: 'digital_delivered',
    title: 'Digital Item Delivered',
    message: `Your digital item "${itemTitle}" has been delivered! Check your email for access details.`,
    eventId,
    itemId,
  })

  // TODO: Add email sending when email template is ready

  return notificationId
}

// Notify winner about payment reminder
export async function notifyPaymentReminder(
  userId: string,
  itemTitle: string,
  eventId: string,
  itemId: string,
  amountOwed: number,
  daysOverdue?: number
): Promise<string> {
  let message = `Reminder: Payment of $${amountOwed.toFixed(2)} is due for "${itemTitle}".`
  if (daysOverdue && daysOverdue > 0) {
    message = `Your payment of $${amountOwed.toFixed(2)} for "${itemTitle}" is ${daysOverdue} day(s) overdue.`
  }

  const notificationId = await createNotification({
    userId,
    type: 'payment_reminder',
    title: 'Payment Reminder',
    message,
    eventId,
    itemId,
  })

  // TODO: Add email sending when email template is ready

  return notificationId
}
