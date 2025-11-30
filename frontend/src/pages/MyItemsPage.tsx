import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '../services/api'

type SubmittedItem = Awaited<ReturnType<typeof apiClient.getMySubmittedItems>>[number]

type FilterType = 'all' | 'pending' | 'approved' | 'rejected' | 'resubmit'

const submissionStatusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending Review', className: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Approved', className: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800' },
  resubmit_requested: { label: 'Resubmit Requested', className: 'bg-orange-100 text-orange-800' },
}

const itemStatusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-gray-100 text-gray-600' },
  active: { label: 'Active', className: 'bg-blue-100 text-blue-800' },
  sold: { label: 'Sold', className: 'bg-green-100 text-green-800' },
  unsold: { label: 'Unsold', className: 'bg-gray-100 text-gray-600' },
  removed: { label: 'Removed', className: 'bg-red-100 text-red-800' },
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
          <h1 className="font-display text-3xl font-bold text-charcoal">My Items</h1>
          <p className="text-gray-500 mt-1">Items you've submitted to auction events</p>
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
          <p className="text-sm text-gray-500">Total Items</p>
          <p className="text-2xl font-bold text-charcoal">{items.length}</p>
        </div>
        <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4">
          <p className="text-sm text-yellow-600">Pending Review</p>
          <p className="text-2xl font-bold text-yellow-700">{pendingCount}</p>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-200 p-4">
          <p className="text-sm text-green-600">Approved</p>
          <p className="text-2xl font-bold text-green-700">{approvedCount}</p>
        </div>
        <div className="bg-orange-50 rounded-xl border border-orange-200 p-4">
          <p className="text-sm text-orange-600">Needs Action</p>
          <p className="text-2xl font-bold text-orange-700">{needsActionCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {([
          { value: 'all', label: 'All Items' },
          { value: 'pending', label: 'Pending' },
          { value: 'approved', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
          { value: 'resubmit', label: 'Needs Resubmit' },
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

      {filteredItems.length === 0 ? (
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
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
          <h2 className="text-xl font-semibold text-charcoal mb-2">
            {filter === 'all' ? 'No items submitted' : `No ${filter} items`}
          </h2>
          <p className="text-gray-500 mb-6">
            {filter === 'all'
              ? 'Submit items to auction events to see them here'
              : 'Try changing the filter to see other items'}
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
          {Object.values(itemsByEvent).map(({ event, items: eventItems }) => (
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
                      Ends {formatDate(event.endTime)}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    event.status === 'active' ? 'bg-green-100 text-green-800' :
                    event.status === 'ended' ? 'bg-gray-100 text-gray-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                  </span>
                </div>
              </Link>

              {/* Items List */}
              <div className="divide-y divide-gray-100">
                {eventItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-4 p-4"
                  >
                    {/* Item Image */}
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
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

                    {/* Item Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-medium text-charcoal">{item.title}</h4>
                          {item.description && (
                            <p className="text-sm text-gray-500 line-clamp-2 mt-1">
                              {item.description}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                            submissionStatusConfig[item.submissionStatus]?.className || 'bg-gray-100'
                          }`}>
                            {submissionStatusConfig[item.submissionStatus]?.label || item.submissionStatus}
                          </span>
                          {item.submissionStatus === 'approved' && (
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                              itemStatusConfig[item.status]?.className || 'bg-gray-100'
                            }`}>
                              {itemStatusConfig[item.status]?.label || item.status}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-4 mt-2 text-sm">
                        {item.startingPrice && (
                          <span className="text-gray-600">
                            Starting: <span className="font-medium">${item.startingPrice.toFixed(2)}</span>
                          </span>
                        )}
                        {item.currentBid && (
                          <span className="text-sage">
                            Current bid: <span className="font-medium">${item.currentBid.toFixed(2)}</span>
                          </span>
                        )}
                        {item.bidCount > 0 && (
                          <span className="text-gray-600">
                            {item.bidCount} bid{item.bidCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {/* Rejection/Resubmit Info */}
                      {(item.submissionStatus === 'rejected' || item.submissionStatus === 'resubmit_requested') && item.rejectionReason && (
                        <div className={`mt-3 p-3 rounded-lg text-sm ${
                          item.submissionStatus === 'resubmit_requested' ? 'bg-orange-50 text-orange-800' : 'bg-red-50 text-red-700'
                        }`}>
                          <p className="font-medium mb-1">
                            {item.submissionStatus === 'resubmit_requested' ? 'Please update:' : 'Rejection reason:'}
                          </p>
                          <p>{item.rejectionReason}</p>
                          {item.allowResubmit && (
                            <Link
                              to={`/events/${event.slug}/items/${item.id}`}
                              className="inline-block mt-2 text-sage font-medium hover:underline"
                            >
                              Edit and resubmit
                            </Link>
                          )}
                        </div>
                      )}

                      <p className="text-xs text-gray-400 mt-2">
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
  )
}
