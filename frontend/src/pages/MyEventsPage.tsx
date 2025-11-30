import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '../services/api'
import type { AuctionEvent, EventStatus } from '../types'

const statusConfig: Record<EventStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-clay-lavender' },
  scheduled: { label: 'Scheduled', color: 'bg-clay-sky' },
  active: { label: 'Live', color: 'bg-clay-mint' },
  ended: { label: 'Ended', color: 'bg-clay-butter' },
  cancelled: { label: 'Cancelled', color: 'bg-clay-coral' },
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
        <div className="clay-section mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-black text-charcoal mb-2">My Events</h1>
            <p className="text-charcoal-light font-medium">Manage your auction events</p>
          </div>
          <Link
            to="/events/create"
            className="clay-button bg-clay-mint font-bold inline-flex items-center gap-2 self-start"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Create Event
          </Link>
        </div>

        {error && (
          <div className="clay-section mb-8 bg-clay-coral/20 border-clay-coral/40">
            <p className="text-clay-coral font-bold">{error}</p>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-8">
          {(['all', 'draft', 'scheduled', 'active', 'ended'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`clay-button text-sm transition-all ${
                filter === status
                  ? `${status === 'all' ? 'bg-clay-butter' : statusConfig[status].color} shadow-clay scale-105`
                  : 'bg-clay-surface hover:bg-clay-butter'
              }`}
            >
              {status === 'all' ? 'All Events' : statusConfig[status].label}
              {status !== 'all' && (
                <span className="ml-1.5 opacity-70">
                  ({events.filter(e => e.status === status).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {filteredEvents.length === 0 ? (
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
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-charcoal mb-2">
              {filter === 'all' ? 'No events yet' : `No ${statusConfig[filter as EventStatus].label.toLowerCase()} events`}
            </h2>
            <p className="text-charcoal-light font-medium mb-8">
              {filter === 'all'
                ? 'Create your first auction event to get started'
                : 'Try changing the filter to see other events'}
            </p>
            {filter === 'all' && (
              <Link
                to="/events/create"
                className="clay-button bg-clay-mint font-bold inline-flex items-center gap-2"
              >
                Create Your First Event
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredEvents.map((event) => (
              <Link
                key={event.id}
                to={`/events/${event.slug}/manage`}
                className="block clay-card p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h2 className="text-xl font-black text-charcoal">{event.name}</h2>
                      <span className={`clay-badge text-xs ${statusConfig[event.status].color}`}>
                        {statusConfig[event.status].label}
                      </span>
                      {event.auctionType === 'silent' && (
                        <span className="clay-badge text-xs bg-clay-lavender">
                          Silent Auction
                        </span>
                      )}
                    </div>

                    {event.organization && (
                      <p className="text-sm text-charcoal-light font-medium mb-3">
                        {event.organization.name}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-4 text-sm text-charcoal-light">
                      <span className="font-medium">
                        {formatDate(event.startTime)} - {formatDate(event.endTime)}
                      </span>
                      <span className="flex items-center gap-1.5 font-bold">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                        {event.itemCount} / {event.maxItems} items
                      </span>
                      <span className="flex items-center gap-1.5 font-bold">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        {event.totalBids} bids
                      </span>
                      {event.totalRaised > 0 && (
                        <span className="font-black text-charcoal">
                          ${event.totalRaised.toLocaleString()} raised
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="w-10 h-10 rounded-clay bg-clay-butter/50 flex items-center justify-center flex-shrink-0 ml-4">
                    <svg
                      className="w-5 h-5 text-charcoal"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
