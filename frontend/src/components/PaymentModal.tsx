import { useState } from 'react'
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { apiClient } from '../services/api'
import type { Auction } from '../types'

interface PaymentModalProps {
  auction: Auction
  bidAmount: number
  onClose: () => void
  onSuccess: () => void
}

export default function PaymentModal({
  auction,
  bidAmount,
  onClose,
  onSuccess,
}: PaymentModalProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [step, setStep] = useState<'method' | 'card' | 'processing' | 'success'>('method')
  const [error, setError] = useState<string | null>(null)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const handlePaymentMethodSelect = async (method: string) => {
    if (method === 'card') {
      setStep('card')
    } else {
      // For other methods, simulate the payment flow
      setStep('processing')
      try {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        setStep('success')
      } catch {
        setError('Payment failed. Please try again.')
        setStep('method')
      }
    }
  }

  const handleCardPayment = async () => {
    if (!stripe || !elements) return

    setStep('processing')
    setError(null)

    try {
      // Create payment intent
      const { clientSecret } = await apiClient.createPaymentIntent({
        auctionId: auction.id,
        amount: bidAmount,
      })

      const cardElement = elements.getElement(CardElement)
      if (!cardElement) throw new Error('Card element not found')

      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        {
          payment_method: {
            card: cardElement,
          },
        }
      )

      if (stripeError) {
        throw new Error(stripeError.message)
      }

      if (paymentIntent?.status === 'succeeded') {
        setStep('success')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed')
      setStep('card')
    }
  }

  const handleSuccessContinue = () => {
    onSuccess()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        className="bg-warm-white rounded-2xl p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto 
                   animate-slide-up shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'success' ? (
          <div className="text-center py-8">
            <div className="w-20 h-20 rounded-full bg-sage flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="font-display text-2xl font-bold text-white mb-2">
              Bid Placed Successfully!
            </h2>
            <p className="text-gray-600 mb-6">
              Your bid of {formatCurrency(bidAmount)} has been placed on "{auction.title}"
            </p>
            <button
              onClick={handleSuccessContinue}
              className="px-8 py-3 bg-sage text-white font-semibold rounded-xl hover:bg-sage-dark transition-colors"
            >
              Continue
            </button>
          </div>
        ) : step === 'processing' ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 border-4 border-sage border-t-transparent rounded-full animate-spin mx-auto mb-6" />
            <p className="text-lg text-white">Processing payment...</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="font-display text-2xl font-bold text-white">
                  {step === 'method' ? 'Payment Method' : 'Card Details'}
                </h2>
                <p className="text-gray-600">
                  Confirm your bid of {formatCurrency(bidAmount)}
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center 
                           hover:bg-gray-200 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {step === 'method' ? (
              <div className="space-y-3">
                <PaymentMethodButton
                  label="Credit / Debit Card"
                  icons={['visa', 'mastercard']}
                  onClick={() => handlePaymentMethodSelect('card')}
                />
                <PaymentMethodButton
                  label="PayPal"
                  icons={['paypal']}
                  onClick={() => handlePaymentMethodSelect('paypal')}
                />
                <PaymentMethodButton
                  label="Apple Pay"
                  icons={['applepay']}
                  onClick={() => handlePaymentMethodSelect('applepay')}
                />
                <PaymentMethodButton
                  label="Google Pay"
                  icons={['googlepay']}
                  onClick={() => handlePaymentMethodSelect('googlepay')}
                />

                <div className="flex items-center justify-center gap-2 mt-6 text-gray-500 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Your payment is secure and encrypted
                </div>
              </div>
            ) : (
              <div>
                <button
                  onClick={() => setStep('method')}
                  className="flex items-center gap-2 text-sage font-medium mb-6 hover:underline"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to payment methods
                </button>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-white mb-2">
                    Card Information
                  </label>
                  <div className="p-4 border-2 border-gray-200 rounded-xl focus-within:border-sage transition-colors">
                    <CardElement
                      options={{
                        style: {
                          base: {
                            fontSize: '16px',
                            color: '#2D2D2D',
                            '::placeholder': {
                              color: '#9CA3AF',
                            },
                          },
                        },
                      }}
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-red-500 text-sm mb-4">{error}</p>
                )}

                <button
                  onClick={handleCardPayment}
                  disabled={!stripe}
                  className="w-full py-4 bg-terracotta text-white font-semibold text-lg rounded-xl
                             hover:bg-terracotta/90 disabled:opacity-50 transition-colors"
                >
                  Pay {formatCurrency(bidAmount)}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function PaymentMethodButton({
  label,
  icons,
  onClick,
}: {
  label: string
  icons: string[]
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between p-4 bg-white border-2 border-gray-200 
                 rounded-xl hover:border-sage hover:bg-cream transition-all"
    >
      <span className="font-medium text-white">{label}</span>
      <div className="flex gap-2">
        {icons.map((icon) => (
          <div key={icon} className="h-6 w-10 bg-gray-100 rounded" />
        ))}
      </div>
    </button>
  )
}
