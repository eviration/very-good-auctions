import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '../services/api'
import type { Bid } from '../types'

export default function MyBidsPage() {
  const [bids, setBids] = useState<Bid[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchBids = async () => {
      try {
        const data = await apiClient.getUserBids()
        setBids(data)
      } catch (error) {
        console.error('Failed to fetch bids:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchBids()
  }, [])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-sage border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl font-bold text-charcoal mb-8">My Bids</h1>

      {bids.length === 0 ? (
        <div className="text-center py-16 bg-warm-white rounded-2xl border border-gray-200">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xl text-gray-500 mb-2">No bids yet</p>
          <p className="text-gray-400 mb-6">Start bidding on auctions to see them here</p>
          <Link to="/" className="inline-block px-6 py-3 bg-sage text-white font-semibold rounded-xl hover:bg-sage-dark transition-colors">
            Browse Auctions
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {bids.map((bid) => (
            <Link
              key={bid.id}
              to={`/auctions/${bid.auctionId}`}
              className="block bg-warm-white rounded-xl p-6 border border-gray-200 hover:border-sage transition-colors"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-display text-lg font-semibold text-charcoal">
                    {bid.auction?.title || 'Auction'}
                  </h3>
                  <p className="text-gray-500 text-sm">
                    Bid placed on {new Date(bid.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-2xl font-bold text-sage-dark">
                    {formatCurrency(bid.amount)}
                  </p>
                  <span className={`text-sm font-medium ${bid.isWinning ? 'text-green-600' : 'text-gray-500'}`}>
                    {bid.isWinning ? 'Winning' : 'Outbid'}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
