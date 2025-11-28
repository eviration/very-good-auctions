import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements } from '@stripe/react-stripe-js'
import { apiClient } from '../services/api'
import { signalRService } from '../services/signalr'
import { useCountdown } from '../hooks/useCountdown'
import { useAuth } from '../auth/useAuth'
import type { Auction, Bid } from '../types'
import PaymentModal from '../components/PaymentModal'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || '')

export default function AuctionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, login } = useAuth()

  const [auction, setAuction] = useState<Auction | null>(null)
  const [bids, setBids] = useState<Bid[]>([])
  const [bidAmount, setBidAmount] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isBidding, setIsBidding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [pendingBidAmount, setPendingBidAmount] = useState(0)

  const countdown = useCountdown(auction?.endTime || new Date())
  const minBid = (auction?.currentBid || auction?.startingPrice || 0) + 25

  useEffect(() => {
    if (!id) return

    const fetchAuction = async () => {
      try {
        const [auctionData, bidsData] = await Promise.all([
          apiClient.getAuction(id),
          apiClient.getAuctionBids(id),
        ])
        setAuction(auctionData)
        setBids(bidsData)
      } catch (err) {
        console.error('Failed to fetch auction:', err)
        setError('Auction not found')
      } finally {
        setIsLoading(false)
      }
    }

    fetchAuction()

    // Subscribe to real-time updates
    signalRService.subscribeToAuction(id)

    const unsubscribe = signalRService.onBidUpdate(id, (event) => {
      setAuction((prev) =>
        prev
          ? {
              ...prev,
              currentBid: event.currentBid,
              bidCount: event.bidCount,
            }
          : null
      )
    })

    return () => {
      signalRService.unsubscribeFromAuction(id)
      unsubscribe()
    }
  }, [id])

  const handleBidSubmit = async () => {
    if (!isAuthenticated) {
      login()
      return
    }

    const amount = parseFloat(bidAmount)
    if (isNaN(amount) || amount < minBid) {
      setError(`Minimum bid is $${minBid}`)
      return
    }

    setPendingBidAmount(amount)
    setShowPaymentModal(true)
  }

  const handlePaymentSuccess = async () => {
    if (!id) return

    setIsBidding(true)
    setError(null)

    try {
      await apiClient.placeBid(id, { amount: pendingBidAmount })
      setBidAmount('')
      setShowPaymentModal(false)

      // Refresh bids
      const bidsData = await apiClient.getAuctionBids(id)
      setBids(bidsData)
    } catch (err) {
      setError('Failed to place bid. Please try again.')
    } finally {
      setIsBidding(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-sage border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error && !auction) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-charcoal mb-2">Auction Not Found</h2>
          <p className="text-gray-600 mb-4">The auction you're looking for doesn't exist.</p>
          <Link to="/" className="text-sage font-medium hover:underline">
            Back to Auctions
          </Link>
        </div>
      </div>
    )
  }

  if (!auction) return null

  const primaryImage = auction.images?.find((img) => img.isPrimary) || auction.images?.[0]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sage font-medium mb-6 hover:underline"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Auctions
      </button>

      <div className="grid lg:grid-cols-2 gap-10">
        {/* Images */}
        <div>
          <div className="rounded-2xl overflow-hidden shadow-lg">
            {primaryImage ? (
              <img
                src={primaryImage.blobUrl}
                alt={auction.title}
                className="w-full aspect-square object-cover"
              />
            ) : (
              <div className="w-full aspect-square bg-gray-200 flex items-center justify-center">
                <span className="text-gray-400">No image</span>
              </div>
            )}
          </div>

          {/* Thumbnail Gallery */}
          {auction.images && auction.images.length > 1 && (
            <div className="flex gap-3 mt-4 overflow-x-auto pb-2">
              {auction.images.map((image) => (
                <button
                  key={image.id}
                  className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 ${
                    image.isPrimary ? 'border-sage' : 'border-transparent'
                  }`}
                >
                  <img
                    src={image.blobUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          {auction.category && (
            <span className="inline-block bg-sage text-white px-3 py-1 rounded-full text-sm font-medium mb-4">
              {auction.category.name}
            </span>
          )}

          <h1 className="font-display text-3xl md:text-4xl font-bold text-charcoal mb-4">
            {auction.title}
          </h1>

          <p className="text-gray-600 text-lg leading-relaxed mb-6">
            {auction.description}
          </p>

          {/* Time Remaining */}
          <div
            className={`flex items-center gap-3 p-4 rounded-xl mb-6 ${
              countdown.isUrgent
                ? 'bg-terracotta/10 border-2 border-terracotta'
                : 'bg-cream border border-gray-200'
            }`}
          >
            <svg
              className={`w-6 h-6 ${countdown.isUrgent ? 'text-terracotta' : 'text-charcoal'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <p className="text-sm text-gray-500">Time Remaining</p>
              <p
                className={`text-xl font-semibold ${
                  countdown.isUrgent ? 'text-terracotta' : 'text-charcoal'
                }`}
              >
                {countdown.formatted}
              </p>
            </div>
          </div>

          {/* Bidding Section */}
          <div className="bg-warm-white border-2 border-sage rounded-2xl p-6 mb-6">
            <div className="flex justify-between items-end mb-6">
              <div>
                <p className="text-sm text-gray-500 mb-1">Current Bid</p>
                <p className="font-display text-4xl font-bold text-sage-dark">
                  {formatCurrency(auction.currentBid || auction.startingPrice)}
                </p>
              </div>
              <p className="text-lg font-medium text-charcoal">
                {auction.bidCount} bids
              </p>
            </div>

            {!countdown.isExpired && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-charcoal mb-2">
                    Your Bid (minimum {formatCurrency(minBid)})
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl text-gray-500">
                      $
                    </span>
                    <input
                      type="number"
                      value={bidAmount}
                      onChange={(e) => setBidAmount(e.target.value)}
                      placeholder={minBid.toString()}
                      min={minBid}
                      className="w-full pl-10 pr-4 py-4 text-xl font-semibold border-2 border-gray-200 
                                 rounded-xl focus:border-sage focus:ring-0"
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-red-500 text-sm mb-4">{error}</p>
                )}

                <button
                  onClick={handleBidSubmit}
                  disabled={isBidding || countdown.isExpired}
                  className="w-full py-4 bg-terracotta text-white font-semibold text-lg rounded-xl
                             hover:bg-terracotta/90 disabled:opacity-50 disabled:cursor-not-allowed
                             transition-colors shadow-lg"
                >
                  {isBidding ? 'Placing Bid...' : isAuthenticated ? 'Place Bid' : 'Sign In to Bid'}
                </button>
              </>
            )}

            {countdown.isExpired && (
              <div className="text-center py-4">
                <p className="text-xl font-semibold text-charcoal">Auction Ended</p>
              </div>
            )}
          </div>

          {/* Item Details */}
          <div className="grid grid-cols-2 gap-4">
            <DetailCard icon="tag" label="Condition" value={auction.condition} />
            <DetailCard icon="user" label="Seller" value={auction.seller?.name || 'Unknown'} />
            <DetailCard icon="truck" label="Shipping" value={auction.shippingInfo} />
            <DetailCard icon="shield" label="Protection" value="Buyer Guaranteed" />
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <Elements stripe={stripePromise}>
          <PaymentModal
            auction={auction}
            bidAmount={pendingBidAmount}
            onClose={() => setShowPaymentModal(false)}
            onSuccess={handlePaymentSuccess}
          />
        </Elements>
      )}
    </div>
  )
}

function DetailCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  const icons: Record<string, React.ReactNode> = {
    tag: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    ),
    user: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    ),
    truck: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
    ),
    shield: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    ),
  }

  return (
    <div className="flex items-start gap-3 p-4 bg-cream rounded-xl">
      <svg className="w-5 h-5 text-sage mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {icons[icon]}
      </svg>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="font-medium text-charcoal capitalize">{value}</p>
      </div>
    </div>
  )
}
