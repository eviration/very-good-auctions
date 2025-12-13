import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '../services/api'
import type { Notification } from '../types'

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch unread count on mount and periodically
  // Add a small delay on initial mount to allow token provider setup
  useEffect(() => {
    const initialFetch = setTimeout(fetchUnreadCount, 500)
    const interval = setInterval(fetchUnreadCount, 30000) // Poll every 30 seconds
    return () => {
      clearTimeout(initialFetch)
      clearInterval(interval)
    }
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchUnreadCount = async () => {
    try {
      const result = await apiClient.getUnreadNotificationCount()
      console.log('Unread count:', result.unreadCount)
      setUnreadCount(result.unreadCount)
    } catch (error) {
      console.error('Failed to fetch unread count:', error)
    }
  }

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const result = await apiClient.getNotifications({ limit: 10 })
      console.log('Notifications fetch result:', {
        count: result.notifications.length,
        unreadCount: result.unreadCount,
        total: result.total,
        notifications: result.notifications.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          readAt: n.readAt,
        })),
      })
      setNotifications(result.notifications)
      setUnreadCount(result.unreadCount)
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleBellClick = () => {
    if (!isOpen) {
      fetchNotifications()
    }
    setIsOpen(!isOpen)
  }

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await apiClient.markNotificationAsRead(notificationId)
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, readAt: new Date().toISOString() } : n))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch (error) {
      console.error('Failed to mark as read:', error)
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      await apiClient.markAllNotificationsAsRead()
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() }))
      )
      setUnreadCount(0)
    } catch (error) {
      console.error('Failed to mark all as read:', error)
    }
  }

  const getNotificationLink = (notification: Notification): string | null => {
    if (notification.itemId && notification.eventId) {
      // We don't have the event slug here, so link to my-wins for won items
      if (notification.type === 'auction_won') {
        return '/my-wins'
      }
    }
    if (notification.type === 'item_approved' || notification.type === 'item_rejected' || notification.type === 'resubmit_requested') {
      return '/my-events'
    }
    return null
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleBellClick}
        className="relative p-2 text-white hover:text-sage transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-semibold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
          <div className="p-3 border-b border-gray-200 flex justify-between items-center">
            <h3 className="font-semibold text-white">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="text-xs text-sage hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-gray-500">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500">No notifications</div>
            ) : (
              notifications.map((notification) => {
                const link = getNotificationLink(notification)
                const isUnread = !notification.readAt
                const content = (
                  <div
                    className={`p-3 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer ${
                      isUnread ? 'bg-sage/5' : ''
                    }`}
                    onClick={() => {
                      if (isUnread) handleMarkAsRead(notification.id)
                      if (!link) setIsOpen(false)
                    }}
                  >
                    <div className="flex gap-3">
                      {isUnread && (
                        <span className="w-2 h-2 bg-sage rounded-full mt-2 flex-shrink-0" />
                      )}
                      <div className={`flex-1 ${!isUnread ? 'pl-5' : ''}`}>
                        <p className="font-medium text-white text-sm">{notification.title}</p>
                        <p className="text-gray-600 text-sm mt-0.5 line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-gray-400 text-xs mt-1">
                          {formatTime(notification.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                )

                return link ? (
                  <Link
                    key={notification.id}
                    to={link}
                    onClick={() => {
                      if (isUnread) handleMarkAsRead(notification.id)
                      setIsOpen(false)
                    }}
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={notification.id}>{content}</div>
                )
              })
            )}
          </div>

          {notifications.length > 0 && (
            <div className="p-2 border-t border-gray-200 text-center">
              <Link
                to="/notifications"
                className="text-sm text-sage hover:underline"
                onClick={() => setIsOpen(false)}
              >
                View all notifications
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
