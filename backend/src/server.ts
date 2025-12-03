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
import { adminPayoutRoutes } from './routes/adminPayouts.js'
import { complianceRoutes } from './routes/compliance.js'
import { errorHandler } from './middleware/errorHandler.js'
import { requestLogger } from './middleware/requestLogger.js'
import { initializeDatabase } from './config/database.js'
import { initializeSignalR } from './services/signalr.js'
import { sendEmailWithDetails } from './services/email.js'

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

// Email diagnostic endpoint
app.get('/api/debug/email-config', (req, res) => {
  const connectionString = process.env.AZURE_COMMUNICATION_CONNECTION_STRING
  const senderAddress = process.env.EMAIL_SENDER_ADDRESS

  res.json({
    hasConnectionString: !!connectionString,
    connectionStringPrefix: connectionString ? connectionString.substring(0, 50) + '...' : null,
    senderAddress: senderAddress || 'not configured',
    frontendUrl: process.env.FRONTEND_URL || 'not configured',
  })
})

// Email test endpoint
app.post('/api/debug/test-email', async (req, res) => {
  const { to } = req.body

  if (!to) {
    return res.status(400).json({ error: 'Missing "to" email address in request body' })
  }

  console.log(`[Email Test] Attempting to send test email to: ${to}`)

  try {
    const result = await sendEmailWithDetails({
      to,
      subject: 'Very Good Auctions - Test Email',
      htmlContent: `
        <h1>Test Email</h1>
        <p>This is a test email from Very Good Auctions.</p>
        <p>If you received this, email is working correctly!</p>
        <p>Sent at: ${new Date().toISOString()}</p>
      `,
      plainTextContent: `Test Email\n\nThis is a test email from Very Good Auctions.\nIf you received this, email is working correctly!\nSent at: ${new Date().toISOString()}`,
    })

    console.log(`[Email Test] Send result:`, result)
    res.json(result)
  } catch (error) {
    console.error('[Email Test] Error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.stack : undefined
    })
  }
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
app.use('/api/admin/payouts', adminPayoutRoutes)
app.use('/api', complianceRoutes)

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
