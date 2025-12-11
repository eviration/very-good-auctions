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
      return { text: 'Ended', color: 'bg-white/10 text-white/60 border-white/20' }
    }
    if (event.status === 'active' || (now >= startTime && now <= endTime)) {
      return { text: 'Live Now', color: 'bg-green-500/30 text-green-300 border-green-400/40' }
    }
    if (event.status === 'scheduled' || now < startTime) {
      return { text: 'Coming Soon', color: 'bg-amber-500/30 text-amber-300 border-amber-400/40' }
    }
    return { text: event.status, color: 'bg-white/10 text-white/60 border-white/20' }
  }

  const statusBadge = getStatusBadge()
  const isLive = statusBadge.text === 'Live Now'

  return (
    <Link
      to={`/events/${event.slug}`}
      className="glass-card group block overflow-hidden transition-all duration-300 hover:shadow-glass-lg hover:-translate-y-1 hover:border-white/30"
    >
      {/* Image */}
      <div className="aspect-[16/9] relative overflow-hidden rounded-t-glass-lg">
        {event.coverImageUrl ? (
          <img
            src={event.coverImageUrl}
            alt={event.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-500/30 via-pink-500/20 to-blue-500/30 flex items-center justify-center">
            <svg
              className="w-16 h-16 text-white/30"
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

        {/* Gradient overlay for better text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

        {/* Status Badge */}
        <div className="absolute top-3 left-3">
          <span className={`px-3 py-1 rounded-full text-sm font-semibold border backdrop-blur-sm ${statusBadge.color} ${isLive ? 'animate-pulse' : ''}`}>
            {statusBadge.text}
          </span>
        </div>

        {/* Auction Type Badge */}
        {event.auctionType === 'silent' && (
          <div className="absolute top-3 right-3">
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-purple-500/30 text-purple-300 border border-purple-400/40 backdrop-blur-sm">
              Silent
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5">
        <h3 className="font-display text-xl font-bold text-white mb-2 group-hover:text-purple-300 transition-colors line-clamp-1">
          {event.name}
        </h3>

        {event.description && (
          <p className="text-white/60 text-sm mb-4 line-clamp-2">
            {event.description}
          </p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span className="font-semibold text-white">{event.itemCount}</span>
            <span className="text-white/50">items</span>
          </div>

          {event.totalBids > 0 && (
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <span className="font-semibold text-white">{event.totalBids}</span>
              <span className="text-white/50">bids</span>
            </div>
          )}
        </div>

        {/* Dates */}
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50">
              {isLive ? 'Ends' : statusBadge.text === 'Coming Soon' ? 'Starts' : 'Ended'}
            </span>
            <span className="font-semibold text-white">
              {formatDate(isLive || statusBadge.text === 'Ended' ? event.endTime : event.startTime)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
