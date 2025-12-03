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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Compact Hero with Search */}
        <section className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Left: Title and tagline */}
            <div className="flex-1">
              <h1 className="font-display text-2xl md:text-3xl font-black text-charcoal leading-tight">
                A simple way to{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-clay-coral via-clay-peach to-clay-butter">
                  run an auction
                </span>
              </h1>
              <p className="text-sm text-charcoal-light mt-1 hidden sm:block">
                Raise money for your school, church, or community group
              </p>
            </div>

            {/* Right: Search and Create button */}
            <div className="flex items-center gap-3 flex-1 md:max-w-md">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <svg
                    className="w-4 h-4 text-charcoal-light"
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
                  placeholder="Search events..."
                  className="clay-input w-full pl-10 pr-4 py-2.5 text-sm font-medium placeholder:text-charcoal-light/50"
                />
              </div>
              {isAuthenticated && (
                <Link
                  to="/events/create"
                  className="clay-button bg-sage text-white font-bold text-sm py-2.5 px-4 inline-flex items-center gap-1.5 hover:bg-sage-dark transition-colors whitespace-nowrap"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="hidden sm:inline">Create Event</span>
                  <span className="sm:hidden">New</span>
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* Filter Tabs - Compact */}
        <section className="mb-6">
          <div className="flex flex-wrap gap-2">
            {[
              { value: 'all', label: 'All', color: 'bg-clay-mint' },
              { value: 'live', label: 'Live', color: 'bg-green-100' },
              { value: 'upcoming', label: 'Upcoming', color: 'bg-clay-butter' },
              { value: 'ended', label: 'Past', color: 'bg-gray-200' },
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => setFilter(tab.value as EventFilter)}
                className={`px-3 py-1.5 rounded-full font-bold text-sm transition-all duration-200 ${
                  filter === tab.value
                    ? `${tab.color} shadow-sm`
                    : 'bg-clay-surface hover:bg-clay-butter text-charcoal-light'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {/* Events Grid */}
        <section>

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
