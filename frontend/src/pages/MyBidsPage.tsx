import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '../services/api'

type EventBid = Awaited<ReturnType<typeof apiClient.getAllMyBids>>[number]

type FilterType = 'all' | 'winning' | 'outbid' | 'active' | 'ended'

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  ended: 'bg-gray-100 text-gray-800',
  scheduled: 'bg-blue-100 text-blue-800',
  draft: 'bg-yellow-100 text-yellow-800',
}

export default function MyBidsPage() {
  const [bids, setBids] = useState<EventBid[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterType>('all')

  useEffect(() => {
    const fetchBids = async () => {
      try {
        setLoading(true)
        const data = await apiClient.getAllMyBids()
        setBids(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load bids')
      } finally {
        setLoading(false)
      }
    }

    fetchBids()
  }, [])

  const filteredBids = bids.filter((bid) => {
    switch (filter) {
      case 'winning':
        return bid.isWinning
      case 'outbid':
        return !bid.isWinning && bid.event.status === 'active'
      case 'active':
        return bid.event.status === 'active'
      case 'ended':
        return bid.event.status === 'ended'
      default:
        return true
    }
  })

  // Group bids by event
  const bidsByEvent = filteredBids.reduce((acc, bid) => {
    const eventId = bid.event.id
    if (!acc[eventId]) {
      acc[eventId] = {
        event: bid.event,
        bids: [],
      }
    }
    acc[eventId].bids.push(bid)
    return acc
  }, {} as Record<string, { event: EventBid['event']; bids: EventBid[] }>)

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const winningCount = bids.filter((b) => b.isWinning).length
  const outbidCount = bids.filter((b) => !b.isWinning && b.event.status === 'active').length

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-charcoal">My Bids</h1>
          <p className="text-gray-500 mt-1">Track your bids across all auction events</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-sage/20 p-4">
          <p className="text-sm text-gray-500">Total Bids</p>
          <p className="text-2xl font-bold text-charcoal">{bids.length}</p>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-200 p-4">
          <p className="text-sm text-green-600">Winning</p>
          <p className="text-2xl font-bold text-green-700">{winningCount}</p>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
          <p className="text-sm text-amber-600">Outbid</p>
          <p className="text-2xl font-bold text-amber-700">{outbidCount}</p>
        </div>
        <div className="bg-sage/10 rounded-xl border border-sage/20 p-4">
          <p className="text-sm text-sage">Events</p>
          <p className="text-2xl font-bold text-sage">{Object.keys(bidsByEvent).length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {([
          { value: 'all', label: 'All Bids' },
          { value: 'winning', label: 'Winning' },
          { value: 'outbid', label: 'Outbid' },
          { value: 'active', label: 'Active Events' },
          { value: 'ended', label: 'Ended Events' },
        ] as const).map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              filter === tab.value
                ? 'bg-sage text-white'
                : 'bg-sage/10 text-charcoal hover:bg-sage/20'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filteredBids.length === 0 ? (
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
              d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <h2 className="text-xl font-semibold text-charcoal mb-2">
            {filter === 'all' ? 'No bids yet' : `No ${filter} bids`}
          </h2>
          <p className="text-gray-500 mb-6">
            {filter === 'all'
              ? 'Start bidding on auction items to see your activity here'
              : 'Try changing the filter to see other bids'}
          </p>
          <Link
            to="/"
            className="inline-block bg-sage text-white px-6 py-3 rounded-xl font-semibold hover:bg-sage/90"
          >
            Browse Events
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.values(bidsByEvent).map(({ event, bids: eventBids }) => (
            <div key={event.id} className="bg-white rounded-xl border border-sage/20 overflow-hidden">
              {/* Event Header */}
              <Link
                to={`/events/${event.slug}`}
                className="block p-4 bg-sage/5 border-b border-sage/10 hover:bg-sage/10 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-charcoal">{event.name}</h3>
                    <p className="text-sm text-gray-500">
                      {event.auctionType === 'silent' ? 'Silent Auction' : 'Live Auction'} - Ends {formatDate(event.endTime)}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[event.status] || 'bg-gray-100'}`}>
                    {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                  </span>
                </div>
              </Link>

              {/* Bids List */}
              <div className="divide-y divide-gray-100">
                {eventBids.map((bid) => (
                  <Link
                    key={bid.id}
                    to={`/events/${event.slug}/items/${bid.item.id}`}
                    className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors"
                  >
                    {/* Item Image */}
                    {bid.item.imageUrl ? (
                      <img
                        src={bid.item.imageUrl}
                        alt={bid.item.title}
                        className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
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

                    {/* Item Details */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-charcoal truncate">{bid.item.title}</h4>
                      <p className="text-sm text-gray-500">
                        Your bid: <span className="font-semibold">${bid.amount.toFixed(2)}</span>
                        {bid.item.currentBid && (
                          <span className="ml-2">
                            Current: <span className="font-semibold">${bid.item.currentBid.toFixed(2)}</span>
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDate(bid.createdAt)}
                      </p>
                    </div>

                    {/* Status */}
                    <div className="flex-shrink-0">
                      {bid.isWinning ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Winning
                        </span>
                      ) : event.status === 'active' ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          Outbid
                        </span>
                      ) : (
                        <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium">
                          Ended
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
