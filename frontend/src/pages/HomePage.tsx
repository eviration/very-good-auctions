import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '../services/api'
import EventCard from '../components/EventCard'
import type { AuctionEvent } from '../types'
import { useAuth } from '../auth/useAuth'

type EventFilter = 'all' | 'live' | 'upcoming' | 'ended'

function OurStory() {
  return (
    <div className="glass-section mb-6 bg-gradient-to-br from-purple-500/10 via-transparent to-pink-500/10">
      <div className="max-w-3xl mx-auto text-center px-4 py-8">
        <div className="inline-flex items-center gap-2 bg-gradient-to-r from-pink-500/20 to-purple-500/20 border border-pink-400/30 px-4 py-1.5 rounded-full mb-4">
          <span className="font-semibold text-sm text-white">Our Story</span>
        </div>

        <h2 className="font-display text-2xl md:text-3xl font-bold text-white mb-4">
          Built for the little guys
        </h2>

        <p className="text-white/70 font-medium leading-relaxed mb-4">
          Very Good Auctions started when our small church wanted to run a silent auction fundraiser.
          We tried the big auction platforms, but they were overwhelming&mdash;dozens of features we'd never use,
          confusing dashboards, and fees that ate into our fundraising goals.
        </p>

        <p className="text-white/70 font-medium leading-relaxed mb-6">
          So we built something simpler. A platform where volunteers can set up an auction in minutes,
          donors can bid from their phones during the event, and every dollar raised goes further.
          No complexity, no headaches&mdash;just a very good auction.
        </p>

        <div className="flex flex-wrap justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-teal-500/30 border border-teal-400/40 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-teal-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="font-semibold text-white">Simple setup</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-pink-500/30 border border-pink-400/40 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-pink-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="font-semibold text-white">Mobile-friendly bidding</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-purple-500/30 border border-purple-400/40 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
              </svg>
            </div>
            <span className="font-semibold text-white">Made with care in Snohomish, WA with the help of AI from who knows where</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function HowItWorks() {
  return (
    <div className="glass-section">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h2 className="font-display text-2xl md:text-3xl font-bold text-white mb-8 text-center">
          How It Works
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="w-12 h-12 bg-sage/30 border border-sage/40 rounded-xl flex items-center justify-center mx-auto mb-4">
              <span className="text-xl font-bold text-sage">1</span>
            </div>
            <h3 className="font-semibold text-white mb-2">Create Your Auction</h3>
            <p className="text-white/80 text-sm">
              Set up your event in minutes. Add items, set prices, and customize your auction.
            </p>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-amber-500/30 border border-amber-400/40 rounded-xl flex items-center justify-center mx-auto mb-4">
              <span className="text-xl font-bold text-amber-300">2</span>
            </div>
            <h3 className="font-semibold text-white mb-2">Share With Bidders</h3>
            <p className="text-white/80 text-sm">
              Guests browse and bid from their phones. No app download required.
            </p>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-teal-500/30 border border-teal-400/40 rounded-xl flex items-center justify-center mx-auto mb-4">
              <span className="text-xl font-bold text-teal-300">3</span>
            </div>
            <h3 className="font-semibold text-white mb-2">Collect & Fulfill</h3>
            <p className="text-white/80 text-sm">
              Winners pay securely. You handle pickup or shipping your way.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

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
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Compact Hero with Search */}
        <section className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Left: Title and tagline */}
            <div className="flex-1">
              <h1 className="font-display text-2xl md:text-3xl font-bold text-white leading-tight">
                A simple way to{' '}
                <span className="text-gradient">
                  run an auction
                </span>
              </h1>
              <p className="text-sm text-white/60 mt-1 hidden sm:block">
                Raise money for your school, church, or community group
              </p>
            </div>

            {/* Right: Search and Create button */}
            <div className="flex items-center gap-3 flex-1 md:max-w-md">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <svg
                    className="w-4 h-4 text-white/40"
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
                  className="glass-input w-full pl-10 pr-4 py-2.5 text-sm font-medium"
                />
              </div>
              {isAuthenticated && (
                <Link
                  to="/events/create"
                  className="glass-button text-sm py-2.5 px-4 inline-flex items-center gap-1.5 whitespace-nowrap"
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
              { value: 'all', label: 'All', activeClass: 'bg-gradient-to-r from-purple-500/40 to-pink-500/40 border-purple-400/50' },
              { value: 'live', label: 'Live', activeClass: 'bg-green-500/30 border-green-400/50 text-green-300' },
              { value: 'upcoming', label: 'Upcoming', activeClass: 'bg-amber-500/30 border-amber-400/50 text-amber-300' },
              { value: 'ended', label: 'Past', activeClass: 'bg-white/10 border-white/30 text-white/70' },
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => setFilter(tab.value as EventFilter)}
                className={`px-4 py-2 rounded-full font-semibold text-sm transition-all duration-200 border ${
                  filter === tab.value
                    ? tab.activeClass
                    : 'border-white/10 text-white/60 hover:bg-white/10 hover:border-white/20'
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
                  className="glass-card aspect-[4/5] shimmer"
                />
              ))}
            </div>
          ) : filteredEvents.length > 0 ? (
            <>
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
              {/* Our Story & How It Works - shown below events */}
              <div className="mt-12">
                <OurStory />
                <HowItWorks />
              </div>
            </>
          ) : (
            <>
              {/* Our Story & How It Works - shown above empty state when no events */}
              <div className="mb-8">
                <OurStory />
                <HowItWorks />
              </div>
              <div className="glass-section text-center py-16">
                <div className="w-20 h-20 bg-gradient-to-br from-pink-500/30 to-purple-500/30 border border-pink-400/30 rounded-full flex items-center justify-center mx-auto mb-6 shadow-glass-glow-pink">
                  <svg
                    className="w-10 h-10 text-white/70"
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
                <p className="text-2xl font-bold text-white mb-2">No public auctions right now</p>
                <p className="text-white/60 font-medium mb-6">
                  {searchQuery ? 'Try adjusting your search' : 'Check back soon, or start your own!'}
                </p>
                {isAuthenticated && (
                  <Link
                    to="/events/create"
                    className="glass-button font-semibold inline-flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create Your First Event
                  </Link>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
