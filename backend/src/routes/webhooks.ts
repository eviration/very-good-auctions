import { Router, Request, Response, NextFunction } from 'express'
import Stripe from 'stripe'
import { query as dbQuery } from '../config/database.js'
import { v4 as uuidv4 } from 'uuid'
import { handleWinnerPaymentWebhook } from '../services/platformFees.js'
import { handleConnectWebhook, handleTransferUpdate } from '../services/stripeConnect.js'
import { recordChargeback, updateChargebackStatus } from '../services/payouts.js'

const router = Router()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
})

// Stripe webhook handler
router.post(
  '/stripe',
  async (req: Request, res: Response, _next: NextFunction) => {
    const sig = req.headers['stripe-signature'] as string
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

    let event: Stripe.Event

    try {
      if (!webhookSecret) {
        throw new Error('Stripe webhook secret not configured')
      }

      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret)
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      res.status(400).send(`Webhook Error: ${(err as Error).message}`)
      return
    }

    try {
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent

          // Check if this is an auction win payment (event-based)
          if (paymentIntent.metadata?.type === 'auction_win') {
            await handleWinnerPaymentWebhook(paymentIntent)
            console.log('Auction win payment succeeded:', paymentIntent.id)
            break
          }

          // Legacy auction payment handling
          await dbQuery(
            `UPDATE payments
             SET status = 'succeeded',
                 stripe_charge_id = @chargeId,
                 updated_at = GETUTCDATE()
             WHERE stripe_payment_intent_id = @paymentIntentId`,
            {
              paymentIntentId: paymentIntent.id,
              chargeId: paymentIntent.latest_charge as string,
            }
          )

          // Get payment details for notification
          const paymentResult = await dbQuery(
            `SELECT p.*, a.title as auction_title, a.seller_id
             FROM payments p
             INNER JOIN auctions a ON p.auction_id = a.id
             WHERE p.stripe_payment_intent_id = @paymentIntentId`,
            { paymentIntentId: paymentIntent.id }
          )

          if (paymentResult.recordset.length > 0) {
            const payment = paymentResult.recordset[0] as {
              seller_id: string
              amount: number
              auction_id: string
              auction_title: string
            }

            // Notify seller
            await dbQuery(
              `INSERT INTO notifications (id, user_id, type, title, message, data, is_read, created_at)
               VALUES (@id, @userId, 'payment_received', @title, @message, @data, 0, GETUTCDATE())`,
              {
                id: uuidv4(),
                userId: payment.seller_id,
                title: 'Payment Received',
                message: `You received a payment of $${payment.amount} for "${payment.auction_title}"`,
                data: JSON.stringify({ auctionId: payment.auction_id, amount: payment.amount }),
              }
            )
          }

          console.log('Payment succeeded:', paymentIntent.id)
          break
        }

        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent
          
          await dbQuery(
            `UPDATE payments 
             SET status = 'failed', updated_at = GETUTCDATE()
             WHERE stripe_payment_intent_id = @paymentIntentId`,
            { paymentIntentId: paymentIntent.id }
          )

          console.log('Payment failed:', paymentIntent.id)
          break
        }

        case 'charge.refunded': {
          const charge = event.data.object as Stripe.Charge

          await dbQuery(
            `UPDATE payments
             SET status = 'refunded', updated_at = GETUTCDATE()
             WHERE stripe_charge_id = @chargeId`,
            { chargeId: charge.id }
          )

          console.log('Charge refunded:', charge.id)
          break
        }

        // Stripe Connect events
        case 'account.updated':
        case 'account.application.deauthorized':
        case 'transfer.created': {
          await handleConnectWebhook(event)
          console.log('Stripe Connect event handled:', event.type)
          break
        }

        // Transfer status updates (use the transfer.updated event or check status on transfer.created)
        case 'transfer.reversed': {
          // Transfer was reversed, mark as failed
          const transfer = event.data.object as Stripe.Transfer
          await handleTransferUpdate(transfer.id, 'failed')
          console.log('Transfer reversed:', transfer.id)
          break
        }

        // Dispute/Chargeback events
        case 'charge.dispute.created': {
          const dispute = event.data.object as Stripe.Dispute
          const paymentIntentId = dispute.payment_intent as string

          // Find the organization associated with this payment
          const paymentResult = await dbQuery(
            `SELECT ei.event_id, ae.organization_id
             FROM platform_fees pf
             JOIN auction_events ae ON pf.event_id = ae.id
             JOIN event_items ei ON ei.event_id = ae.id
             WHERE pf.stripe_payment_intent_id = @paymentIntentId`,
            { paymentIntentId }
          )

          if (paymentResult.recordset.length > 0) {
            const { event_id, organization_id } = paymentResult.recordset[0]
            await recordChargeback(
              dispute.id,
              paymentIntentId,
              organization_id,
              event_id,
              dispute.amount / 100, // Convert from cents
              dispute.reason || 'Unknown'
            )
            console.log('Chargeback recorded:', dispute.id)
          }
          break
        }

        case 'charge.dispute.closed': {
          const dispute = event.data.object as Stripe.Dispute
          const status = dispute.status === 'won' ? 'won' :
                         dispute.status === 'lost' ? 'lost' : 'closed'
          await updateChargebackStatus(dispute.id, status)
          console.log('Chargeback closed:', dispute.id, status)
          break
        }

        default:
          console.log(`Unhandled event type: ${event.type}`)
      }

      res.json({ received: true })
    } catch (error) {
      console.error('Webhook handler error:', error)
      res.status(500).json({ error: 'Webhook handler failed' })
    }
  }
)

export { router as webhookRoutes }
