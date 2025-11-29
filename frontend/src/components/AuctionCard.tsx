import { Link } from 'react-router-dom'
import { useCountdown } from '../hooks/useCountdown'
import type { Auction } from '../types'

interface AuctionCardProps {
  auction: Auction
}

export default function AuctionCard({ auction }: AuctionCardProps) {
  const countdown = useCountdown(auction.endTime)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const primaryImage = auction.images?.find((img) => img.isPrimary) || auction.images?.[0]

  return (
    <Link
      to={`/auctions/${auction.id}`}
      className="group clay-card block overflow-hidden"
    >
      {/* Image Container */}
      <div className="relative aspect-[4/3] overflow-hidden rounded-t-clay-lg">
        {primaryImage ? (
          <img
            src={primaryImage.blobUrl}
            alt={auction.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-clay-mint/40 via-clay-peach/30 to-clay-lavender/40 flex items-center justify-center">
            <div className="w-16 h-16 bg-clay-surface rounded-full flex items-center justify-center shadow-clay-sm">
              <svg className="w-8 h-8 text-charcoal-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
        )}

        {/* Time Badge - Clay Style */}
        <div
          className={`absolute top-4 right-4 clay-badge ${
            countdown.isExpired
              ? 'bg-charcoal text-white'
              : countdown.isUrgent
              ? 'bg-clay-coral text-charcoal'
              : 'bg-clay-butter text-charcoal'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-bold">{countdown.formatted}</span>
        </div>

        {/* Category Badge - Clay Style */}
        {auction.category && (
          <div className="absolute bottom-4 left-4 clay-badge bg-clay-mint text-charcoal">
            {auction.category.name}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-6">
        <h3 className="font-display text-xl font-bold text-charcoal mb-2 line-clamp-1 group-hover:text-clay-coral transition-colors">
          {auction.title}
        </h3>

        <p className="text-charcoal-light text-sm line-clamp-2 mb-5 leading-relaxed font-medium">
          {auction.description}
        </p>

        {/* Price Section - Clay Divider */}
        <div className="flex items-end justify-between pt-4 border-t-2 border-clay-mint/30">
          <div>
            <p className="text-xs text-charcoal-light mb-1 font-semibold uppercase tracking-wide">Current Bid</p>
            <p className="font-display text-2xl font-black text-charcoal">
              {formatCurrency(auction.currentBid || auction.startingPrice)}
            </p>
          </div>
          <div className="clay-badge bg-clay-lavender">
            <span className="font-bold text-charcoal">
              {auction.bidCount} bid{auction.bidCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
