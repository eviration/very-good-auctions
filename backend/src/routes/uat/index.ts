import { Router } from 'express'
import { uatTestersRoutes } from './testers.js'
import { uatInviteRoutes } from './invite.js'
import { uatTimeRoutes } from './time.js'
import { uatFeedbackRoutes } from './feedback.js'

const router = Router()

// Mount sub-routes
router.use('/testers', uatTestersRoutes)
router.use('/invite', uatInviteRoutes)
router.use('/time', uatTimeRoutes)
router.use('/feedback', uatFeedbackRoutes)

export const uatRoutes = router
