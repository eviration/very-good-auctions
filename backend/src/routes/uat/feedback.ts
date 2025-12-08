import { Router, Request, Response, NextFunction } from 'express'
import { body, param, validationResult } from 'express-validator'
import { query as dbQuery } from '../../config/database.js'
import { authenticate, requirePlatformAdmin } from '../../middleware/auth.js'
import { badRequest } from '../../middleware/errorHandler.js'

const router = Router()

/**
 * POST /api/uat/feedback
 *
 * Submit feedback from a tester.
 */
router.post(
  '/',
  authenticate,
  [
    body('feedbackType').isIn(['bug', 'suggestion', 'question', 'praise', 'other']).withMessage('Invalid feedback type'),
    body('title').notEmpty().withMessage('Title is required'),
    body('description').notEmpty().withMessage('Description is required'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array().map(e => e.msg).join(', ')))
    }

    try {
      const userId = (req as any).user?.id
      const {
        feedbackType,
        title,
        description,
        stepsToReproduce,
        expectedBehavior,
        actualBehavior,
        pageUrl,
        featureArea,
        screenshotUrls,
        browserInfo,
        deviceInfo,
        screenResolution,
        sessionId,
      } = req.body

      // Find tester record if exists
      const testerResult = await dbQuery(
        `SELECT id FROM uat_testers WHERE user_id = @userId`,
        { userId }
      )
      const testerId = testerResult.recordset[0]?.id || null

      const result = await dbQuery(`
        INSERT INTO uat_feedback (
          tester_id, user_id, uat_session_id,
          page_url, feature_area, feedback_type,
          title, description, steps_to_reproduce,
          expected_behavior, actual_behavior,
          screenshot_urls, browser_info, device_info, screen_resolution
        ) OUTPUT INSERTED.id VALUES (
          @testerId, @userId, @sessionId,
          @pageUrl, @featureArea, @feedbackType,
          @title, @description, @stepsToReproduce,
          @expectedBehavior, @actualBehavior,
          @screenshotUrls, @browserInfo, @deviceInfo, @screenResolution
        )
      `, {
        testerId,
        userId,
        sessionId: sessionId || null,
        pageUrl: pageUrl || null,
        featureArea: featureArea || null,
        feedbackType,
        title,
        description,
        stepsToReproduce: stepsToReproduce || null,
        expectedBehavior: expectedBehavior || null,
        actualBehavior: actualBehavior || null,
        screenshotUrls: screenshotUrls ? JSON.stringify(screenshotUrls) : null,
        browserInfo: browserInfo || null,
        deviceInfo: deviceInfo || null,
        screenResolution: screenResolution || null,
      })

      return res.status(201).json({
        success: true,
        feedbackId: result.recordset[0].id,
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * GET /api/uat/feedback
 *
 * List all feedback (admin only).
 */
router.get(
  '/',
  authenticate,
  requirePlatformAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, type, sessionId, priority, featureArea } = req.query

      let queryStr = `
        SELECT
          f.*,
          t.email as tester_email,
          t.name as tester_name,
          s.name as session_name
        FROM uat_feedback f
        LEFT JOIN uat_testers t ON f.tester_id = t.id
        LEFT JOIN uat_sessions s ON f.uat_session_id = s.id
        WHERE 1=1
      `

      const params: Record<string, unknown> = {}

      if (status) {
        queryStr += ` AND f.status = @status`
        params.status = status
      }

      if (type) {
        queryStr += ` AND f.feedback_type = @type`
        params.type = type
      }

      if (sessionId) {
        queryStr += ` AND f.uat_session_id = @sessionId`
        params.sessionId = sessionId
      }

      if (priority) {
        queryStr += ` AND f.priority = @priority`
        params.priority = priority
      }

      if (featureArea) {
        queryStr += ` AND f.feature_area = @featureArea`
        params.featureArea = featureArea
      }

      queryStr += ` ORDER BY f.submitted_at DESC`

      const result = await dbQuery(queryStr, params)

      // Get counts by status
      const countsResult = await dbQuery(`
        SELECT status, COUNT(*) as count
        FROM uat_feedback
        GROUP BY status
      `)

      const counts = countsResult.recordset.reduce((acc: Record<string, number>, row: { status: string; count: number }) => {
        acc[row.status] = row.count
        return acc
      }, {})

      // Get counts by type
      const typeCountsResult = await dbQuery(`
        SELECT feedback_type, COUNT(*) as count
        FROM uat_feedback
        GROUP BY feedback_type
      `)

      const typeCounts = typeCountsResult.recordset.reduce((acc: Record<string, number>, row: { feedback_type: string; count: number }) => {
        acc[row.feedback_type] = row.count
        return acc
      }, {})

      return res.json({
        feedback: result.recordset,
        counts: {
          byStatus: {
            new: counts.new || 0,
            reviewed: counts.reviewed || 0,
            in_progress: counts.in_progress || 0,
            resolved: counts.resolved || 0,
            wont_fix: counts.wont_fix || 0,
            duplicate: counts.duplicate || 0,
          },
          byType: typeCounts,
          total: result.recordset.length,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * GET /api/uat/feedback/my
 *
 * Get current user's submitted feedback.
 */
router.get(
  '/my',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id

      const result = await dbQuery(`
        SELECT
          f.*,
          s.name as session_name
        FROM uat_feedback f
        LEFT JOIN uat_sessions s ON f.uat_session_id = s.id
        WHERE f.user_id = @userId
        ORDER BY f.submitted_at DESC
      `, { userId })

      return res.json({
        feedback: result.recordset,
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * GET /api/uat/feedback/:feedbackId
 *
 * Get a single feedback item.
 */
router.get(
  '/:feedbackId',
  authenticate,
  [
    param('feedbackId').isUUID().withMessage('Invalid feedback ID'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array().map(e => e.msg).join(', ')))
    }

    try {
      const { feedbackId } = req.params
      const userId = (req as any).user?.id

      const result = await dbQuery(`
        SELECT
          f.*,
          t.email as tester_email,
          t.name as tester_name,
          s.name as session_name
        FROM uat_feedback f
        LEFT JOIN uat_testers t ON f.tester_id = t.id
        LEFT JOIN uat_sessions s ON f.uat_session_id = s.id
        WHERE f.id = @id
      `, { id: feedbackId })

      if (result.recordset.length === 0) {
        return res.status(404).json({ error: 'Feedback not found' })
      }

      const feedback = result.recordset[0]

      // Check access - admin or own feedback
      const isAdmin = (req as any).user?.isPlatformAdmin
      if (!isAdmin && feedback.user_id !== userId) {
        return res.status(403).json({ error: 'Access denied' })
      }

      return res.json(feedback)
    } catch (error) {
      next(error)
    }
  }
)

/**
 * PATCH /api/uat/feedback/:feedbackId
 *
 * Update feedback status (admin only).
 */
router.patch(
  '/:feedbackId',
  authenticate,
  requirePlatformAdmin,
  [
    param('feedbackId').isUUID().withMessage('Invalid feedback ID'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array().map(e => e.msg).join(', ')))
    }

    try {
      const { feedbackId } = req.params
      const { status, priority, assignedTo, resolutionNotes } = req.body

      const updates: string[] = []
      const params: Record<string, unknown> = { id: feedbackId }

      if (status) {
        updates.push('status = @status')
        params.status = status

        if (status === 'resolved') {
          updates.push('resolved_at = GETUTCDATE()')
        }
      }

      if (priority !== undefined) {
        updates.push('priority = @priority')
        params.priority = priority
      }

      if (assignedTo !== undefined) {
        updates.push('assigned_to = @assignedTo')
        params.assignedTo = assignedTo
      }

      if (resolutionNotes !== undefined) {
        updates.push('resolution_notes = @resolutionNotes')
        params.resolutionNotes = resolutionNotes
      }

      if (updates.length === 0) {
        return next(badRequest('No updates provided'))
      }

      await dbQuery(`
        UPDATE uat_feedback SET ${updates.join(', ')} WHERE id = @id
      `, params)

      return res.json({ success: true })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * DELETE /api/uat/feedback/:feedbackId
 *
 * Delete feedback (admin only).
 */
router.delete(
  '/:feedbackId',
  authenticate,
  requirePlatformAdmin,
  [
    param('feedbackId').isUUID().withMessage('Invalid feedback ID'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array().map(e => e.msg).join(', ')))
    }

    try {
      const { feedbackId } = req.params

      await dbQuery(`DELETE FROM uat_feedback WHERE id = @id`, { id: feedbackId })

      return res.json({ success: true })
    } catch (error) {
      next(error)
    }
  }
)

export const uatFeedbackRoutes = router
