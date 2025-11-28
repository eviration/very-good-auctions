import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function CreateAuctionPage() {
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    // TODO: Implement auction creation
    setTimeout(() => {
      navigate('/my-auctions')
    }, 1000)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl font-bold text-charcoal mb-8">
        Create New Auction
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-charcoal mb-2">Title</label>
          <input
            type="text"
            required
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
            placeholder="What are you selling?"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-charcoal mb-2">Description</label>
          <textarea
            required
            rows={4}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
            placeholder="Describe your item in detail..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">Starting Price</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                required
                min="1"
                className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
                placeholder="0"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">Duration</label>
            <select className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0">
              <option value="3">3 days</option>
              <option value="5">5 days</option>
              <option value="7" selected>7 days</option>
              <option value="10">10 days</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-charcoal mb-2">Images</label>
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
            <input type="file" multiple accept="image/*" className="hidden" id="images" />
            <label htmlFor="images" className="cursor-pointer">
              <svg className="w-12 h-12 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-600">Click to upload images</p>
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-4 bg-sage text-white font-semibold rounded-xl hover:bg-sage-dark 
                     disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? 'Creating...' : 'Create Auction'}
        </button>
      </form>
    </div>
  )
}
