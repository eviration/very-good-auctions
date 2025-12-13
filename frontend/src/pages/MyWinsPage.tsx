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
  // Self-managed payment info
  paymentMode: 'integrated' | 'self_managed'
  paymentInstructions?: string
  paymentLink?: string
  paymentQrCodeUrl?: string
  paymentDueDays?: number
  organizationName?: string
  // Item-level payment/fulfillment tracking
  paymentStatus: 'pending' | 'paid' | 'payment_issue' | 'waived' | 'refunded'
  fulfillmentStatus: 'pending' | 'processing' | 'ready_for_pickup' | 'shipped' | 'out_for_delivery' | 'delivered' | 'picked_up' | 'issue'
  fulfillmentType?: 'shipping' | 'pickup' | 'digital'
  trackingNumber?: string
  trackingCarrier?: string
  trackingUrl?: string
  pickupReadyAt?: string
  // Event-level pickup info
  pickupInstructions?: string
  pickupLocation?: string
  pickupAddress?: {
    line1: string
    city: string
    state: string
  }
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

  // Separate integrated and self-managed payment items
  const integratedWins = wins.filter(w => w.paymentMode !== 'self_managed')
  const selfManagedWins = wins.filter(w => w.paymentMode === 'self_managed')

  // Within integrated: pending vs paid
  const pendingIntegratedWins = integratedWins.filter(w => w.paymentPending)
  const paidIntegratedWins = integratedWins.filter(w => !w.paymentPending)

  // Within self-managed: pending vs confirmed
  const pendingSelfManagedWins = selfManagedWins.filter(w => w.paymentStatus === 'pending' || w.paymentStatus === 'payment_issue')
  const confirmedSelfManagedWins = selfManagedWins.filter(w => w.paymentStatus !== 'pending' && w.paymentStatus !== 'payment_issue')

  // Legacy compatibility
  const pendingWins = pendingIntegratedWins
  const paidWins = paidIntegratedWins

  if (loading) {
    return (
      <div className="min-h-screen bg-clay-bg">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="flex justify-center py-16">
            <div className="w-16 h-16 rounded-clay bg-clay-mint shadow-clay-pressed flex items-center justify-center">
              <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin" />
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
          <h1 className="font-display text-4xl font-black text-white mb-2">My Wins</h1>
          <p className="text-white/70 font-medium">Items you've won at auction</p>
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
                className="w-10 h-10 text-white"
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
            <h2 className="text-2xl font-black text-white mb-2">No wins yet</h2>
            <p className="text-white/70 font-medium mb-8">
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
                  <span className="text-white/70">({pendingWins.length})</span>
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
                              className="w-8 h-8 text-white/70"
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
                          <h3 className="font-bold text-white truncate">{item.title}</h3>
                          <Link
                            to={`/events/${item.eventSlug}`}
                            className="text-sm text-white/70 font-medium hover:text-white"
                          >
                            {item.eventName}
                          </Link>
                          <p className="text-sm text-white/70 mt-1">
                            Won on {formatDate(item.eventEndedAt)}
                          </p>
                        </div>

                        {/* Price & Pay Button */}
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm text-white/70 font-medium">Total due</div>
                          <div className="text-2xl font-black text-white">${item.total.toFixed(2)}</div>
                          <div className="text-xs text-white/70">
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
                            <h4 className="font-bold text-white mb-3">Payment Breakdown</h4>
                            <div className="bg-clay-mint/20 rounded-clay p-4 space-y-2">
                              <div className="flex justify-between">
                                <span className="text-white/70 font-medium">Winning Bid</span>
                                <span className="font-bold text-white">${paymentBreakdown?.winningBid.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-white/70 font-medium">Platform Fee (5%)</span>
                                <span className="font-bold text-white">${paymentBreakdown?.platformFee.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between border-t-2 border-white/60 pt-2">
                                <span className="font-black text-white">Total</span>
                                <span className="font-black text-white text-lg">${paymentBreakdown?.total.toFixed(2)}</span>
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

            {/* Self-Managed Pending Payments */}
            {pendingSelfManagedWins.length > 0 && (
              <div>
                <div className="clay-badge bg-clay-butter mb-4">
                  <span className="font-black">Pay Directly to Organization</span>
                  <span className="text-white/70">({pendingSelfManagedWins.length})</span>
                </div>
                <div className="space-y-4">
                  {pendingSelfManagedWins.map((item) => (
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
                              className="w-8 h-8 text-white/70"
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
                          <h3 className="font-bold text-white truncate">{item.title}</h3>
                          <Link
                            to={`/events/${item.eventSlug}`}
                            className="text-sm text-white/70 font-medium hover:text-white"
                          >
                            {item.eventName}
                          </Link>
                          <p className="text-sm text-white/70 mt-1">
                            Won on {formatDate(item.eventEndedAt)}
                          </p>
                          {item.organizationName && (
                            <p className="text-sm font-medium text-white mt-1">
                              From: {item.organizationName}
                            </p>
                          )}
                        </div>

                        {/* Price & Status */}
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm text-white/70 font-medium">Amount due</div>
                          <div className="text-2xl font-black text-white">${item.winningAmount.toFixed(2)}</div>
                          {item.paymentStatus === 'payment_issue' && (
                            <span className="clay-badge text-xs bg-clay-coral mt-2">
                              Payment Issue
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Payment Instructions */}
                      <div className="mt-6 pt-6 border-t-2 border-white/60">
                        <h4 className="font-bold text-white mb-3">Payment Instructions</h4>
                        <div className="bg-clay-butter/20 rounded-clay p-4">
                          {item.paymentInstructions ? (
                            <p className="text-white whitespace-pre-wrap">{item.paymentInstructions}</p>
                          ) : (
                            <p className="text-white/70 italic">
                              Contact the organization for payment details.
                            </p>
                          )}

                          {item.paymentLink && (
                            <a
                              href={item.paymentLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-4 clay-button bg-clay-mint text-sm py-2 inline-flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              Pay Now
                            </a>
                          )}

                          {item.paymentQrCodeUrl && (
                            <div className="mt-4">
                              <p className="text-sm text-white/70 mb-2">Scan to pay:</p>
                              <img
                                src={item.paymentQrCodeUrl}
                                alt="Payment QR Code"
                                className="w-32 h-32 rounded-clay shadow-clay-sm"
                              />
                            </div>
                          )}

                          {item.paymentDueDays && (
                            <p className="mt-4 text-sm text-white/70">
                              Payment due within {item.paymentDueDays} days of auction end.
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Pickup/Fulfillment Info */}
                      {(item.pickupLocation || item.pickupInstructions || item.pickupAddress) && (
                        <div className="mt-4 pt-4 border-t-2 border-white/60">
                          <h4 className="font-bold text-white mb-3">Pickup Information</h4>
                          <div className="bg-clay-lavender/20 rounded-clay p-4 space-y-2">
                            {item.pickupLocation && (
                              <p className="text-white">
                                <span className="font-medium">Location:</span> {item.pickupLocation}
                              </p>
                            )}
                            {item.pickupAddress && (
                              <p className="text-white">
                                <span className="font-medium">Address:</span>{' '}
                                {item.pickupAddress.line1}, {item.pickupAddress.city}, {item.pickupAddress.state}
                              </p>
                            )}
                            {item.pickupInstructions && (
                              <p className="text-white whitespace-pre-wrap">
                                <span className="font-medium">Instructions:</span> {item.pickupInstructions}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Self-Managed Confirmed Items */}
            {confirmedSelfManagedWins.length > 0 && (
              <div>
                <div className="clay-badge bg-clay-mint mb-4">
                  <span className="font-black">Confirmed Purchases</span>
                  <span className="text-white/70">({confirmedSelfManagedWins.length})</span>
                </div>
                <div className="space-y-4">
                  {confirmedSelfManagedWins.map((item) => (
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
                            className="w-20 h-20 object-cover rounded-clay shadow-clay-sm flex-shrink-0"
                          />
                        ) : (
                          <div className="w-20 h-20 bg-clay-lavender/30 rounded-clay shadow-clay-sm flex items-center justify-center flex-shrink-0">
                            <svg
                              className="w-6 h-6 text-white/70"
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
                          <h3 className="font-bold text-white truncate">{item.title}</h3>
                          <Link
                            to={`/events/${item.eventSlug}`}
                            className="text-sm text-white/70 font-medium hover:text-white"
                          >
                            {item.eventName}
                          </Link>
                          {item.organizationName && (
                            <p className="text-sm text-white/70">
                              From: {item.organizationName}
                            </p>
                          )}
                        </div>

                        {/* Status */}
                        <div className="text-right flex-shrink-0">
                          <div className="text-lg font-black text-white">${item.winningAmount.toFixed(2)}</div>
                          <span className={`clay-badge text-xs ${
                            item.paymentStatus === 'paid' ? 'bg-clay-mint' :
                            item.paymentStatus === 'waived' ? 'bg-clay-lavender' :
                            'bg-clay-peach'
                          }`}>
                            {item.paymentStatus === 'paid' ? 'Paid' :
                             item.paymentStatus === 'waived' ? 'Waived' :
                             item.paymentStatus === 'refunded' ? 'Refunded' : 'Paid'}
                          </span>
                        </div>
                      </div>

                      {/* Fulfillment Status */}
                      <div className="mt-4 pt-4 border-t-2 border-white/60">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-white">Fulfillment Status</span>
                          <span className={`clay-badge text-xs ${
                            item.fulfillmentStatus === 'delivered' || item.fulfillmentStatus === 'picked_up' ? 'bg-clay-mint' :
                            item.fulfillmentStatus === 'shipped' || item.fulfillmentStatus === 'out_for_delivery' ? 'bg-clay-sky' :
                            item.fulfillmentStatus === 'ready_for_pickup' ? 'bg-clay-butter' :
                            item.fulfillmentStatus === 'processing' ? 'bg-clay-lavender' :
                            item.fulfillmentStatus === 'issue' ? 'bg-clay-coral' :
                            'bg-clay-surface'
                          }`}>
                            {item.fulfillmentStatus === 'pending' ? 'Pending' :
                             item.fulfillmentStatus === 'processing' ? 'Processing' :
                             item.fulfillmentStatus === 'ready_for_pickup' ? 'Ready for Pickup' :
                             item.fulfillmentStatus === 'shipped' ? 'Shipped' :
                             item.fulfillmentStatus === 'out_for_delivery' ? 'Out for Delivery' :
                             item.fulfillmentStatus === 'delivered' ? 'Delivered' :
                             item.fulfillmentStatus === 'picked_up' ? 'Picked Up' :
                             item.fulfillmentStatus === 'issue' ? 'Issue' : 'Pending'}
                          </span>
                        </div>

                        {/* Tracking Info */}
                        {item.trackingNumber && (
                          <div className="mt-3 bg-clay-sky/20 rounded-clay p-3">
                            <p className="text-sm text-white">
                              <span className="font-medium">Tracking:</span>{' '}
                              {item.trackingUrl ? (
                                <a
                                  href={item.trackingUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-clay-sky hover:underline"
                                >
                                  {item.trackingNumber}
                                </a>
                              ) : (
                                item.trackingNumber
                              )}
                              {item.trackingCarrier && (
                                <span className="text-white/70"> ({item.trackingCarrier})</span>
                              )}
                            </p>
                          </div>
                        )}

                        {/* Ready for Pickup */}
                        {item.fulfillmentStatus === 'ready_for_pickup' && item.pickupReadyAt && (
                          <div className="mt-3 bg-clay-butter/20 rounded-clay p-3">
                            <p className="text-sm text-white">
                              <span className="font-medium">Ready since:</span>{' '}
                              {formatDate(item.pickupReadyAt)}
                            </p>
                            {item.pickupLocation && (
                              <p className="text-sm text-white mt-1">
                                <span className="font-medium">Location:</span> {item.pickupLocation}
                              </p>
                            )}
                            {item.pickupInstructions && (
                              <p className="text-sm text-white mt-1">
                                <span className="font-medium">Instructions:</span> {item.pickupInstructions}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
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
                  <span className="text-white/70">({paidWins.length})</span>
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
                              className="w-6 h-6 text-white/70"
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
                          <h3 className="font-bold text-white truncate">{item.title}</h3>
                          <Link
                            to={`/events/${item.eventSlug}`}
                            className="text-sm text-white/70 font-medium hover:text-white"
                          >
                            {item.eventName}
                          </Link>
                        </div>

                        {/* Status */}
                        <div className="text-right flex-shrink-0">
                          <div className="text-lg font-black text-white">${item.total.toFixed(2)}</div>
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
