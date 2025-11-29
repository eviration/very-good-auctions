import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '../services/api'
import type { AuctionEvent, EventStatus } from '../types'

const statusColors: Record<EventStatus, string> = {
  draft: 'bg-gray-100 text-gray-800',
  scheduled: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
  ended: 'bg-amber-100 text-amber-800',
  cancelled: 'bg-red-100 text-red-800',
}

const statusLabels: Record<EventStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  active: 'Live',
  ended: 'Ended',
  cancelled: 'Cancelled',
}

export default function MyEventsPage() {
  const [events, setEvents] = useState<AuctionEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | EventStatus>('all')

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true)
        const data = await apiClient.getMyEvents()
        setEvents(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load events')
      } finally {
        setLoading(false)
      }
    }

    fetchEvents()
  }, [])

  const filteredEvents = filter === 'all'
    ? events
    : events.filter(e => e.status === filter)

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-3xl font-bold text-charcoal">My Events</h1>
        <Link
          to="/events/create"
          className="bg-sage text-white px-6 py-3 rounded-xl font-semibold hover:bg-sage/90 transition-colors"
        >
          Create Event
        </Link>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {(['all', 'draft', 'scheduled', 'active', 'ended'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              filter === status
                ? 'bg-sage text-white'
                : 'bg-sage/10 text-charcoal hover:bg-sage/20'
            }`}
          >
            {status === 'all' ? 'All Events' : statusLabels[status]}
            {status !== 'all' && (
              <span className="ml-1 opacity-70">
                ({events.filter(e => e.status === status).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {filteredEvents.length === 0 ? (
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
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <h2 className="text-xl font-semibold text-charcoal mb-2">
            {filter === 'all' ? 'No events yet' : `No ${statusLabels[filter as EventStatus].toLowerCase()} events`}
          </h2>
          <p className="text-gray-500 mb-6">
            {filter === 'all'
              ? 'Create your first auction event to get started'
              : 'Try changing the filter to see other events'}
          </p>
          {filter === 'all' && (
            <Link
              to="/events/create"
              className="inline-block bg-sage text-white px-6 py-3 rounded-xl font-semibold hover:bg-sage/90"
            >
              Create Your First Event
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredEvents.map((event) => (
            <Link
              key={event.id}
              to={`/events/${event.slug}/manage`}
              className="block bg-white rounded-xl border border-sage/20 p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-xl font-semibold text-charcoal">{event.name}</h2>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[event.status]}`}>
                      {statusLabels[event.status]}
                    </span>
                    {event.auctionType === 'silent' && (
                      <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-800 font-medium">
                        Silent Auction
                      </span>
                    )}
                  </div>

                  {event.organization && (
                    <p className="text-sm text-gray-500 mb-2">
                      {event.organization.name}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                    <span>
                      {formatDate(event.startTime)} - {formatDate(event.endTime)}
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                      {event.itemCount} / {event.maxItems} items
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      {event.totalBids} bids
                    </span>
                    {event.totalRaised > 0 && (
                      <span className="text-sage font-semibold">
                        ${event.totalRaised.toLocaleString()} raised
                      </span>
                    )}
                  </div>
                </div>

                <svg
                  className="w-5 h-5 text-gray-400 flex-shrink-0 mt-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
