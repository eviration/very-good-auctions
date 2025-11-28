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
      className="group bg-warm-white rounded-2xl overflow-hidden shadow-sm border border-gray-200 
                 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
    >
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden">
        {primaryImage ? (
          <img
            src={primaryImage.blobUrl}
            alt={auction.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-gray-200 flex items-center justify-center">
            <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {/* Time Badge */}
        <div
          className={`absolute top-3 right-3 px-3 py-1.5 rounded-full text-sm font-semibold 
                      flex items-center gap-1.5 backdrop-blur-sm ${
                        countdown.isExpired
                          ? 'bg-gray-800/90 text-white'
                          : countdown.isUrgent
                          ? 'bg-terracotta text-white'
                          : 'bg-charcoal/80 text-white'
                      }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {countdown.formatted}
        </div>

        {/* Category Badge */}
        {auction.category && (
          <div className="absolute bottom-3 left-3 px-3 py-1 bg-sage text-white text-sm font-medium rounded-full">
            {auction.category.name}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5">
        <h3 className="font-display text-xl font-semibold text-charcoal mb-2 line-clamp-1 group-hover:text-sage transition-colors">
          {auction.title}
        </h3>

        <p className="text-gray-600 text-sm line-clamp-2 mb-4 leading-relaxed">
          {auction.description}
        </p>

        <div className="flex items-end justify-between pt-3 border-t border-gray-100">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Current Bid</p>
            <p className="font-display text-2xl font-bold text-sage-dark">
              {formatCurrency(auction.currentBid || auction.startingPrice)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-charcoal font-medium">
              {auction.bidCount} bid{auction.bidCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>
    </Link>
  )
}
