import { Router, Request, Response, NextFunction } from 'express'
import { body, validationResult } from 'express-validator'
import { v4 as uuidv4 } from 'uuid'
import { authenticate } from '../middleware/auth.js'
import { query as dbQuery } from '../config/database.js'
import { badRequest, notFound } from '../middleware/errorHandler.js'
import { createPaymentIntent, confirmPaymentIntent } from '../services/stripe.js'

const router = Router()

// Create payment intent
router.post(
  '/create-intent',
  authenticate,
  [
    body('auctionId').isUUID(),
    body('amount').isFloat({ min: 1 }),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped() as Record<string, string[]>)
      }

      const userId = req.user!.id
      const { auctionId, amount } = req.body

      // Verify auction exists and is active
      const auctionResult = await dbQuery(
        'SELECT * FROM auctions WHERE id = @auctionId',
        { auctionId }
      )

      if (auctionResult.recordset.length === 0) {
        throw notFound('Auction not found')
      }

      const auction = auctionResult.recordset[0]

      if (auction.status !== 'active') {
        throw badRequest('This auction is not active')
      }

      // Get or create Stripe customer
      let userResult = await dbQuery(
        'SELECT stripe_customer_id FROM users WHERE id = @userId',
        { userId }
      )

      let stripeCustomerId = userResult.recordset[0]?.stripe_customer_id

      // Create payment intent with Stripe
      const paymentIntent = await createPaymentIntent({
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'usd',
        customerId: stripeCustomerId,
        metadata: {
          auctionId,
          userId,
          auctionTitle: auction.title,
        },
      })

      // Save payment record
      const paymentId = uuidv4()
      await dbQuery(
        `INSERT INTO payments (
          id, auction_id, payer_id, amount, currency,
          stripe_payment_intent_id, status, created_at, updated_at
        ) VALUES (
          @paymentId, @auctionId, @payerId, @amount, 'USD',
          @stripePaymentIntentId, 'pending', GETUTCDATE(), GETUTCDATE()
        )`,
        {
          paymentId,
          auctionId,
          payerId: userId,
          amount,
          stripePaymentIntentId: paymentIntent.id,
        }
      )

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      })
    } catch (error) {
      next(error)
    }
  }
)

// Confirm payment
router.post(
  '/confirm',
  authenticate,
  [
    body('paymentIntentId').isString(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        throw badRequest('Validation failed', errors.mapped() as Record<string, string[]>)
      }

      const { paymentIntentId } = req.body

      // Get payment intent from Stripe
      const paymentIntent = await confirmPaymentIntent(paymentIntentId)

      // Update payment status in database
      await dbQuery(
        `UPDATE payments 
         SET status = @status, 
             stripe_charge_id = @chargeId,
             updated_at = GETUTCDATE()
         WHERE stripe_payment_intent_id = @paymentIntentId`,
        {
          paymentIntentId,
          status: paymentIntent.status === 'succeeded' ? 'succeeded' : 'failed',
          chargeId: paymentIntent.latest_charge || null,
        }
      )

      res.json({
        status: paymentIntent.status,
        message: paymentIntent.status === 'succeeded' 
          ? 'Payment confirmed' 
          : 'Payment processing',
      })
    } catch (error) {
      next(error)
    }
  }
)

// Get user's payment history
router.get(
  '/history',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id

      const result = await dbQuery(
        `SELECT p.*, a.title as auction_title
         FROM payments p
         INNER JOIN auctions a ON p.auction_id = a.id
         WHERE p.payer_id = @userId
         ORDER BY p.created_at DESC`,
        { userId }
      )

      const payments = result.recordset.map((p: any) => ({
        id: p.id,
        auctionId: p.auction_id,
        auctionTitle: p.auction_title,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        createdAt: p.created_at,
      }))

      res.json(payments)
    } catch (error) {
      next(error)
    }
  }
)

export { router as paymentRoutes }
