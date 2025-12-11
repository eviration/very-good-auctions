import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import { apiClient } from '../services/api'
import type { AuctionEvent, EventItem, EventStatus } from '../types'

const statusColors: Record<EventStatus, string> = {
  draft: 'bg-gray-100 text-gray-800',
  scheduled: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
  ended: 'bg-amber-100 text-amber-800',
  cancelled: 'bg-red-100 text-red-800',
}

export default function EventDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const { accounts } = useMsal()
  const isAuthenticated = accounts.length > 0

  const [event, setEvent] = useState<AuctionEvent | null>(null)
  const [items, setItems] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [accessCode, setAccessCode] = useState('')
  const [accessVerified, setAccessVerified] = useState(false)
  const [verifyingAccess, setVerifyingAccess] = useState(false)

  const [sortBy, setSortBy] = useState<'title' | 'price' | 'bids' | 'endingSoon'>('title')
  const [searchQuery, setSearchQuery] = useState('')

  const fetchData = useCallback(async () => {
    if (!slug) return

    try {
      setLoading(true)
      const eventData = await apiClient.getEvent(slug)
      setEvent(eventData)

      // Fetch items if event is active/ended or user is admin
      if (eventData.status === 'active' || eventData.status === 'ended' || eventData.isAdmin) {
        const itemsData = await apiClient.getEventItems(slug, { submissionStatus: 'approved' })
        setItems(itemsData.filter((item) => item.status !== 'removed'))
      }

      // Check if access code is in URL params or localStorage
      const storedCode = localStorage.getItem(`event_access_${slug}`)
      if (storedCode && eventData.accessCode) {
        setAccessCode(storedCode)
        setAccessVerified(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load event')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleVerifyAccess = async () => {
    if (!event || !accessCode) return

    setVerifyingAccess(true)
    try {
      const result = await apiClient.verifyEventAccess(event.id, accessCode)
      if (result.valid) {
        setAccessVerified(true)
        localStorage.setItem(`event_access_${slug}`, accessCode)
      } else {
        alert('Invalid access code')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to verify access')
    } finally {
      setVerifyingAccess(false)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
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

  const filteredAndSortedItems = items
    .filter((item) =>
      searchQuery
        ? item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.description?.toLowerCase().includes(searchQuery.toLowerCase())
        : true
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'price':
          return (b.currentBid || b.startingPrice || 0) - (a.currentBid || a.startingPrice || 0)
        case 'bids':
          return b.bidCount - a.bidCount
        case 'endingSoon':
          return 0 // All items in an event end at the same time
        case 'title':
        default:
          return a.title.localeCompare(b.title)
      }
    })

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage"></div>
        </div>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error || 'Event not found'}
        </div>
      </div>
    )
  }

  // Access code required but not verified
  if (event.accessCode && !accessVerified && !event.isAdmin) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="bg-white rounded-xl border border-sage/20 p-8 text-center">
          <svg
            className="w-16 h-16 text-sage mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <h1 className="text-2xl font-bold text-charcoal mb-2">{event.name}</h1>
          <p className="text-gray-600 mb-6">This event requires an access code to view.</p>

          <div className="space-y-4">
            <input
              type="text"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
              placeholder="Enter access code"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0 text-center font-mono text-lg uppercase"
            />
            <button
              onClick={handleVerifyAccess}
              disabled={!accessCode || verifyingAccess}
              className="w-full py-3 bg-sage text-white font-semibold rounded-xl hover:bg-sage/90 disabled:opacity-50"
            >
              {verifyingAccess ? 'Verifying...' : 'Enter Event'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Event Header */}
      <div className="glass-section p-6 mb-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-white">{event.name}</h1>
              <span className={`text-sm px-3 py-1 rounded-full font-medium ${statusColors[event.status]}`}>
                {event.status === 'active' ? 'Live Now' : event.status.charAt(0).toUpperCase() + event.status.slice(1)}
              </span>
              {event.auctionType === 'silent' && (
                <span className="text-sm px-3 py-1 rounded-full bg-purple-500/30 text-purple-300 border border-purple-400/30 font-medium">
                  Silent Auction
                </span>
              )}
            </div>

            {event.organization && (
              <Link
                to={`/organizations/${event.organization.slug}`}
                className="text-purple-400 hover:text-purple-300 hover:underline font-medium"
              >
                {event.organization.name}
              </Link>
            )}
          </div>

          {event.isAdmin && (
            <Link
              to={`/events/${slug}/manage`}
              className="glass-button text-sm py-2 px-4"
            >
              Manage Event
            </Link>
          )}
        </div>

        {event.description && (
          <p className="text-white/70 mb-4">{event.description}</p>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-white/50">Status</div>
            <div className="font-semibold text-white">
              {event.status === 'active' ? getTimeRemaining() : formatDate(event.endTime)}
            </div>
          </div>
          <div>
            <div className="text-sm text-white/50">Items</div>
            <div className="font-semibold text-white">{event.itemCount}</div>
          </div>
          <div>
            <div className="text-sm text-white/50">Total Bids</div>
            <div className="font-semibold text-white">{event.totalBids}</div>
          </div>
          <div>
            <div className="text-sm text-white/50">
              {event.status === 'ended' ? 'Total Raised' : 'Current Total'}
            </div>
            <div className="font-semibold text-teal-400">${event.totalRaised.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Event Not Yet Active */}
      {event.status === 'scheduled' && (
        <div className="glass-section glass-accent-blue px-6 py-4 mb-8 text-center">
          <h2 className="text-xl font-semibold text-white mb-2">Auction starts soon!</h2>
          <p className="text-white/70">Bidding begins on {formatDate(event.startTime)}</p>
        </div>
      )}

      {/* Draft/Cancelled State */}
      {(event.status === 'draft' || event.status === 'cancelled') && !event.isAdmin && (
        <div className="glass-section px-6 py-4 mb-8 text-center">
          <h2 className="text-xl font-semibold text-white mb-2">
            {event.status === 'draft' ? 'Coming Soon' : 'Event Cancelled'}
          </h2>
          <p className="text-white/70">
            {event.status === 'draft'
              ? 'This event is being prepared. Check back later!'
              : 'This event has been cancelled.'}
          </p>
        </div>
      )}

      {/* Items Grid */}
      {(event.status === 'active' || event.status === 'ended' || event.isAdmin) && (
        <>
          {/* Search and Sort */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="glass-input w-full"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="glass-input bg-white/5"
            >
              <option value="title" className="bg-[#1a1a2e] text-white">Sort by Name</option>
              <option value="price" className="bg-[#1a1a2e] text-white">Sort by Price</option>
              <option value="bids" className="bg-[#1a1a2e] text-white">Sort by Bids</option>
            </select>
          </div>

          {filteredAndSortedItems.length === 0 ? (
            <div className="text-center py-12 glass-section">
              <svg
                className="w-16 h-16 text-white/30 mx-auto mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
              <h2 className="text-xl font-semibold text-white mb-2">
                {searchQuery ? 'No items match your search' : 'No items yet'}
              </h2>
              <p className="text-white/60">
                {searchQuery
                  ? 'Try a different search term'
                  : 'Check back later for auction items'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredAndSortedItems.map((item) => (
                <Link
                  key={item.id}
                  to={`/events/${slug}/items/${item.id}`}
                  className="glass-card overflow-hidden"
                >
                  {/* Item Image */}
                  <div className="aspect-square bg-white/5 relative">
                    {item.images.length > 0 ? (
                      <img
                        src={item.images[0].blobUrl}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg
                          className="w-16 h-16 text-white/20"
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

                    {/* Status Badge */}
                    {item.status === 'sold' && (
                      <div className="absolute top-2 right-2 bg-green-500/90 text-white text-xs px-2 py-1 rounded-full font-medium">
                        Sold
                      </div>
                    )}
                    {item.buyNowPrice && event.buyNowEnabled && item.status !== 'sold' && (
                      <div className="absolute top-2 right-2 bg-amber-500/90 text-white text-xs px-2 py-1 rounded-full font-medium">
                        Buy Now ${item.buyNowPrice}
                      </div>
                    )}
                  </div>

                  {/* Item Details */}
                  <div className="p-4">
                    <h3 className="font-semibold text-white mb-1 truncate">{item.title}</h3>

                    {event.auctionType === 'silent' ? (
                      <div className="text-white/60 text-sm">
                        {item.bidCount > 0 ? `${item.bidCount} bid${item.bidCount !== 1 ? 's' : ''}` : 'No bids yet'}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-white/50">
                            {item.currentBid ? 'Current bid' : 'Starting price'}
                          </div>
                          <div className="text-lg font-bold text-teal-400">
                            ${item.currentBid || item.startingPrice || 0}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-white/60">
                            {item.bidCount} bid{item.bidCount !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* Not Logged In CTA */}
      {!isAuthenticated && event.status === 'active' && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#1a1a2e]/95 backdrop-blur-xl border-t border-white/10 p-4 shadow-glass-lg">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div>
              <div className="font-semibold text-white">Ready to bid?</div>
              <div className="text-sm text-white/60">Sign in to place bids on auction items</div>
            </div>
            <button
              onClick={() => {
                // Trigger MSAL login
                const loginButton = document.querySelector('[data-testid="login-button"]') as HTMLButtonElement
                loginButton?.click()
              }}
              className="glass-button"
            >
              Sign In to Bid
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
