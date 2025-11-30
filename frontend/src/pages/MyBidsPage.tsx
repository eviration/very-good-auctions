import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '../services/api'

type EventBid = Awaited<ReturnType<typeof apiClient.getAllMyBids>>[number]

type FilterType = 'all' | 'winning' | 'outbid' | 'active' | 'ended'

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
      <div className="min-h-screen bg-clay-bg">
        <div className="max-w-6xl mx-auto px-4 py-12">
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
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="clay-section mb-8">
          <h1 className="font-display text-4xl font-black text-charcoal mb-2">My Bids</h1>
          <p className="text-charcoal-light font-medium">Track your bids across all auction events</p>
        </div>

        {error && (
          <div className="clay-section mb-8 bg-clay-coral/20 border-clay-coral/40">
            <p className="text-clay-coral font-bold">{error}</p>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="clay-card p-5">
            <p className="text-sm text-charcoal-light font-bold">Total Bids</p>
            <p className="text-3xl font-black text-charcoal">{bids.length}</p>
          </div>
          <div className="clay-card p-5 bg-clay-mint/30">
            <p className="text-sm text-charcoal-light font-bold">Winning</p>
            <p className="text-3xl font-black text-charcoal">{winningCount}</p>
          </div>
          <div className="clay-card p-5 bg-clay-peach/30">
            <p className="text-sm text-charcoal-light font-bold">Outbid</p>
            <p className="text-3xl font-black text-charcoal">{outbidCount}</p>
          </div>
          <div className="clay-card p-5 bg-clay-lavender/30">
            <p className="text-sm text-charcoal-light font-bold">Events</p>
            <p className="text-3xl font-black text-charcoal">{Object.keys(bidsByEvent).length}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-8">
          {([
            { value: 'all', label: 'All Bids', color: 'bg-clay-butter' },
            { value: 'winning', label: 'Winning', color: 'bg-clay-mint' },
            { value: 'outbid', label: 'Outbid', color: 'bg-clay-peach' },
            { value: 'active', label: 'Active Events', color: 'bg-clay-sky' },
            { value: 'ended', label: 'Ended Events', color: 'bg-clay-lavender' },
          ] as const).map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`clay-button text-sm transition-all ${
                filter === tab.value
                  ? `${tab.color} shadow-clay scale-105`
                  : 'bg-clay-surface hover:bg-clay-butter'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {filteredBids.length === 0 ? (
          <div className="clay-section text-center py-16">
            <div className="w-20 h-20 bg-clay-peach rounded-clay flex items-center justify-center mx-auto mb-6 shadow-clay">
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
                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-charcoal mb-2">
              {filter === 'all' ? 'No bids yet' : `No ${filter} bids`}
            </h2>
            <p className="text-charcoal-light font-medium mb-8">
              {filter === 'all'
                ? 'Start bidding on auction items to see your activity here'
                : 'Try changing the filter to see other bids'}
            </p>
            <Link
              to="/"
              className="clay-button bg-clay-mint font-bold inline-flex items-center gap-2"
            >
              Browse Events
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.values(bidsByEvent).map(({ event, bids: eventBids }) => (
              <div key={event.id} className="clay-card overflow-hidden">
                {/* Event Header */}
                <Link
                  to={`/events/${event.slug}`}
                  className="block p-5 bg-clay-butter/30 border-b-2 border-white/60 hover:bg-clay-butter/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-black text-lg text-charcoal">{event.name}</h3>
                      <p className="text-sm text-charcoal-light font-medium">
                        {event.auctionType === 'silent' ? 'Silent Auction' : 'Live Auction'} - Ends {formatDate(event.endTime)}
                      </p>
                    </div>
                    <span className={`clay-badge text-xs ${
                      event.status === 'active' ? 'bg-clay-mint' :
                      event.status === 'ended' ? 'bg-clay-lavender' :
                      'bg-clay-sky'
                    }`}>
                      {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                    </span>
                  </div>
                </Link>

                {/* Bids List */}
                <div className="divide-y-2 divide-white/40">
                  {eventBids.map((bid) => (
                    <Link
                      key={bid.id}
                      to={`/events/${event.slug}/items/${bid.item.id}`}
                      className="flex items-center gap-4 p-5 hover:bg-clay-mint/10 transition-colors"
                    >
                      {/* Item Image */}
                      {bid.item.imageUrl ? (
                        <img
                          src={bid.item.imageUrl}
                          alt={bid.item.title}
                          className="w-16 h-16 object-cover rounded-clay shadow-clay-sm flex-shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 bg-clay-lavender/30 rounded-clay shadow-clay-sm flex items-center justify-center flex-shrink-0">
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

                      {/* Item Details */}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-charcoal truncate">{bid.item.title}</h4>
                        <p className="text-sm text-charcoal-light font-medium">
                          Your bid: <span className="font-black text-charcoal">${bid.amount.toFixed(2)}</span>
                          {bid.item.currentBid && (
                            <span className="ml-2">
                              Current: <span className="font-black">${bid.item.currentBid.toFixed(2)}</span>
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-charcoal-light mt-1">
                          {formatDate(bid.createdAt)}
                        </p>
                      </div>

                      {/* Status */}
                      <div className="flex-shrink-0">
                        {bid.isWinning ? (
                          <span className="clay-badge bg-clay-mint text-charcoal">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            Winning
                          </span>
                        ) : event.status === 'active' ? (
                          <span className="clay-badge bg-clay-peach text-charcoal">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            Outbid
                          </span>
                        ) : (
                          <span className="clay-badge bg-clay-lavender text-charcoal">
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
    </div>
  )
}
