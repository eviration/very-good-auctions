import { Router, Request, Response, NextFunction } from 'express'
import { param, query, validationResult } from 'express-validator'
import { authenticate } from '../middleware/auth.js'
import { badRequest, notFound } from '../middleware/errorHandler.js'
import {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from '../services/notifications.js'

const router = Router()

// Get user's notifications
router.get(
  '/',
  authenticate,
  [
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
    query('unreadOnly').optional().isBoolean(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest(errors.array()[0].msg)
      }

      const userId = req.user!.id
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0
      const unreadOnly = req.query.unreadOnly === 'true'

      const result = await getUserNotifications(userId, { limit, offset, unreadOnly })

      res.json(result)
    } catch (error) {
      next(error)
    }
  }
)

// Get unread count only (lightweight endpoint for polling)
router.get(
  '/unread-count',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id
      const result = await getUnreadCount(userId)

      res.json({ unreadCount: result })
    } catch (error) {
      next(error)
    }
  }
)

// Mark a notification as read
router.post(
  '/:id/read',
  authenticate,
  [param('id').isUUID()],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest(errors.array()[0].msg)
      }

      const userId = req.user!.id
      const notificationId = req.params.id

      const success = await markAsRead(notificationId, userId)

      if (!success) {
        throw notFound('Notification not found or already read')
      }

      res.json({ success: true })
    } catch (error) {
      next(error)
    }
  }
)

// Mark all notifications as read
router.post(
  '/read-all',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id
      const count = await markAllAsRead(userId)

      res.json({ success: true, markedRead: count })
    } catch (error) {
      next(error)
    }
  }
)

// Delete a notification
router.delete(
  '/:id',
  authenticate,
  [param('id').isUUID()],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest(errors.array()[0].msg)
      }

      const userId = req.user!.id
      const notificationId = req.params.id

      const success = await deleteNotification(notificationId, userId)

      if (!success) {
        throw notFound('Notification not found')
      }

      res.json({ success: true })
    } catch (error) {
      next(error)
    }
  }
)

export { router as notificationRoutes }
