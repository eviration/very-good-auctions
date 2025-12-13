import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import { apiClient } from '../services/api'
import type { AuctionEvent, EventItem, EventItemBid, CurrentBidInfo, SilentBidStatus } from '../types'
import { loginRequest } from '../auth/authConfig'

export default function EventItemPage() {
  const { slug, itemId } = useParams<{ slug: string; itemId: string }>()
  const { instance, accounts } = useMsal()
  const isAuthenticated = accounts.length > 0

  const [event, setEvent] = useState<AuctionEvent | null>(null)
  const [item, setItem] = useState<EventItem | null>(null)
  const [bids, setBids] = useState<EventItemBid[]>([])
  const [currentBidInfo, setCurrentBidInfo] = useState<CurrentBidInfo | null>(null)
  const [silentBidStatus, setSilentBidStatus] = useState<SilentBidStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [bidAmount, setBidAmount] = useState('')
  const [isPlacingBid, setIsPlacingBid] = useState(false)
  const [bidError, setBidError] = useState<string | null>(null)

  // Silent bid options
  const [notifyOnOutbid, setNotifyOnOutbid] = useState(true)
  const [increaseAmount, setIncreaseAmount] = useState('')
  const [showIncreaseModal, setShowIncreaseModal] = useState(false)

  const fetchData = useCallback(async () => {
    if (!slug || !itemId) return

    try {
      setLoading(true)
      const [eventData, itemData] = await Promise.all([
        apiClient.getEvent(slug),
        apiClient.getEventItem(slug, itemId),
      ])

      setEvent(eventData)
      setItem(itemData)

      // Fetch bid info based on auction type
      if (eventData.auctionType === 'silent') {
        if (isAuthenticated) {
          const status = await apiClient.getSilentBidStatus(eventData.id, itemId)
          setSilentBidStatus(status)
        }
      } else {
        const [bidInfo, bidsData] = await Promise.all([
          apiClient.getCurrentBidInfo(eventData.id, itemId),
          apiClient.getEventItemBids(eventData.id, itemId),
        ])
        setCurrentBidInfo(bidInfo)
        setBids(bidsData)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load item')
    } finally {
      setLoading(false)
    }
  }, [slug, itemId, isAuthenticated])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Set initial bid amount
  useEffect(() => {
    if (currentBidInfo) {
      setBidAmount(currentBidInfo.minBid.toString())
    } else if (item?.startingPrice) {
      setBidAmount(item.startingPrice.toString())
    }
  }, [currentBidInfo, item])

  const handleLogin = () => {
    instance.loginRedirect(loginRequest)
  }

  const handlePlaceBid = async () => {
    if (!event || !item || !bidAmount) return

    setIsPlacingBid(true)
    setBidError(null)

    try {
      const amount = parseFloat(bidAmount)

      if (event.auctionType === 'silent') {
        const status = await apiClient.placeSilentBid(event.id, item.id, {
          amount,
          notifyOnOutbid,
        })
        setSilentBidStatus(status)
      } else {
        const newBid = await apiClient.placeEventBid(event.id, item.id, { amount })
        setBids((prev) => [newBid, ...prev])

        // Refresh bid info
        const bidInfo = await apiClient.getCurrentBidInfo(event.id, item.id)
        setCurrentBidInfo(bidInfo)
        setBidAmount(bidInfo.minBid.toString())
      }
    } catch (err) {
      setBidError(err instanceof Error ? err.message : 'Failed to place bid')
    } finally {
      setIsPlacingBid(false)
    }
  }

  const handleIncreaseBid = async () => {
    if (!event || !item || !increaseAmount) return

    setIsPlacingBid(true)
    setBidError(null)

    try {
      const status = await apiClient.increaseSilentBid(event.id, item.id, {
        increaseBy: parseFloat(increaseAmount),
      })
      setSilentBidStatus(status)
      setShowIncreaseModal(false)
      setIncreaseAmount('')
    } catch (err) {
      setBidError(err instanceof Error ? err.message : 'Failed to increase bid')
    } finally {
      setIsPlacingBid(false)
    }
  }

  const handleBuyNow = async () => {
    if (!event || !item || !item.buyNowPrice) return
    if (!confirm(`Buy this item now for $${item.buyNowPrice}?`)) return

    setIsPlacingBid(true)
    setBidError(null)

    try {
      await apiClient.buyNow(event.id, item.id, {})
      // Refresh item data
      const updatedItem = await apiClient.getEventItem(event.id, item.id)
      setItem(updatedItem)
    } catch (err) {
      setBidError(err instanceof Error ? err.message : 'Failed to complete purchase')
    } finally {
      setIsPlacingBid(false)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const getTimeRemaining = () => {
    if (!event) return null
    const end = new Date(event.endTime)
    const now = new Date()
    const diff = end.getTime() - now.getTime()

    if (diff <= 0) return 'Ended'

    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    if (days > 0) return `${days}d ${hours}h remaining`
    if (hours > 0) return `${hours}h ${minutes}m remaining`
    return `${minutes}m remaining`
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage"></div>
        </div>
      </div>
    )
  }

  if (error || !event || !item) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error || 'Item not found'}
        </div>
      </div>
    )
  }

  const isActive = event.status === 'active'
  const isSold = item.status === 'sold'
  const canBid = isActive && !isSold && isAuthenticated

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link to={`/events/${slug}`} className="text-sage hover:underline">
          &larr; Back to {event.name}
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Images */}
        <div className="space-y-4">
          {/* Main Image */}
          <div className="aspect-square bg-gray-100 rounded-xl overflow-hidden">
            {item.images.length > 0 ? (
              <img
                src={item.images[selectedImageIndex].blobUrl}
                alt={item.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg
                  className="w-24 h-24 text-gray-300"
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
          </div>

          {/* Thumbnails */}
          {item.images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {item.images.map((image, index) => (
                <button
                  key={image.id}
                  onClick={() => setSelectedImageIndex(index)}
                  className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 ${
                    selectedImageIndex === index ? 'border-sage' : 'border-transparent'
                  }`}
                >
                  <img
                    src={image.blobUrl}
                    alt={`${item.title} ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-6">
          {/* Title and Status */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              {isSold && (
                <span className="bg-green-100 text-green-800 text-sm px-3 py-1 rounded-full font-medium">
                  Sold
                </span>
              )}
              {event.auctionType === 'silent' && (
                <span className="bg-purple-100 text-purple-800 text-sm px-3 py-1 rounded-full font-medium">
                  Silent Auction
                </span>
              )}
            </div>
            <h1 className="text-3xl font-bold text-white">{item.title}</h1>
          </div>

          {/* Bid Info */}
          <div className="bg-sage/10 rounded-xl p-6">
            {event.auctionType === 'silent' ? (
              // Silent Auction
              <div className="space-y-4">
                {silentBidStatus?.hasBid ? (
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Your bid</div>
                    <div className="text-3xl font-bold text-sage">
                      ${silentBidStatus.amount}
                    </div>
                    {silentBidStatus.rank && (
                      <div className="text-sm text-gray-600 mt-2">
                        You are ranked #{silentBidStatus.rank} of {silentBidStatus.totalBidders} bidders
                      </div>
                    )}
                    {canBid && (
                      <button
                        onClick={() => setShowIncreaseModal(true)}
                        className="mt-4 w-full py-3 bg-sage text-white font-semibold rounded-xl hover:bg-sage/90"
                      >
                        Increase Your Bid
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Starting price</div>
                    <div className="text-3xl font-bold text-sage">
                      ${item.startingPrice || 0}
                    </div>
                    <div className="text-sm text-gray-600 mt-2">
                      {item.bidCount} bid{item.bidCount !== 1 ? 's' : ''} placed
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Standard Auction
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-600">
                      {currentBidInfo?.currentBid ? 'Current bid' : 'Starting price'}
                    </div>
                    <div className="text-3xl font-bold text-sage">
                      ${currentBidInfo?.currentBid || currentBidInfo?.startingPrice || item.startingPrice || 0}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-600">{getTimeRemaining()}</div>
                    <div className="text-sm text-gray-500">
                      {currentBidInfo?.bidCount || item.bidCount} bids
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bidding Form */}
          {canBid && (
            <div className="space-y-4">
              {bidError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {bidError}
                </div>
              )}

              {event.auctionType === 'standard' && (
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Your Bid
                  </label>
                  <div className="flex gap-3">
                    <div className="flex-1 relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                      <input
                        type="number"
                        min={currentBidInfo?.minBid || item.startingPrice || 0}
                        step="0.01"
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                        className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
                      />
                    </div>
                    <button
                      onClick={handlePlaceBid}
                      disabled={isPlacingBid}
                      className="px-6 py-3 bg-sage text-white font-semibold rounded-xl hover:bg-sage/90 disabled:opacity-50"
                    >
                      {isPlacingBid ? 'Placing...' : 'Place Bid'}
                    </button>
                  </div>
                  {currentBidInfo && (
                    <div className="text-sm text-gray-500 mt-2">
                      Minimum bid: ${currentBidInfo.minBid}
                      {currentBidInfo.incrementType === 'fixed'
                        ? ` (${currentBidInfo.incrementValue} increment)`
                        : ` (${currentBidInfo.incrementValue}% increment)`}
                    </div>
                  )}
                </div>
              )}

              {event.auctionType === 'silent' && !silentBidStatus?.hasBid && (
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Your Bid
                  </label>
                  <div className="flex gap-3">
                    <div className="flex-1 relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                      <input
                        type="number"
                        min={item.startingPrice || 0}
                        step="0.01"
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                        className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
                      />
                    </div>
                    <button
                      onClick={handlePlaceBid}
                      disabled={isPlacingBid}
                      className="px-6 py-3 bg-sage text-white font-semibold rounded-xl hover:bg-sage/90 disabled:opacity-50"
                    >
                      {isPlacingBid ? 'Placing...' : 'Place Bid'}
                    </button>
                  </div>
                  <label className="flex items-center gap-2 mt-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyOnOutbid}
                      onChange={(e) => setNotifyOnOutbid(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-sage focus:ring-sage"
                    />
                    <span className="text-sm text-gray-600">Notify me if I'm outbid</span>
                  </label>
                </div>
              )}

              {/* Buy Now */}
              {item.buyNowPrice && event.buyNowEnabled && !isSold && (
                <button
                  onClick={handleBuyNow}
                  disabled={isPlacingBid}
                  className="w-full py-3 bg-amber-500 text-white font-semibold rounded-xl hover:bg-amber-600 disabled:opacity-50"
                >
                  Buy Now - ${item.buyNowPrice}
                </button>
              )}
            </div>
          )}

          {/* Not Authenticated */}
          {!isAuthenticated && isActive && !isSold && (
            <button
              onClick={handleLogin}
              className="w-full py-3 bg-sage text-white font-semibold rounded-xl hover:bg-sage/90"
            >
              Sign In to Bid
            </button>
          )}

          {/* Item Description */}
          {item.description && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-2">Description</h2>
              <p className="text-gray-600 whitespace-pre-wrap">{item.description}</p>
            </div>
          )}

          {/* Item Details */}
          {item.condition && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-2">Details</h2>
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-gray-500">Condition</dt>
                  <dd className="font-medium text-white capitalize">
                    {item.condition.replace('-', ' ')}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </div>

      {/* Bid History (Standard Auction Only) */}
      {event.auctionType === 'standard' && bids.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold text-white mb-4">Bid History</h2>
          <div className="bg-white rounded-xl border border-sage/20 overflow-hidden">
            <table className="w-full">
              <thead className="bg-sage/10">
                <tr>
                  <th className="text-left px-6 py-3 text-sm font-medium text-white">Bidder</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-white">Amount</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-white">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sage/10">
                {bids.map((bid, index) => (
                  <tr key={bid.id} className={index === 0 ? 'bg-green-50' : ''}>
                    <td className="px-6 py-4">
                      <span className="font-medium text-white">
                        {bid.bidderName || 'Anonymous'}
                      </span>
                      {index === 0 && (
                        <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                          Highest
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-semibold text-sage">
                      ${bid.amount}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {formatDate(bid.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Increase Bid Modal (Silent Auction) */}
      {showIncreaseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-white mb-4">Increase Your Bid</h2>
            <p className="text-gray-600 mb-4">
              Current bid: <strong>${silentBidStatus?.amount}</strong>
            </p>

            {bidError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {bidError}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Increase by
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={increaseAmount}
                  onChange={(e) => setIncreaseAmount(e.target.value)}
                  className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
                  placeholder="10"
                />
              </div>
              {increaseAmount && silentBidStatus && (
                <p className="text-sm text-gray-500 mt-2">
                  New total: ${(silentBidStatus.amount! + parseFloat(increaseAmount || '0')).toFixed(2)}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-4 mt-6">
              <button
                onClick={() => {
                  setShowIncreaseModal(false)
                  setIncreaseAmount('')
                  setBidError(null)
                }}
                className="px-4 py-2 border border-sage/30 rounded-lg hover:bg-sage/10"
              >
                Cancel
              </button>
              <button
                onClick={handleIncreaseBid}
                disabled={isPlacingBid || !increaseAmount}
                className="bg-sage text-white px-4 py-2 rounded-lg hover:bg-sage/90 disabled:opacity-50"
              >
                {isPlacingBid ? 'Updating...' : 'Increase Bid'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
