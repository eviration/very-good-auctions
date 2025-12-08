import { Router, Request, Response, NextFunction } from 'express'
import { body, validationResult } from 'express-validator'
import { query as dbQuery } from '../../config/database.js'
import { authenticate, requirePlatformAdmin } from '../../middleware/auth.js'
import { badRequest } from '../../middleware/errorHandler.js'
import {
  getUatSettings,
  clearSettingsCache,
  parseOffsetString,
  formatOffset,
} from '../../services/uatTime.js'

const router = Router()

/**
 * GET /api/uat/time
 *
 * Get current UAT time settings.
 */
router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await getUatSettings()

      const realNow = new Date()
      let effectiveNow = realNow

      if (settings.is_time_frozen && settings.time_frozen_at) {
        effectiveNow = new Date(settings.time_frozen_at)
      } else if (settings.global_time_offset_seconds) {
        effectiveNow = new Date(realNow.getTime() + (settings.global_time_offset_seconds * 1000))
      }

      return res.json({
        realTime: realNow.toISOString(),
        effectiveTime: effectiveNow.toISOString(),
        isFrozen: settings.is_time_frozen,
        frozenAt: settings.time_frozen_at,
        offsetSeconds: settings.global_time_offset_seconds,
        offsetHuman: formatOffset(settings.global_time_offset_seconds),
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * POST /api/uat/time/offset
 *
 * Set global time offset.
 */
router.post(
  '/offset',
  authenticate,
  requirePlatformAdmin,
  [
    body('offset').notEmpty().withMessage('Offset is required'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array().map(e => e.msg).join(', ')))
    }

    try {
      const { offset } = req.body
      const userId = (req as any).user?.id

      let offsetSeconds: number

      if (typeof offset === 'number') {
        offsetSeconds = offset
      } else {
        offsetSeconds = parseOffsetString(offset)
      }

      await dbQuery(`
        UPDATE uat_settings SET
          global_time_offset_seconds = @offset,
          is_time_frozen = 0,
          time_frozen_at = NULL,
          updated_at = GETUTCDATE(),
          updated_by = @userId
        WHERE id = 1
      `, { offset: offsetSeconds, userId })

      clearSettingsCache()

      return res.json({
        success: true,
        offsetSeconds,
        effectiveTime: new Date(Date.now() + (offsetSeconds * 1000)).toISOString(),
      })
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid offset format')) {
        return next(badRequest(error.message))
      }
      next(error)
    }
  }
)

/**
 * POST /api/uat/time/freeze
 *
 * Freeze time at current effective time.
 */
router.post(
  '/freeze',
  authenticate,
  requirePlatformAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { at } = req.body // Optional: specific time to freeze at
      const userId = (req as any).user?.id

      const freezeAt = at ? new Date(at) : new Date()

      await dbQuery(`
        UPDATE uat_settings SET
          is_time_frozen = 1,
          time_frozen_at = @freezeAt,
          updated_at = GETUTCDATE(),
          updated_by = @userId
        WHERE id = 1
      `, { freezeAt, userId })

      clearSettingsCache()

      return res.json({
        success: true,
        frozenAt: freezeAt.toISOString(),
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * POST /api/uat/time/unfreeze
 *
 * Unfreeze time.
 */
router.post(
  '/unfreeze',
  authenticate,
  requirePlatformAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id

      await dbQuery(`
        UPDATE uat_settings SET
          is_time_frozen = 0,
          time_frozen_at = NULL,
          updated_at = GETUTCDATE(),
          updated_by = @userId
        WHERE id = 1
      `, { userId })

      clearSettingsCache()

      return res.json({ success: true })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * POST /api/uat/time/reset
 *
 * Reset to real time (clear offset and unfreeze).
 */
router.post(
  '/reset',
  authenticate,
  requirePlatformAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id

      await dbQuery(`
        UPDATE uat_settings SET
          global_time_offset_seconds = 0,
          is_time_frozen = 0,
          time_frozen_at = NULL,
          updated_at = GETUTCDATE(),
          updated_by = @userId
        WHERE id = 1
      `, { userId })

      clearSettingsCache()

      return res.json({
        success: true,
        effectiveTime: new Date().toISOString(),
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * POST /api/uat/time/advance
 *
 * Advance time by a duration.
 */
router.post(
  '/advance',
  authenticate,
  requirePlatformAdmin,
  [
    body('duration').notEmpty().withMessage('Duration is required'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return next(badRequest(errors.array().map(e => e.msg).join(', ')))
    }

    try {
      const { duration } = req.body
      const userId = (req as any).user?.id

      const advanceSeconds = parseOffsetString(duration.startsWith('+') ? duration : `+${duration}`)

      const settings = await getUatSettings()
      const currentOffset = settings.global_time_offset_seconds || 0
      const newOffset = currentOffset + advanceSeconds

      await dbQuery(`
        UPDATE uat_settings SET
          global_time_offset_seconds = @offset,
          updated_at = GETUTCDATE(),
          updated_by = @userId
        WHERE id = 1
      `, { offset: newOffset, userId })

      clearSettingsCache()

      return res.json({
        success: true,
        advanced: duration,
        newOffsetSeconds: newOffset,
        effectiveTime: new Date(Date.now() + (newOffset * 1000)).toISOString(),
      })
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid offset format')) {
        return next(badRequest(error.message))
      }
      next(error)
    }
  }
)

export const uatTimeRoutes = router
