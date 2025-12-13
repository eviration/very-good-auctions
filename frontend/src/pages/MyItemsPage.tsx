import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '../services/api'

type SubmittedItem = Awaited<ReturnType<typeof apiClient.getMySubmittedItems>>[number]

type FilterType = 'all' | 'pending' | 'approved' | 'rejected' | 'resubmit'

const submissionStatusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending Review', color: 'bg-clay-butter' },
  approved: { label: 'Approved', color: 'bg-clay-mint' },
  rejected: { label: 'Rejected', color: 'bg-clay-coral' },
  resubmit_requested: { label: 'Resubmit Requested', color: 'bg-clay-peach' },
}

const itemStatusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-clay-lavender' },
  active: { label: 'Active', color: 'bg-clay-sky' },
  sold: { label: 'Sold', color: 'bg-clay-mint' },
  unsold: { label: 'Unsold', color: 'bg-clay-lavender' },
  removed: { label: 'Removed', color: 'bg-clay-coral' },
}

export default function MyItemsPage() {
  const [items, setItems] = useState<SubmittedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterType>('all')

  useEffect(() => {
    const fetchItems = async () => {
      try {
        setLoading(true)
        const data = await apiClient.getMySubmittedItems()
        setItems(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load items')
      } finally {
        setLoading(false)
      }
    }

    fetchItems()
  }, [])

  const filteredItems = items.filter((item) => {
    switch (filter) {
      case 'pending':
        return item.submissionStatus === 'pending'
      case 'approved':
        return item.submissionStatus === 'approved'
      case 'rejected':
        return item.submissionStatus === 'rejected'
      case 'resubmit':
        return item.submissionStatus === 'resubmit_requested'
      default:
        return true
    }
  })

  // Group items by event
  const itemsByEvent = filteredItems.reduce((acc, item) => {
    const eventId = item.event.id
    if (!acc[eventId]) {
      acc[eventId] = {
        event: item.event,
        items: [],
      }
    }
    acc[eventId].items.push(item)
    return acc
  }, {} as Record<string, { event: SubmittedItem['event']; items: SubmittedItem[] }>)

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const pendingCount = items.filter((i) => i.submissionStatus === 'pending').length
  const approvedCount = items.filter((i) => i.submissionStatus === 'approved').length
  const needsActionCount = items.filter((i) => i.submissionStatus === 'resubmit_requested').length

  if (loading) {
    return (
      <div className="min-h-screen bg-clay-bg">
        <div className="max-w-6xl mx-auto px-4 py-12">
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
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="clay-section mb-8">
          <h1 className="font-display text-4xl font-black text-white mb-2">My Items</h1>
          <p className="text-white/70 font-medium">Items you've submitted to auction events</p>
        </div>

        {error && (
          <div className="clay-section mb-8 bg-clay-coral/20 border-clay-coral/40">
            <p className="text-clay-coral font-bold">{error}</p>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="clay-card p-5">
            <p className="text-sm text-white/70 font-bold">Total Items</p>
            <p className="text-3xl font-black text-white">{items.length}</p>
          </div>
          <div className="clay-card p-5 bg-clay-butter/30">
            <p className="text-sm text-white/70 font-bold">Pending Review</p>
            <p className="text-3xl font-black text-white">{pendingCount}</p>
          </div>
          <div className="clay-card p-5 bg-clay-mint/30">
            <p className="text-sm text-white/70 font-bold">Approved</p>
            <p className="text-3xl font-black text-white">{approvedCount}</p>
          </div>
          <div className="clay-card p-5 bg-clay-peach/30">
            <p className="text-sm text-white/70 font-bold">Needs Action</p>
            <p className="text-3xl font-black text-white">{needsActionCount}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-8">
          {([
            { value: 'all', label: 'All Items', color: 'bg-clay-butter' },
            { value: 'pending', label: 'Pending', color: 'bg-clay-butter' },
            { value: 'approved', label: 'Approved', color: 'bg-clay-mint' },
            { value: 'rejected', label: 'Rejected', color: 'bg-clay-coral' },
            { value: 'resubmit', label: 'Needs Resubmit', color: 'bg-clay-peach' },
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

        {filteredItems.length === 0 ? (
          <div className="clay-section text-center py-16">
            <div className="w-20 h-20 bg-clay-lavender rounded-clay flex items-center justify-center mx-auto mb-6 shadow-clay">
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
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-white mb-2">
              {filter === 'all' ? 'No items submitted' : `No ${filter} items`}
            </h2>
            <p className="text-white/70 font-medium mb-8">
              {filter === 'all'
                ? 'Submit items to auction events to see them here'
                : 'Try changing the filter to see other items'}
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
            {Object.values(itemsByEvent).map(({ event, items: eventItems }) => (
              <div key={event.id} className="clay-card overflow-hidden">
                {/* Event Header */}
                <Link
                  to={`/events/${event.slug}`}
                  className="block p-5 bg-clay-butter/30 border-b-2 border-white/60 hover:bg-clay-butter/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-black text-lg text-white">{event.name}</h3>
                      <p className="text-sm text-white/70 font-medium">
                        Ends {formatDate(event.endTime)}
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

                {/* Items List */}
                <div className="divide-y-2 divide-white/40">
                  {eventItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start gap-4 p-5"
                    >
                      {/* Item Image */}
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="w-20 h-20 object-cover rounded-clay shadow-clay-sm flex-shrink-0"
                        />
                      ) : (
                        <div className="w-20 h-20 bg-clay-lavender/30 rounded-clay shadow-clay-sm flex items-center justify-center flex-shrink-0">
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

                      {/* Item Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-bold text-white">{item.title}</h4>
                            {item.description && (
                              <p className="text-sm text-white/70 font-medium line-clamp-2 mt-1">
                                {item.description}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2 flex-shrink-0">
                            <span className={`clay-badge text-xs ${
                              submissionStatusConfig[item.submissionStatus]?.color || 'bg-clay-lavender'
                            }`}>
                              {submissionStatusConfig[item.submissionStatus]?.label || item.submissionStatus}
                            </span>
                            {item.submissionStatus === 'approved' && (
                              <span className={`clay-badge text-xs ${
                                itemStatusConfig[item.status]?.color || 'bg-clay-lavender'
                              }`}>
                                {itemStatusConfig[item.status]?.label || item.status}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-4 mt-3 text-sm">
                          {item.startingPrice && (
                            <span className="text-white/70 font-medium">
                              Starting: <span className="font-black text-white">${item.startingPrice.toFixed(2)}</span>
                            </span>
                          )}
                          {item.currentBid && (
                            <span className="text-white/70 font-medium">
                              Current bid: <span className="font-black text-white">${item.currentBid.toFixed(2)}</span>
                            </span>
                          )}
                          {item.bidCount > 0 && (
                            <span className="text-white/70 font-medium">
                              {item.bidCount} bid{item.bidCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>

                        {/* Rejection/Resubmit Info */}
                        {(item.submissionStatus === 'rejected' || item.submissionStatus === 'resubmit_requested') && item.rejectionReason && (
                          <div className={`mt-4 p-4 rounded-clay text-sm ${
                            item.submissionStatus === 'resubmit_requested'
                              ? 'bg-clay-peach/20'
                              : 'bg-clay-coral/20'
                          }`}>
                            <p className="font-bold text-white mb-1">
                              {item.submissionStatus === 'resubmit_requested' ? 'Please update:' : 'Rejection reason:'}
                            </p>
                            <p className="text-white/70">{item.rejectionReason}</p>
                            {item.allowResubmit && (
                              <Link
                                to={`/events/${event.slug}/items/${item.id}`}
                                className="inline-block mt-3 clay-button bg-clay-mint text-sm py-2"
                              >
                                Edit and resubmit
                              </Link>
                            )}
                          </div>
                        )}

                        <p className="text-xs text-white/70 mt-3">
                          Submitted {formatDate(item.createdAt)}
                        </p>
                      </div>
                    </div>
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
