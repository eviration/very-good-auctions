import { Link } from 'react-router-dom'
import type { AuctionEvent } from '../types'

interface EventCardProps {
  event: AuctionEvent
}

export default function EventCard({ event }: EventCardProps) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const getStatusBadge = () => {
    const now = new Date()
    const startTime = new Date(event.startTime)
    const endTime = new Date(event.endTime)

    if (event.status === 'ended' || now > endTime) {
      return { text: 'Ended', color: 'bg-gray-200 text-gray-600' }
    }
    if (event.status === 'active' || (now >= startTime && now <= endTime)) {
      return { text: 'Live Now', color: 'bg-green-100 text-green-700' }
    }
    if (event.status === 'scheduled' || now < startTime) {
      return { text: 'Coming Soon', color: 'bg-clay-butter text-charcoal' }
    }
    return { text: event.status, color: 'bg-gray-200 text-gray-600' }
  }

  const statusBadge = getStatusBadge()
  const isLive = statusBadge.text === 'Live Now'

  return (
    <Link
      to={`/events/${event.slug}`}
      className="clay-card group block overflow-hidden transition-all duration-300 hover:shadow-clay-lg hover:-translate-y-1"
    >
      {/* Image */}
      <div className="aspect-[16/9] relative overflow-hidden rounded-t-clay-lg">
        {event.coverImageUrl ? (
          <img
            src={event.coverImageUrl}
            alt={event.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-clay-mint via-clay-peach to-clay-lavender flex items-center justify-center">
            <svg
              className="w-16 h-16 text-charcoal/30"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
        )}

        {/* Status Badge */}
        <div className="absolute top-3 left-3">
          <span className={`px-3 py-1 rounded-full text-sm font-bold ${statusBadge.color} ${isLive ? 'animate-pulse' : ''}`}>
            {statusBadge.text}
          </span>
        </div>

        {/* Auction Type Badge */}
        {event.auctionType === 'silent' && (
          <div className="absolute top-3 right-3">
            <span className="px-3 py-1 rounded-full text-sm font-bold bg-clay-lavender text-charcoal">
              Silent
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5">
        <h3 className="font-display text-xl font-bold text-charcoal mb-2 group-hover:text-sage transition-colors line-clamp-1">
          {event.name}
        </h3>

        {event.description && (
          <p className="text-charcoal-light text-sm mb-4 line-clamp-2">
            {event.description}
          </p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-clay-coral" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span className="font-semibold text-charcoal">{event.itemCount}</span>
            <span className="text-charcoal-light">items</span>
          </div>

          {event.totalBids > 0 && (
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-clay-mint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <span className="font-semibold text-charcoal">{event.totalBids}</span>
              <span className="text-charcoal-light">bids</span>
            </div>
          )}
        </div>

        {/* Dates */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between text-sm">
            <span className="text-charcoal-light">
              {isLive ? 'Ends' : statusBadge.text === 'Coming Soon' ? 'Starts' : 'Ended'}
            </span>
            <span className="font-semibold text-charcoal">
              {formatDate(isLive || statusBadge.text === 'Ended' ? event.endTime : event.startTime)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
