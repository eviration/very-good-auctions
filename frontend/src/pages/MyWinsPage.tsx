import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { apiClient } from '../services/api'

// Initialize Stripe
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || '')

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
        <div className="p-4 bg-clay-coral/20 rounded-clay text-clay-coral font-bold text-sm">
          {error}
        </div>
      )}

      <PaymentElement />

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1 clay-button bg-clay-surface disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || isProcessing}
          className="flex-1 clay-button bg-clay-mint disabled:opacity-50"
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
      <div className="min-h-screen bg-clay-bg">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="flex justify-center py-16">
            <div className="w-16 h-16 rounded-clay bg-clay-mint shadow-clay-pressed flex items-center justify-center">
              <div className="w-8 h-8 border-3 border-charcoal border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-clay-bg">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="clay-section mb-8">
          <h1 className="font-display text-4xl font-black text-charcoal mb-2">My Wins</h1>
          <p className="text-charcoal-light font-medium">Items you've won at auction</p>
        </div>

        {error && (
          <div className="clay-section mb-8 bg-clay-coral/20 border-clay-coral/40">
            <p className="text-clay-coral font-bold">{error}</p>
          </div>
        )}

        {wins.length === 0 ? (
          <div className="clay-section text-center py-16">
            <div className="w-20 h-20 bg-clay-butter rounded-clay flex items-center justify-center mx-auto mb-6 shadow-clay">
              <svg
                className="w-10 h-10 text-charcoal"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-charcoal mb-2">No wins yet</h2>
            <p className="text-charcoal-light font-medium mb-8">
              When you win auction items, they'll appear here for payment
            </p>
            <Link
              to="/"
              className="clay-button bg-clay-mint font-bold inline-flex items-center gap-2"
            >
              Browse Auctions
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Pending Payments */}
            {pendingWins.length > 0 && (
              <div>
                <div className="clay-badge bg-clay-peach mb-4">
                  <span className="font-black">Pending Payments</span>
                  <span className="text-charcoal-light">({pendingWins.length})</span>
                </div>
                <div className="space-y-4">
                  {pendingWins.map((item) => (
                    <div
                      key={item.id}
                      className="clay-card p-6"
                    >
                      <div className="flex items-start gap-4">
                        {/* Image */}
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.title}
                            className="w-24 h-24 object-cover rounded-clay shadow-clay-sm flex-shrink-0"
                          />
                        ) : (
                          <div className="w-24 h-24 bg-clay-lavender/30 rounded-clay shadow-clay-sm flex items-center justify-center flex-shrink-0">
                            <svg
                              className="w-8 h-8 text-charcoal-light"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                          </div>
                        )}

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-charcoal truncate">{item.title}</h3>
                          <Link
                            to={`/events/${item.eventSlug}`}
                            className="text-sm text-charcoal-light font-medium hover:text-charcoal"
                          >
                            {item.eventName}
                          </Link>
                          <p className="text-sm text-charcoal-light mt-1">
                            Won on {formatDate(item.eventEndedAt)}
                          </p>
                        </div>

                        {/* Price & Pay Button */}
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm text-charcoal-light font-medium">Total due</div>
                          <div className="text-2xl font-black text-charcoal">${item.total.toFixed(2)}</div>
                          <div className="text-xs text-charcoal-light">
                            ${item.winningAmount.toFixed(2)} + ${item.platformFee.toFixed(2)} fee
                          </div>
                          {payingItemId !== item.id && (
                            <button
                              onClick={() => handlePayClick(item.id)}
                              className="mt-3 clay-button bg-clay-mint text-sm py-2"
                            >
                              Pay Now
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Payment Form */}
                      {payingItemId === item.id && clientSecret && (
                        <div className="mt-6 pt-6 border-t-2 border-white/60">
                          <div className="mb-6">
                            <h4 className="font-bold text-charcoal mb-3">Payment Breakdown</h4>
                            <div className="bg-clay-mint/20 rounded-clay p-4 space-y-2">
                              <div className="flex justify-between">
                                <span className="text-charcoal-light font-medium">Winning Bid</span>
                                <span className="font-bold text-charcoal">${paymentBreakdown?.winningBid.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-charcoal-light font-medium">Platform Fee (5%)</span>
                                <span className="font-bold text-charcoal">${paymentBreakdown?.platformFee.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between border-t-2 border-white/60 pt-2">
                                <span className="font-black text-charcoal">Total</span>
                                <span className="font-black text-charcoal text-lg">${paymentBreakdown?.total.toFixed(2)}</span>
                              </div>
                            </div>
                          </div>

                          <Elements
                            stripe={stripePromise}
                            options={{
                              clientSecret,
                              appearance: {
                                theme: 'flat',
                                variables: {
                                  colorPrimary: '#A8E6CF',
                                  borderRadius: '16px',
                                  fontFamily: 'Nunito, system-ui, sans-serif',
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
                <div className="clay-badge bg-clay-mint mb-4">
                  <span className="font-black">Completed Purchases</span>
                  <span className="text-charcoal-light">({paidWins.length})</span>
                </div>
                <div className="space-y-4">
                  {paidWins.map((item) => (
                    <div
                      key={item.id}
                      className="clay-card p-6 opacity-80"
                    >
                      <div className="flex items-start gap-4">
                        {/* Image */}
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.title}
                            className="w-20 h-20 object-cover rounded-clay shadow-clay-sm flex-shrink-0"
                          />
                        ) : (
                          <div className="w-20 h-20 bg-clay-lavender/30 rounded-clay shadow-clay-sm flex items-center justify-center flex-shrink-0">
                            <svg
                              className="w-6 h-6 text-charcoal-light"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                          </div>
                        )}

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-charcoal truncate">{item.title}</h3>
                          <Link
                            to={`/events/${item.eventSlug}`}
                            className="text-sm text-charcoal-light font-medium hover:text-charcoal"
                          >
                            {item.eventName}
                          </Link>
                        </div>

                        {/* Status */}
                        <div className="text-right flex-shrink-0">
                          <div className="text-lg font-black text-charcoal">${item.total.toFixed(2)}</div>
                          <span className="clay-badge text-xs bg-clay-mint">
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
    </div>
  )
}
