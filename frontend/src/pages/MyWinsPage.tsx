import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { apiClient } from '../services/api'

// Initialize Stripe
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '')

interface WonItem {
  id: string
  title: string
  winningAmount: number
  platformFee: number
  total: number
  status: string
  eventName: string
  eventSlug: string
  eventEndedAt: string
  imageUrl?: string
  paymentPending: boolean
}

function PaymentForm({ itemId, onSuccess, onCancel }: {
  itemId: string
  onSuccess: () => void
  onCancel: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements) {
      return
    }

    setIsProcessing(true)
    setError(null)

    const { error: submitError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/my-wins?success=true&item=${itemId}`,
      },
    })

    if (submitError) {
      setError(submitError.message || 'Payment failed')
      setIsProcessing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}

      <PaymentElement />

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1 py-3 border border-sage rounded-xl font-semibold text-sage hover:bg-sage/10 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || isProcessing}
          className="flex-1 py-3 bg-sage text-white font-semibold rounded-xl hover:bg-sage/90 disabled:opacity-50"
        >
          {isProcessing ? 'Processing...' : 'Pay Now'}
        </button>
      </div>
    </form>
  )
}

export default function MyWinsPage() {
  const [wins, setWins] = useState<WonItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [payingItemId, setPayingItemId] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [paymentBreakdown, setPaymentBreakdown] = useState<{
    winningBid: number
    platformFee: number
    total: number
  } | null>(null)

  useEffect(() => {
    fetchWins()

    // Check for success redirect
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'true') {
      // Clear the URL params
      window.history.replaceState({}, '', '/my-wins')
      // Refresh the list
      fetchWins()
    }
  }, [])

  const fetchWins = async () => {
    try {
      setLoading(true)
      const data = await apiClient.getMyWins()
      setWins(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wins')
    } finally {
      setLoading(false)
    }
  }

  const handlePayClick = async (itemId: string) => {
    try {
      const result = await apiClient.createWinnerPayment(itemId)
      setPayingItemId(itemId)
      setClientSecret(result.clientSecret)
      setPaymentBreakdown(result.breakdown)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to initiate payment')
    }
  }

  const handlePaymentSuccess = () => {
    setPayingItemId(null)
    setClientSecret(null)
    setPaymentBreakdown(null)
    fetchWins()
  }

  const handlePaymentCancel = () => {
    setPayingItemId(null)
    setClientSecret(null)
    setPaymentBreakdown(null)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const pendingWins = wins.filter(w => w.paymentPending)
  const paidWins = wins.filter(w => !w.paymentPending)

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl font-bold text-charcoal mb-8">My Wins</h1>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600">
          {error}
        </div>
      )}

      {wins.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-sage/20">
          <svg
            className="w-16 h-16 text-gray-300 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
            />
          </svg>
          <h2 className="text-xl font-semibold text-charcoal mb-2">No wins yet</h2>
          <p className="text-gray-500 mb-6">
            When you win auction items, they'll appear here for payment
          </p>
          <Link
            to="/"
            className="inline-block bg-sage text-white px-6 py-3 rounded-xl font-semibold hover:bg-sage/90"
          >
            Browse Auctions
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pending Payments */}
          {pendingWins.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-charcoal mb-4">
                Pending Payments ({pendingWins.length})
              </h2>
              <div className="space-y-4">
                {pendingWins.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl border border-sage/20 p-6"
                  >
                    <div className="flex items-start gap-4">
                      {/* Image */}
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="w-24 h-24 object-cover rounded-lg flex-shrink-0"
                        />
                      ) : (
                        <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <svg
                            className="w-8 h-8 text-gray-300"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                        </div>
                      )}

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-charcoal truncate">{item.title}</h3>
                        <Link
                          to={`/events/${item.eventSlug}`}
                          className="text-sm text-sage hover:underline"
                        >
                          {item.eventName}
                        </Link>
                        <p className="text-sm text-gray-500 mt-1">
                          Won on {formatDate(item.eventEndedAt)}
                        </p>
                      </div>

                      {/* Price & Pay Button */}
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm text-gray-500">Total due</div>
                        <div className="text-2xl font-bold text-sage">${item.total.toFixed(2)}</div>
                        <div className="text-xs text-gray-500">
                          ${item.winningAmount.toFixed(2)} + ${item.platformFee.toFixed(2)} fee
                        </div>
                        {payingItemId !== item.id && (
                          <button
                            onClick={() => handlePayClick(item.id)}
                            className="mt-3 px-6 py-2 bg-sage text-white font-semibold rounded-lg hover:bg-sage/90"
                          >
                            Pay Now
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Payment Form */}
                    {payingItemId === item.id && clientSecret && (
                      <div className="mt-6 pt-6 border-t border-gray-200">
                        <div className="mb-4">
                          <h4 className="font-medium text-charcoal mb-2">Payment Breakdown</h4>
                          <div className="bg-sage/10 rounded-lg p-4 space-y-2">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Winning Bid</span>
                              <span className="font-medium">${paymentBreakdown?.winningBid.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Platform Fee (5%)</span>
                              <span className="font-medium">${paymentBreakdown?.platformFee.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between border-t border-sage/20 pt-2">
                              <span className="font-semibold text-charcoal">Total</span>
                              <span className="font-bold text-sage">${paymentBreakdown?.total.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>

                        <Elements
                          stripe={stripePromise}
                          options={{
                            clientSecret,
                            appearance: {
                              theme: 'stripe',
                              variables: {
                                colorPrimary: '#7C9A6E',
                              },
                            },
                          }}
                        >
                          <PaymentForm
                            itemId={item.id}
                            onSuccess={handlePaymentSuccess}
                            onCancel={handlePaymentCancel}
                          />
                        </Elements>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Paid Items */}
          {paidWins.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-charcoal mb-4">
                Completed Purchases ({paidWins.length})
              </h2>
              <div className="space-y-4">
                {paidWins.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl border border-sage/20 p-6 opacity-75"
                  >
                    <div className="flex items-start gap-4">
                      {/* Image */}
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                        />
                      ) : (
                        <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <svg
                            className="w-6 h-6 text-gray-300"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                        </div>
                      )}

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-charcoal truncate">{item.title}</h3>
                        <Link
                          to={`/events/${item.eventSlug}`}
                          className="text-sm text-sage hover:underline"
                        >
                          {item.eventName}
                        </Link>
                      </div>

                      {/* Status */}
                      <div className="text-right flex-shrink-0">
                        <div className="text-lg font-bold text-charcoal">${item.total.toFixed(2)}</div>
                        <span className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                          Paid
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
