import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiClient } from '../services/api'
import { useAuth } from '../auth/useAuth'

export function UatInvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, user, login } = useAuth()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inviteData, setInviteData] = useState<{
    email: string
    name: string | null
    session: { name: string; description: string | null } | null
  } | null>(null)
  const [isAccepting, setIsAccepting] = useState(false)
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('Invalid invitation link')
      setLoading(false)
      return
    }
    validateInvitation()
  }, [token])

  const validateInvitation = async () => {
    try {
      const data = await apiClient.validateUatInvitation(token!)
      setInviteData(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid invitation'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleAcceptInvitation = async () => {
    if (!isAuthenticated || !user) {
      // Redirect to login, then back here
      login()
      return
    }

    setIsAccepting(true)
    setError(null)

    try {
      const result = await apiClient.acceptUatInvitation(token!, user.id, user.name || undefined)
      if (result.success) {
        setAccepted(true)
        // Redirect to welcome page after a brief delay
        setTimeout(() => {
          navigate(result.redirectTo || '/uat/welcome')
        }, 2000)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invitation')
    } finally {
      setIsAccepting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Validating invitation...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Invitation</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={() => navigate('/')}
              className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-md font-medium"
            >
              Go to Home
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (accepted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to UAT!</h1>
            <p className="text-gray-600">Redirecting you to the welcome page...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-blue-600 text-white px-8 py-6 text-center">
            <h1 className="text-2xl font-bold">UAT Invitation</h1>
            <p className="text-blue-100 mt-1">You've been invited to test Very Good Auctions</p>
          </div>

          {/* Content */}
          <div className="p-8">
            {inviteData && (
              <div className="space-y-6">
                <div>
                  <p className="text-sm text-gray-600">Invitation for</p>
                  <p className="text-lg font-medium text-gray-900">{inviteData.email}</p>
                </div>

                {inviteData.session && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600">Testing Session</p>
                    <p className="text-lg font-medium text-gray-900">{inviteData.session.name}</p>
                    {inviteData.session.description && (
                      <p className="text-sm text-gray-600 mt-2">{inviteData.session.description}</p>
                    )}
                  </div>
                )}

                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">What you'll be doing:</h3>
                  <ul className="space-y-2 text-gray-600">
                    <li className="flex items-start">
                      <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Test new features and functionality
                    </li>
                    <li className="flex items-start">
                      <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Report bugs and issues you find
                    </li>
                    <li className="flex items-start">
                      <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Provide feedback and suggestions
                    </li>
                    <li className="flex items-start">
                      <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Help improve the user experience
                    </li>
                  </ul>
                </div>

                {!isAuthenticated ? (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600 text-center">
                      To accept this invitation, please sign in or create an account.
                    </p>
                    <button
                      onClick={() => login()}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium"
                    >
                      Sign In to Accept
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm text-gray-600">Signed in as</p>
                      <p className="font-medium text-gray-900">{user?.email}</p>
                    </div>
                    <button
                      onClick={handleAcceptInvitation}
                      disabled={isAccepting}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium disabled:opacity-50"
                    >
                      {isAccepting ? 'Accepting...' : 'Accept Invitation'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
