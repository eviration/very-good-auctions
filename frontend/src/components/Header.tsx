import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useState, useRef, useEffect } from 'react'
import NotificationBell from './NotificationBell'
import { apiClient } from '../services/api'

export default function Header() {
  const { isAuthenticated, user, login, logout, isLoading } = useAuth()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)

  const isActive = (path: string) => location.pathname === path

  // Check admin status when user is authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      let cancelled = false

      // Retry with exponential backoff to handle race condition with token provider
      const checkAdminWithRetry = async (attempt = 0) => {
        if (cancelled) return

        try {
          const result = await apiClient.checkPlatformAdminStatus()
          if (!cancelled) {
            setIsAdmin(result.isPlatformAdmin)
          }
        } catch (error: unknown) {
          // Don't retry on 429 (rate limit) or 403 (forbidden) - these are final
          const apiError = error as { status?: number }
          if (apiError.status === 429 || apiError.status === 403) {
            if (!cancelled) {
              setIsAdmin(false)
            }
            return
          }
          // Retry up to 3 times with increasing delays (500ms, 1000ms, 2000ms)
          if (attempt < 3 && !cancelled) {
            const delay = 500 * Math.pow(2, attempt)
            setTimeout(() => checkAdminWithRetry(attempt + 1), delay)
          } else if (!cancelled) {
            setIsAdmin(false)
          }
        }
      }

      // Start checking after a brief initial delay to let token provider initialize
      const timeoutId = setTimeout(() => checkAdminWithRetry(0), 100)

      return () => {
        cancelled = true
        clearTimeout(timeoutId)
      }
    } else {
      setIsAdmin(false)
    }
  }, [isAuthenticated, user])

  // Main nav links - same for everyone
  const navLinks = [
    { path: '/', label: 'Browse Events' },
    { path: '/how-it-works', label: 'How It Works' },
    { path: '/events/create', label: 'Create Auction', requiresAuth: true },
  ]

  // Handle Create Auction click - show modal if not authenticated
  const handleCreateAuctionClick = (e: React.MouseEvent, requiresAuth?: boolean) => {
    if (requiresAuth && !isAuthenticated) {
      e.preventDefault()
      setShowLoginModal(true)
    }
  }

  // Account dropdown menu items
  const accountMenuItems = [
    { path: '/my-events', label: 'My Events' },
    { path: '/my-bids', label: 'My Bids' },
    { path: '/my-items', label: 'My Items' },
    { path: '/my-wins', label: 'My Wins' },
    { path: '/my-organizations', label: 'My Organizations' },
    { path: '/feedback', label: 'Send Feedback' },
  ]

  // Close account menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close account menu on route change
  useEffect(() => {
    setAccountMenuOpen(false)
  }, [location.pathname])

  return (
    <header className="bg-clay-surface border-b-2 border-white/60 sticky top-0 z-50 shadow-clay-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-clay bg-clay-mint shadow-clay-sm flex items-center justify-center transition-all duration-200 group-hover:shadow-clay group-hover:-translate-y-0.5">
              <svg
                className="w-7 h-7 text-charcoal"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <h1 className="font-display text-xl font-black text-charcoal leading-tight">
                Very Good
              </h1>
              <p className="text-xs text-charcoal-light font-bold uppercase tracking-wider">
                Auctions
              </p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-2">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={(e) => handleCreateAuctionClick(e, link.requiresAuth)}
                className={`clay-button text-base transition-all ${
                  isActive(link.path)
                    ? 'bg-clay-mint shadow-clay scale-105'
                    : 'bg-clay-surface hover:bg-clay-butter'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* User Actions */}
          <div className="flex items-center gap-3">
            {isLoading ? (
              <div className="w-10 h-10 rounded-clay bg-clay-mint shadow-clay-pressed flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-charcoal border-t-transparent rounded-full animate-spin" />
              </div>
            ) : isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <NotificationBell />

                {/* Account Menu Dropdown */}
                <div className="relative" ref={accountMenuRef}>
                  <button
                    onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                    className={`flex items-center gap-2 clay-button py-2 transition-all ${
                      accountMenuOpen ? 'bg-clay-mint shadow-clay' : 'bg-clay-surface hover:bg-clay-butter'
                    }`}
                  >
                    {user.picture ? (
                      <img
                        src={user.picture}
                        alt={user.name}
                        className="w-8 h-8 rounded-clay-pill shadow-clay-sm object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-clay-pill bg-clay-peach shadow-clay-sm flex items-center justify-center text-charcoal font-black text-sm">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="font-bold text-charcoal hidden sm:inline">
                      {user.name}
                    </span>
                    <svg
                      className={`w-4 h-4 text-charcoal-light transition-transform ${accountMenuOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  {accountMenuOpen && (
                    <div className="absolute right-0 mt-3 w-64 clay-section p-3 z-50">
                      {/* Profile link */}
                      <Link
                        to="/profile"
                        className="flex items-center gap-3 p-3 rounded-clay hover:bg-clay-mint/30 transition-colors"
                      >
                        {user.picture ? (
                          <img
                            src={user.picture}
                            alt={user.name}
                            className="w-12 h-12 rounded-clay shadow-clay-sm object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-clay bg-clay-peach shadow-clay-sm flex items-center justify-center text-charcoal font-black">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-charcoal">{user.name}</p>
                          <p className="text-sm text-charcoal-light font-medium">View Profile</p>
                        </div>
                      </Link>

                      <div className="my-3 border-t-2 border-white/60" />

                      {/* Menu Items */}
                      {accountMenuItems.map((item) => (
                        <Link
                          key={item.path}
                          to={item.path}
                          className={`block px-4 py-3 rounded-clay font-bold text-sm transition-all ${
                            isActive(item.path)
                              ? 'bg-clay-mint shadow-clay-sm text-charcoal'
                              : 'text-charcoal hover:bg-clay-butter/50'
                          }`}
                        >
                          {item.label}
                        </Link>
                      ))}

                      <div className="my-3 border-t-2 border-white/60" />

                      {/* Admin Link - only for admins */}
                      {isAdmin && (
                        <>
                          <Link
                            to="/admin"
                            className={`block px-4 py-3 rounded-clay font-bold text-sm transition-all ${
                              location.pathname.startsWith('/admin')
                                ? 'bg-clay-butter shadow-clay-sm text-charcoal'
                                : 'text-charcoal hover:bg-clay-butter/50'
                            }`}
                          >
                            Admin Dashboard
                          </Link>
                          <div className="my-3 border-t-2 border-white/60" />
                        </>
                      )}

                      {/* Sign Out */}
                      <button
                        onClick={() => {
                          setAccountMenuOpen(false)
                          logout()
                        }}
                        className="w-full text-left px-4 py-3 rounded-clay font-bold text-sm text-clay-coral hover:bg-clay-coral/10 transition-colors"
                      >
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => login()}
                  className="clay-button bg-clay-surface hover:bg-clay-butter"
                >
                  Sign In
                </button>
                <button
                  onClick={() => login()}
                  className="clay-button bg-clay-mint hover:bg-clay-peach"
                >
                  Sign Up
                </button>
              </div>
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden clay-button p-3 bg-clay-surface"
              aria-label="Toggle menu"
            >
              <svg className="w-6 h-6 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden py-4 border-t-2 border-white/60">
            <div className="space-y-2">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={(e) => {
                    if (link.requiresAuth && !isAuthenticated) {
                      e.preventDefault()
                      setMobileMenuOpen(false)
                      setShowLoginModal(true)
                    } else {
                      setMobileMenuOpen(false)
                    }
                  }}
                  className={`block clay-button w-full text-left ${
                    isActive(link.path) ? 'bg-clay-mint shadow-clay' : 'bg-clay-surface'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {isAuthenticated && (
              <div className="mt-6 pt-4 border-t-2 border-white/60">
                <p className="text-sm text-charcoal-light font-bold uppercase tracking-wider mb-3 px-2">Account</p>
                <div className="space-y-2">
                  {accountMenuItems.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`block clay-button w-full text-left ${
                        isActive(item.path) ? 'bg-clay-mint shadow-clay' : 'bg-clay-surface'
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                  <button
                    onClick={() => {
                      logout()
                      setMobileMenuOpen(false)
                    }}
                    className="block w-full text-left clay-button bg-clay-coral/20 text-clay-coral hover:bg-clay-coral/30"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            )}

            {!isAuthenticated && (
              <div className="mt-6 space-y-3 pt-4 border-t-2 border-white/60">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false)
                    login()
                  }}
                  className="block w-full clay-button bg-clay-surface text-center"
                >
                  Sign In
                </button>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false)
                    login()
                  }}
                  className="block w-full clay-button bg-clay-mint text-center"
                >
                  Sign Up
                </button>
              </div>
            )}
          </nav>
        )}
      </div>

      {/* Login Required Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="clay-section max-w-md w-full p-8 relative animate-scale-in">
            <button
              onClick={() => setShowLoginModal(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-clay bg-clay-surface hover:bg-clay-butter shadow-clay-sm flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <svg className="w-4 h-4 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="text-center">
              <div className="w-16 h-16 rounded-clay bg-clay-mint shadow-clay mx-auto mb-6 flex items-center justify-center">
                <svg className="w-8 h-8 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>

              <h2 className="font-display text-2xl font-black text-charcoal mb-3">
                Sign in to create auctions
              </h2>
              <p className="text-charcoal-light mb-8">
                You'll need an account to create and manage auctions. It only takes a moment to get started.
              </p>

              <div className="space-y-3">
                <button
                  onClick={() => {
                    setShowLoginModal(false)
                    // Store return URL for after auth
                    sessionStorage.setItem('auth_return_url', '/events/create')
                    login()
                  }}
                  className="block w-full clay-button bg-clay-mint hover:bg-clay-peach font-bold py-3 text-center"
                >
                  Sign In
                </button>
                <button
                  onClick={() => {
                    setShowLoginModal(false)
                    // Store return URL for after auth
                    sessionStorage.setItem('auth_return_url', '/events/create')
                    login()
                  }}
                  className="block w-full clay-button bg-clay-surface hover:bg-clay-butter font-bold py-3 text-center"
                >
                  Create an Account
                </button>
              </div>

              <p className="text-sm text-charcoal-light mt-6">
                Free to sign up. No credit card required.
              </p>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
