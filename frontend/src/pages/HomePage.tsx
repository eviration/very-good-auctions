import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '../services/api'
import EventCard from '../components/EventCard'
import type { AuctionEvent } from '../types'
import { useAuth } from '../auth/useAuth'

type EventFilter = 'all' | 'live' | 'upcoming' | 'ended'

export default function HomePage() {
  const { isAuthenticated } = useAuth()
  const [events, setEvents] = useState<AuctionEvent[]>([])
  const [filter, setFilter] = useState<EventFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        // Map filter to status for API
        let status: string | undefined
        if (filter === 'live') status = 'active'
        else if (filter === 'upcoming') status = 'scheduled'
        else if (filter === 'ended') status = 'ended'

        const result = await apiClient.getEvents({
          status: status as 'active' | 'scheduled' | 'ended' | undefined,
          pageSize: 50,
        })
        setEvents(result.data)
      } catch (error) {
        console.error('Failed to fetch events:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchEvents()
  }, [filter])

  const filteredEvents = events.filter((event) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      event.name.toLowerCase().includes(query) ||
      (event.description?.toLowerCase().includes(query) ?? false)
    )
  })

  return (
    <div className="min-h-screen bg-clay-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section - Chunky Clay Style */}
        <section className="clay-section mb-16 text-center relative overflow-hidden">
          {/* Decorative clay blobs */}
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-clay-peach rounded-full opacity-60 blur-sm" />
          <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-clay-mint rounded-full opacity-50 blur-sm" />
          <div className="absolute top-1/2 right-8 w-16 h-16 bg-clay-lavender rounded-full opacity-40 blur-sm" />

          <div className="relative z-10 max-w-3xl mx-auto">
            <h1 className="font-display text-5xl md:text-6xl font-black text-charcoal mb-6 leading-tight tracking-tight">
              Discover Treasures,
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-clay-coral via-clay-peach to-clay-butter">
                Bid with Joy
              </span>
            </h1>
            <p className="text-xl text-charcoal-light mb-10 font-medium max-w-xl mx-auto">
              Browse auction events, find unique items, and bid on treasures from collectors around the world.
            </p>

            {/* Search - Clay Input */}
            <div className="relative max-w-xl mx-auto">
              <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
                <svg
                  className="w-6 h-6 text-charcoal-light"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search auction events..."
                className="clay-input w-full pl-16 pr-6 py-5 text-lg font-medium placeholder:text-charcoal-light/50"
              />
            </div>

            {/* CTA for creating events */}
            {isAuthenticated && (
              <div className="mt-8">
                <Link
                  to="/events/create"
                  className="clay-button bg-sage text-white font-bold inline-flex items-center gap-2 hover:bg-sage-dark transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create Auction Event
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Filter Tabs - Clay Pill Buttons */}
        <section className="mb-12">
          <div className="flex flex-wrap justify-center gap-4">
            {[
              { value: 'all', label: 'All Events', color: 'bg-clay-mint' },
              { value: 'live', label: 'Live Now', color: 'bg-green-100' },
              { value: 'upcoming', label: 'Coming Soon', color: 'bg-clay-butter' },
              { value: 'ended', label: 'Past Events', color: 'bg-gray-200' },
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => setFilter(tab.value as EventFilter)}
                className={`clay-button font-bold text-base transition-all duration-200 ${
                  filter === tab.value
                    ? `${tab.color} shadow-clay scale-105`
                    : 'bg-clay-surface hover:bg-clay-butter'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {/* Events Grid */}
        <section>
          <div className="flex items-center justify-between mb-8">
            <div className="clay-badge bg-clay-butter">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span className="font-black text-charcoal">
                {filter === 'all' ? 'All Events' : filter === 'live' ? 'Live Events' : filter === 'upcoming' ? 'Upcoming Events' : 'Past Events'}
              </span>
              <span className="text-charcoal-light">
                ({filteredEvents.length})
              </span>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="clay-card aspect-[4/5] animate-pulse"
                >
                  <div className="h-full bg-gradient-to-br from-clay-mint/30 via-clay-peach/20 to-clay-lavender/30 rounded-clay-lg" />
                </div>
              ))}
            </div>
          ) : filteredEvents.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredEvents.map((event, index) => (
                <div
                  key={event.id}
                  className="animate-slide-up opacity-0"
                  style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'forwards' }}
                >
                  <EventCard event={event} />
                </div>
              ))}
            </div>
          ) : (
            <div className="clay-section text-center py-16">
              <div className="w-20 h-20 bg-clay-peach rounded-full flex items-center justify-center mx-auto mb-6 shadow-clay">
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
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </div>
              <p className="text-2xl font-bold text-charcoal mb-2">No events found</p>
              <p className="text-charcoal-light font-medium mb-6">
                {searchQuery ? 'Try adjusting your search' : 'Check back soon for new auction events!'}
              </p>
              {isAuthenticated && (
                <Link
                  to="/events/create"
                  className="clay-button bg-sage text-white font-bold inline-flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create Your First Event
                </Link>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
