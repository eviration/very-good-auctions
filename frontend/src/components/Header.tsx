import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useState } from 'react'

export default function Header() {
  const { isAuthenticated, user, login, logout, isLoading } = useAuth()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const isActive = (path: string) => location.pathname === path

  const navLinks = [
    { path: '/', label: 'Browse Auctions' },
    { path: '/how-it-works', label: 'How It Works' },
    ...(isAuthenticated
      ? [
          { path: '/my-events', label: 'My Events' },
          { path: '/my-bids', label: 'My Bids' },
          { path: '/my-auctions', label: 'My Auctions' },
        ]
      : []),
  ]

  return (
    <header className="bg-warm-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-sage flex items-center justify-center">
              <svg
                className="w-7 h-7 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-charcoal leading-tight">
                Very Good
              </h1>
              <p className="text-xs text-gray-500 uppercase tracking-wider">
                Auctions
              </p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`text-lg font-medium transition-colors ${
                  isActive(link.path)
                    ? 'text-sage border-b-2 border-sage pb-1'
                    : 'text-charcoal hover:text-sage'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* User Actions */}
          <div className="flex items-center gap-4">
            {isLoading ? (
              <div className="w-8 h-8 border-2 border-sage border-t-transparent rounded-full animate-spin" />
            ) : isAuthenticated && user ? (
              <div className="flex items-center gap-4">
                <Link
                  to="/profile"
                  className="flex items-center gap-2 px-3 py-2 bg-cream rounded-full border border-gray-200 hover:border-sage transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-sage flex items-center justify-center text-white font-semibold">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium text-charcoal hidden sm:inline">
                    {user.name}
                  </span>
                </Link>
                <button
                  onClick={() => logout()}
                  className="px-4 py-2 text-sage font-medium border-2 border-sage rounded-xl hover:bg-sage hover:text-white transition-colors"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => login()}
                  className="px-4 py-2 text-sage font-medium border-2 border-sage rounded-xl hover:bg-sage hover:text-white transition-colors"
                >
                  Sign In
                </button>
                <button
                  onClick={() => login()}
                  className="px-6 py-3 bg-sage text-white font-semibold rounded-xl hover:bg-sage-dark transition-colors shadow-md"
                >
                  Sign Up
                </button>
              </div>
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-charcoal"
              aria-label="Toggle menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden py-4 border-t border-gray-200">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`block py-3 text-lg font-medium ${
                  isActive(link.path) ? 'text-sage' : 'text-charcoal'
                }`}
              >
                {link.label}
              </Link>
            ))}
            {!isAuthenticated && (
              <div className="mt-4 space-y-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    login()
                    setMobileMenuOpen(false)
                  }}
                  className="w-full px-4 py-3 text-sage font-medium border-2 border-sage rounded-xl hover:bg-sage hover:text-white transition-colors"
                >
                  Sign In
                </button>
                <button
                  onClick={() => {
                    login()
                    setMobileMenuOpen(false)
                  }}
                  className="w-full px-4 py-3 bg-sage text-white font-semibold rounded-xl hover:bg-sage-dark transition-colors shadow-md"
                >
                  Sign Up
                </button>
              </div>
            )}
          </nav>
        )}
      </div>
    </header>
  )
}
