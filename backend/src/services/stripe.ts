import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
})

interface CreatePaymentIntentParams {
  amount: number // in cents
  currency: string
  customerId?: string | null
  metadata?: Record<string, string>
}

export async function createPaymentIntent({
  amount,
  currency,
  customerId,
  metadata,
}: CreatePaymentIntentParams): Promise<Stripe.PaymentIntent> {
  const params: Stripe.PaymentIntentCreateParams = {
    amount,
    currency,
    automatic_payment_methods: {
      enabled: true,
    },
    metadata,
  }

  if (customerId) {
    params.customer = customerId
  }

  return stripe.paymentIntents.create(params)
}

export async function confirmPaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  return stripe.paymentIntents.retrieve(paymentIntentId)
}

export async function createCustomer(
  email: string,
  name?: string
): Promise<Stripe.Customer> {
  return stripe.customers.create({
    email,
    name,
  })
}

export async function createRefund(
  chargeId: string,
  amount?: number
): Promise<Stripe.Refund> {
  const params: Stripe.RefundCreateParams = {
    charge: chargeId,
  }

  if (amount) {
    params.amount = amount
  }

  return stripe.refunds.create(params)
}

export async function getPaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  return stripe.paymentIntents.retrieve(paymentIntentId)
}

export { stripe }
