import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '../services/api'
import type { Auction } from '../types'

export default function MyAuctionsPage() {
  const [auctions, setAuctions] = useState<Auction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchMyAuctions = async () => {
      try {
        setLoading(true)
        const data = await apiClient.getUserAuctions()
        setAuctions(data)
      } catch (err) {
        console.error('Failed to fetch auctions:', err)
        setError(err instanceof Error ? err.message : 'Failed to load auctions')
      } finally {
        setLoading(false)
      }
    }

    fetchMyAuctions()
  }, [])

  const formatTimeRemaining = (endTime: string) => {
    const end = new Date(endTime)
    const now = new Date()
    const diff = end.getTime() - now.getTime()

    if (diff <= 0) return 'Ended'

    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">Active</span>
      case 'ended':
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">Ended</span>
      case 'draft':
        return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">Draft</span>
      default:
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">{status}</span>
    }
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="font-display text-3xl font-bold text-charcoal">My Auctions</h1>
        </div>
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sage"></div>
          <span className="ml-3 text-gray-600">Loading your auctions...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="font-display text-3xl font-bold text-charcoal">My Auctions</h1>
        </div>
        <div className="text-center py-16 bg-red-50 rounded-2xl border border-red-200">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="font-display text-3xl font-bold text-charcoal">My Auctions</h1>
        <Link
          to="/auctions/create"
          className="px-6 py-3 bg-sage text-white font-semibold rounded-xl hover:bg-sage-dark transition-colors"
        >
          Create Auction
        </Link>
      </div>

      {auctions.length === 0 ? (
        <div className="text-center py-16 bg-warm-white rounded-2xl border border-gray-200">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <p className="text-xl text-gray-500 mb-2">No auctions yet</p>
          <p className="text-gray-400 mb-6">Create your first auction to start selling</p>
          <Link to="/auctions/create" className="inline-block px-6 py-3 bg-sage text-white font-semibold rounded-xl hover:bg-sage-dark transition-colors">
            Create Auction
          </Link>
        </div>
      ) : (
        <div className="grid gap-6">
          {auctions.map((auction) => (
            <Link
              key={auction.id}
              to={`/auctions/${auction.id}`}
              className="block bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
            >
              <div className="flex flex-col md:flex-row">
                {/* Image */}
                <div className="md:w-48 h-48 md:h-auto bg-gray-100 flex-shrink-0">
                  {auction.images && auction.images.length > 0 ? (
                    <img
                      src={auction.images[0].blobUrl}
                      alt={auction.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 p-6">
                  <div className="flex items-start justify-between mb-2">
                    <h2 className="text-xl font-semibold text-charcoal">{auction.title}</h2>
                    {getStatusBadge(auction.status)}
                  </div>

                  {auction.category && (
                    <p className="text-sm text-gray-500 mb-3">{auction.category.name}</p>
                  )}

                  <div className="flex flex-wrap gap-6 text-sm">
                    <div>
                      <p className="text-gray-500">Current Bid</p>
                      <p className="text-lg font-semibold text-charcoal">
                        ${auction.currentBid?.toFixed(2) || auction.startingPrice?.toFixed(2) || '0.00'}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Bids</p>
                      <p className="text-lg font-semibold text-charcoal">{auction.bidCount || 0}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Time Remaining</p>
                      <p className="text-lg font-semibold text-charcoal">
                        {formatTimeRemaining(auction.endTime)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
