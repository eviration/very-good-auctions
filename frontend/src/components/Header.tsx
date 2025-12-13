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
    <header className="glass-card sticky top-0 z-50 border-b border-white/10 rounded-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-glass bg-gradient-to-br from-purple-500/30 to-pink-500/30 border border-white/20 shadow-glass-sm flex items-center justify-center transition-all duration-200 group-hover:shadow-glass-glow group-hover:-translate-y-0.5 overflow-hidden">
              <img
                src="/gavel.png"
                alt="Gavel"
                className="w-8 h-8 object-contain brightness-0 invert"
              />
            </div>
            <div>
              <h1 className="font-display text-xl font-black text-white leading-tight">
                Very Good
              </h1>
              <p className="text-xs text-white/60 font-bold uppercase tracking-wider">
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
                className={`glass-badge text-base transition-all px-5 py-2.5 ${
                  isActive(link.path)
                    ? 'bg-gradient-to-r from-purple-500/40 to-pink-500/40 border-purple-400/50 shadow-glass-glow'
                    : 'hover:bg-white/10 hover:border-white/30'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* User Actions */}
          <div className="flex items-center gap-3">
            {isLoading ? (
              <div className="w-10 h-10 rounded-glass glass-card flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            ) : isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <NotificationBell />

                {/* Account Menu Dropdown */}
                <div className="relative" ref={accountMenuRef}>
                  <button
                    onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                    className={`flex items-center gap-2 glass-badge py-2 px-3 transition-all ${
                      accountMenuOpen ? 'bg-gradient-to-r from-purple-500/30 to-pink-500/30 border-purple-400/50' : 'hover:bg-white/10'
                    }`}
                  >
                    {user.picture ? (
                      <img
                        src={user.picture}
                        alt={user.name}
                        className="w-8 h-8 rounded-full border border-white/30 object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500/50 to-purple-500/50 border border-white/30 flex items-center justify-center text-white font-bold text-sm">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="font-semibold text-white hidden sm:inline">
                      {user.name}
                    </span>
                    <svg
                      className={`w-4 h-4 text-white/60 transition-transform ${accountMenuOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  {accountMenuOpen && (
                    <div className="absolute right-0 mt-3 w-64 p-3 z-50 rounded-glass-xl shadow-glass-lg border border-white/20 bg-[#1a1a2e]/95 backdrop-blur-xl">
                      {/* Profile link */}
                      <Link
                        to="/profile"
                        className="flex items-center gap-3 p-3 rounded-glass hover:bg-white/10 transition-colors"
                      >
                        {user.picture ? (
                          <img
                            src={user.picture}
                            alt={user.name}
                            className="w-12 h-12 rounded-glass border border-white/30 object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-glass bg-gradient-to-br from-pink-500/50 to-purple-500/50 border border-white/30 flex items-center justify-center text-white font-bold">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-white">{user.name}</p>
                          <p className="text-sm text-white/60 font-medium">View Profile</p>
                        </div>
                      </Link>

                      <div className="my-3 border-t border-white/10" />

                      {/* Menu Items */}
                      {accountMenuItems.map((item) => (
                        <Link
                          key={item.path}
                          to={item.path}
                          className={`block px-4 py-3 rounded-glass font-medium text-sm transition-all ${
                            isActive(item.path)
                              ? 'bg-gradient-to-r from-purple-500/30 to-pink-500/30 text-white border border-purple-400/30'
                              : 'text-white/80 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {item.label}
                        </Link>
                      ))}

                      <div className="my-3 border-t border-white/10" />

                      {/* Admin Link - only for admins */}
                      {isAdmin && (
                        <>
                          <Link
                            to="/admin"
                            className={`block px-4 py-3 rounded-glass font-medium text-sm transition-all ${
                              location.pathname.startsWith('/admin')
                                ? 'bg-gradient-to-r from-amber-500/30 to-orange-500/30 text-white border border-amber-400/30'
                                : 'text-white/80 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            Admin Dashboard
                          </Link>
                          <div className="my-3 border-t border-white/10" />
                        </>
                      )}

                      {/* Sign Out */}
                      <button
                        onClick={() => {
                          setAccountMenuOpen(false)
                          logout()
                        }}
                        className="w-full text-left px-4 py-3 rounded-glass font-medium text-sm text-rose-400 hover:bg-rose-500/10 transition-colors"
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
                  className="glass-badge px-5 py-2.5 hover:bg-white/10 transition-all"
                >
                  Sign In
                </button>
                <button
                  onClick={() => login()}
                  className="glass-button px-5 py-2.5"
                >
                  Sign Up
                </button>
              </div>
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden glass-badge p-3"
              aria-label="Toggle menu"
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <nav className="md:hidden py-4 border-t border-white/10">
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
                  className={`block glass-badge w-full text-left px-4 py-3 ${
                    isActive(link.path) ? 'bg-gradient-to-r from-purple-500/30 to-pink-500/30 border-purple-400/30' : ''
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {isAuthenticated && (
              <div className="mt-6 pt-4 border-t border-white/10">
                <p className="text-sm text-white/50 font-semibold uppercase tracking-wider mb-3 px-2">Account</p>
                <div className="space-y-2">
                  {accountMenuItems.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`block glass-badge w-full text-left px-4 py-3 ${
                        isActive(item.path) ? 'bg-gradient-to-r from-purple-500/30 to-pink-500/30 border-purple-400/30' : ''
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
                    className="block w-full text-left glass-badge px-4 py-3 text-rose-400 hover:bg-rose-500/10"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            )}

            {!isAuthenticated && (
              <div className="mt-6 space-y-3 pt-4 border-t border-white/10">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false)
                    login()
                  }}
                  className="block w-full glass-badge px-4 py-3 text-center"
                >
                  Sign In
                </button>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false)
                    login()
                  }}
                  className="block w-full glass-button px-4 py-3 text-center"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-section max-w-md w-full p-8 relative animate-scale-in">
            <button
              onClick={() => setShowLoginModal(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-glass glass-badge flex items-center justify-center transition-colors hover:bg-white/20"
              aria-label="Close"
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="text-center">
              <div className="w-16 h-16 rounded-glass bg-gradient-to-br from-purple-500/40 to-pink-500/40 border border-white/20 shadow-glass-glow mx-auto mb-6 flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>

              <h2 className="font-display text-2xl font-bold text-white mb-3">
                Sign in to create auctions
              </h2>
              <p className="text-white/60 mb-8">
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
                  className="block w-full glass-button font-semibold py-3 text-center"
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
                  className="block w-full glass-badge font-semibold py-3 text-center hover:bg-white/10"
                >
                  Create an Account
                </button>
              </div>

              <p className="text-sm text-white/50 mt-6">
                Free to sign up. No credit card required.
              </p>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
