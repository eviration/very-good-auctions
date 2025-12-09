import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import { useAuth } from '../auth/useAuth'
import { loginRequest } from '../auth/authConfig'

type AuthMode = 'signin' | 'signup'

export default function LoginPage() {
  const { instance } = useMsal()
  const { isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<AuthMode>('signin')
  const [isRedirecting, setIsRedirecting] = useState(false)

  const returnUrl = searchParams.get('returnUrl') || '/'

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      navigate(returnUrl, { replace: true })
    }
  }, [isAuthenticated, isLoading, navigate, returnUrl])

  // Store return URL for after auth callback
  useEffect(() => {
    if (returnUrl && returnUrl !== '/') {
      sessionStorage.setItem('auth_return_url', returnUrl)
    }
  }, [returnUrl])

  const handleProviderLogin = async (domainHint?: string) => {
    setIsRedirecting(true)
    try {
      // For Microsoft Entra External ID (CIAM), use 'domain_hint' parameter
      // to go directly to a specific identity provider
      // See: https://learn.microsoft.com/en-us/entra/external-id/customers/concept-authentication-methods-customers
      const extraQueryParameters: Record<string, string> = {}

      if (domainHint) {
        // domain_hint tells Entra External ID to skip the IdP selection
        // and go directly to the specified provider
        // Values: 'Google', 'apple', 'facebook.com', etc.
        extraQueryParameters.domain_hint = domainHint
      }

      await instance.loginRedirect({
        ...loginRequest,
        extraQueryParameters,
        prompt: mode === 'signup' ? 'create' : undefined,
      })
    } catch (error) {
      console.error('Login failed:', error)
      setIsRedirecting(false)
    }
  }

  // Identity providers with their styling
  // The 'hint' values are domain_hint values for Entra External ID
  // See: https://learn.microsoft.com/en-us/entra/external-id/customers/concept-authentication-methods-customers
  const providers = [
    {
      id: 'google',
      name: 'Google',
      hint: 'Google',  // domain_hint for Google federation
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
      ),
      bgColor: 'bg-white hover:bg-gray-50',
      textColor: 'text-gray-700',
      borderColor: 'border-gray-300',
    },
    {
      id: 'apple',
      name: 'Apple',
      hint: 'apple',  // domain_hint for Apple (lowercase)
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
        </svg>
      ),
      bgColor: 'bg-black hover:bg-gray-900',
      textColor: 'text-white',
      borderColor: 'border-black',
    },
    {
      id: 'microsoft',
      name: 'Microsoft',
      hint: 'live.com',  // domain_hint for Microsoft personal accounts
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#F25022" d="M1 1h10v10H1z" />
          <path fill="#00A4EF" d="M1 13h10v10H1z" />
          <path fill="#7FBA00" d="M13 1h10v10H13z" />
          <path fill="#FFB900" d="M13 13h10v10H13z" />
        </svg>
      ),
      bgColor: 'bg-white hover:bg-gray-50',
      textColor: 'text-gray-700',
      borderColor: 'border-gray-300',
    },
    {
      id: 'facebook',
      name: 'Facebook',
      hint: 'facebook.com',  // domain_hint for Facebook
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#1877F2">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
      bgColor: 'bg-[#1877F2] hover:bg-[#166fe5]',
      textColor: 'text-white',
      borderColor: 'border-[#1877F2]',
    },
  ]

  if (isLoading) {
    return (
      <div className="min-h-screen bg-clay-bg flex items-center justify-center">
        <div className="clay-section p-8 text-center">
          <div className="w-12 h-12 border-4 border-clay-mint border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-charcoal-light font-medium">Loading...</p>
        </div>
      </div>
    )
  }

  if (isRedirecting) {
    return (
      <div className="min-h-screen bg-clay-bg flex items-center justify-center">
        <div className="clay-section p-8 text-center">
          <div className="w-12 h-12 border-4 border-clay-mint border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-charcoal-light font-medium">Redirecting to sign in...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-clay-bg flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <Link to="/" className="flex items-center justify-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-clay bg-clay-mint shadow-clay flex items-center justify-center">
            <svg
              className="w-8 h-8 text-charcoal"
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
            <h1 className="font-display text-2xl font-black text-charcoal leading-tight">
              Very Good
            </h1>
            <p className="text-sm text-charcoal-light font-bold uppercase tracking-wider">
              Auctions
            </p>
          </div>
        </Link>

        {/* Main Card */}
        <div className="clay-section p-8">
          {/* Mode Toggle */}
          <div className="flex rounded-clay bg-clay-bg p-1 mb-8">
            <button
              onClick={() => setMode('signin')}
              className={`flex-1 py-3 px-4 rounded-clay font-bold text-sm transition-all ${
                mode === 'signin'
                  ? 'bg-white shadow-clay text-charcoal'
                  : 'text-charcoal-light hover:text-charcoal'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 py-3 px-4 rounded-clay font-bold text-sm transition-all ${
                mode === 'signup'
                  ? 'bg-white shadow-clay text-charcoal'
                  : 'text-charcoal-light hover:text-charcoal'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="font-display text-2xl font-black text-charcoal mb-2">
              {mode === 'signin' ? 'Welcome back' : 'Get started'}
            </h2>
            <p className="text-charcoal-light">
              {mode === 'signin'
                ? 'Sign in to continue to Very Good Auctions'
                : 'Create an account to start bidding and hosting auctions'}
            </p>
          </div>

          {/* Provider Buttons */}
          <div className="space-y-3">
            {providers.map((provider) => (
              <button
                key={provider.id}
                onClick={() => handleProviderLogin(provider.hint)}
                className={`w-full flex items-center justify-center gap-3 px-4 py-3 rounded-clay border-2 font-semibold transition-all shadow-clay-sm hover:shadow-clay hover:-translate-y-0.5 ${provider.bgColor} ${provider.textColor} ${provider.borderColor}`}
              >
                {provider.icon}
                <span>
                  {mode === 'signin' ? 'Continue with' : 'Sign up with'} {provider.name}
                </span>
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4 my-8">
            <div className="flex-1 h-px bg-charcoal/10" />
            <span className="text-sm text-charcoal-light font-medium">or</span>
            <div className="flex-1 h-px bg-charcoal/10" />
          </div>

          {/* Email Option */}
          <button
            onClick={() => handleProviderLogin()}
            className="w-full clay-button bg-clay-mint hover:bg-clay-peach py-3 font-bold"
          >
            {mode === 'signin' ? 'Sign in with Email' : 'Sign up with Email'}
          </button>

          {/* Terms */}
          <p className="text-xs text-charcoal-light text-center mt-6">
            By continuing, you agree to our{' '}
            <Link to="/terms" className="text-charcoal hover:underline font-medium">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="text-charcoal hover:underline font-medium">
              Privacy Policy
            </Link>
          </p>
        </div>

        {/* Benefits */}
        <div className="mt-8 grid grid-cols-3 gap-4 text-center">
          <div className="clay-card p-4">
            <div className="w-10 h-10 rounded-clay bg-clay-mint shadow-clay-sm mx-auto mb-2 flex items-center justify-center">
              <svg className="w-5 h-5 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p className="text-xs font-bold text-charcoal">Secure</p>
          </div>
          <div className="clay-card p-4">
            <div className="w-10 h-10 rounded-clay bg-clay-butter shadow-clay-sm mx-auto mb-2 flex items-center justify-center">
              <svg className="w-5 h-5 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p className="text-xs font-bold text-charcoal">Fast</p>
          </div>
          <div className="clay-card p-4">
            <div className="w-10 h-10 rounded-clay bg-clay-peach shadow-clay-sm mx-auto mb-2 flex items-center justify-center">
              <svg className="w-5 h-5 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <p className="text-xs font-bold text-charcoal">Free</p>
          </div>
        </div>
      </div>
    </div>
  )
}
