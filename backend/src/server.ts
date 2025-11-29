import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import { userRoutes } from './routes/users.js'
import { paymentRoutes } from './routes/payments.js'
import { categoryRoutes } from './routes/categories.js'
import { webhookRoutes } from './routes/webhooks.js'
import { organizationRoutes } from './routes/organizations.js'
import { invitationRoutes } from './routes/invitations.js'
import { eventRoutes } from './routes/events.js'
import { eventItemRoutes } from './routes/eventItems.js'
import { eventBidRoutes } from './routes/eventBids.js'
import { platformFeeRoutes } from './routes/platformFees.js'
import { notificationRoutes } from './routes/notifications.js'
import { errorHandler } from './middleware/errorHandler.js'
import { requestLogger } from './middleware/requestLogger.js'
import { initializeDatabase } from './config/database.js'
import { initializeSignalR } from './services/signalr.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 4000

// Security middleware
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}))

// Stripe webhook needs raw body - must come before express.json()
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }))

// Body parsing
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Request logging
app.use(requestLogger)

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// API Routes
app.use('/api/users', userRoutes)
app.use('/api/payments', paymentRoutes)
app.use('/api/categories', categoryRoutes)
app.use('/api/webhooks', webhookRoutes)
app.use('/api/organizations', organizationRoutes)
app.use('/api/invitations', invitationRoutes)
app.use('/api/events', eventRoutes)
app.use('/api', eventItemRoutes)
app.use('/api', eventBidRoutes)
app.use('/api/platform-fees', platformFeeRoutes)
app.use('/api/notifications', notificationRoutes)

// Error handling
app.use(errorHandler)

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

async function startServer() {
  try {
    // Initialize database connection
    await initializeDatabase()
    console.log('✓ Database connected')

    // Initialize SignalR
    const server = app.listen(PORT, () => {
      console.log(`✓ Server running on port ${PORT}`)
    })

    initializeSignalR(server)
    console.log('✓ SignalR initialized')

  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

startServer()

export default app
