import { ReactNode } from 'react'
import { useIsAuthenticated, useMsal } from '@azure/msal-react'
import { useLocation } from 'react-router-dom'
import { loginRequest } from './authConfig'

interface ProtectedRouteProps {
  children: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isAuthenticated = useIsAuthenticated()
  const { instance, inProgress } = useMsal()
  const location = useLocation()

  if (inProgress !== 'none') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-sage border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-lg text-white">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    // Store the current URL to redirect back after login
    sessionStorage.setItem('returnUrl', location.pathname + location.search)
    
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <h2 className="font-display text-2xl font-bold text-white mb-4">
            Sign In Required
          </h2>
          <p className="text-gray-600 mb-6">
            Please sign in to access this page.
          </p>
          <button
            onClick={() => instance.loginRedirect(loginRequest)}
            className="bg-sage hover:bg-sage-dark text-white font-semibold px-8 py-3 rounded-xl transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
