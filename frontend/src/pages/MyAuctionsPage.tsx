import { Link } from 'react-router-dom'

export default function MyAuctionsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="font-display text-3xl font-bold text-charcoal">My Auctions</h1>
        <Link
          to="/auctions/create"
          className="px-6 py-3 bg-sage text-white font-semibold rounded-xl hover:bg-sage-dark transition-colors"
        >
          Create Auction
        </Link>
      </div>

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
    </div>
  )
}
