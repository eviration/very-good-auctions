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
    <div className="min-h-screen bg-clay-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section - Chunky Clay Style */}
        <section className="clay-section mb-16 text-center relative overflow-hidden">
          {/* Decorative clay blobs */}
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-clay-peach rounded-full opacity-60 blur-sm" />
          <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-clay-mint rounded-full opacity-50 blur-sm" />
          <div className="absolute top-1/2 right-8 w-16 h-16 bg-clay-lavender rounded-full opacity-40 blur-sm" />

          <div className="relative z-10 max-w-3xl mx-auto">
            <h1 className="font-display text-5xl md:text-6xl font-black text-charcoal mb-6 leading-tight tracking-tight">
              Discover Treasures,
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-clay-coral via-clay-peach to-clay-butter">
                Bid with Joy
              </span>
            </h1>
            <p className="text-xl text-charcoal-light mb-10 font-medium max-w-xl mx-auto">
              A playful and trusted way to find unique items from collectors around
              the world.
            </p>

            {/* Search - Clay Input */}
            <div className="relative max-w-xl mx-auto">
              <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
                <svg
                  className="w-6 h-6 text-charcoal-light"
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
                placeholder="Search for treasures..."
                className="clay-input w-full pl-16 pr-6 py-5 text-lg font-medium placeholder:text-charcoal-light/50"
              />
            </div>
          </div>
        </section>

        {/* Categories - Clay Pill Buttons */}
        <section className="mb-12">
          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`clay-button font-bold text-base transition-all duration-200 ${
                selectedCategory === 'all'
                  ? 'bg-clay-mint shadow-clay scale-105'
                  : 'bg-clay-surface hover:bg-clay-butter'
              }`}
            >
              All Treasures
            </button>
            {categories.map((category, index) => {
              const colors = ['bg-clay-peach', 'bg-clay-lavender', 'bg-clay-butter', 'bg-clay-sky', 'bg-clay-coral']
              const colorClass = colors[index % colors.length]
              return (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.slug)}
                  className={`clay-button font-bold text-base transition-all duration-200 ${
                    selectedCategory === category.slug
                      ? `${colorClass} shadow-clay scale-105`
                      : 'bg-clay-surface hover:bg-clay-butter'
                  }`}
                >
                  {category.name}
                </button>
              )
            })}
          </div>
        </section>

        {/* Auctions Grid */}
        <section>
          <div className="flex items-center justify-between mb-8">
            <div className="clay-badge bg-clay-butter">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span className="font-black text-charcoal">
                {selectedCategory === 'all'
                  ? 'All Auctions'
                  : categories.find((c) => c.slug === selectedCategory)?.name}
              </span>
              <span className="text-charcoal-light">
                ({filteredAuctions.length})
              </span>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="clay-card aspect-[4/5] animate-pulse"
                >
                  <div className="h-full bg-gradient-to-br from-clay-mint/30 via-clay-peach/20 to-clay-lavender/30 rounded-clay-lg" />
                </div>
              ))}
            </div>
          ) : filteredAuctions.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
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
            <div className="clay-section text-center py-16">
              <div className="w-20 h-20 bg-clay-peach rounded-full flex items-center justify-center mx-auto mb-6 shadow-clay">
                <svg
                  className="w-10 h-10 text-charcoal"
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
              <p className="text-2xl font-bold text-charcoal mb-2">No treasures found</p>
              <p className="text-charcoal-light font-medium">Try adjusting your search or filters</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
