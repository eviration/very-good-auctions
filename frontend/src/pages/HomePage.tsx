import { useState, useEffect } from 'react'
import { apiClient } from '../services/api'
import AuctionCard from '../components/AuctionCard'
import type { Auction, Category } from '../types'

export default function HomePage() {
  const [auctions, setAuctions] = useState<Auction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [auctionsRes, categoriesRes] = await Promise.all([
          apiClient.getAuctions({ status: 'active' }),
          apiClient.getCategories(),
        ])
        setAuctions(auctionsRes.data)
        setCategories(categoriesRes)
      } catch (error) {
        console.error('Failed to fetch data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [])

  const filteredAuctions = auctions.filter((auction) => {
    const matchesCategory =
      selectedCategory === 'all' || auction.category?.slug === selectedCategory
    const matchesSearch =
      !searchQuery ||
      auction.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      auction.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero Section */}
      <section className="text-center max-w-3xl mx-auto mb-12">
        <h1 className="font-display text-4xl md:text-5xl font-bold text-charcoal mb-4 leading-tight">
          Discover Treasures,
          <br />
          Bid with Confidence
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          A simple and trusted way to find unique items from collectors around
          the world.
        </p>

        {/* Search */}
        <div className="relative max-w-xl mx-auto">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <svg
              className="w-6 h-6 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search auctions..."
            className="w-full pl-12 pr-4 py-4 text-lg border-2 border-gray-200 rounded-2xl 
                       focus:border-sage focus:ring-0 transition-colors"
          />
        </div>
      </section>

      {/* Categories */}
      <section className="mb-10">
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-5 py-2.5 rounded-full font-medium transition-all ${
              selectedCategory === 'all'
                ? 'bg-sage text-white shadow-md'
                : 'bg-white text-charcoal shadow-sm hover:shadow-md'
            }`}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.slug)}
              className={`px-5 py-2.5 rounded-full font-medium transition-all ${
                selectedCategory === category.slug
                  ? 'bg-sage text-white shadow-md'
                  : 'bg-white text-charcoal shadow-sm hover:shadow-md'
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>
      </section>

      {/* Auctions Grid */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-2xl font-semibold text-charcoal">
            {selectedCategory === 'all'
              ? 'All Auctions'
              : categories.find((c) => c.slug === selectedCategory)?.name}
            <span className="text-lg font-normal text-gray-500 ml-2">
              ({filteredAuctions.length} items)
            </span>
          </h2>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="bg-gray-200 rounded-2xl aspect-[4/5] animate-pulse"
              />
            ))}
          </div>
        ) : filteredAuctions.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAuctions.map((auction, index) => (
              <div
                key={auction.id}
                className="animate-slide-up opacity-0"
                style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'forwards' }}
              >
                <AuctionCard auction={auction} />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <svg
              className="w-16 h-16 text-gray-300 mx-auto mb-4"
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
            <p className="text-xl text-gray-500">No auctions found</p>
            <p className="text-gray-400 mt-1">Try adjusting your search or filters</p>
          </div>
        )}
      </section>
    </div>
  )
}
