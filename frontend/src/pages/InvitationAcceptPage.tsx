import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import { apiClient } from '../services/api'
import type { OrganizationInvitation } from '../types'
import { loginRequest } from '../auth/authConfig'

export default function InvitationAcceptPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { instance, accounts, inProgress } = useMsal()
  const isAuthenticated = accounts.length > 0
  const isAuthInProgress = inProgress !== 'none'

  const [invitation, setInvitation] = useState<OrganizationInvitation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [declining, setDeclining] = useState(false)

  useEffect(() => {
    const fetchInvitation = async () => {
      if (!token) return

      try {
        setLoading(true)
        const data = await apiClient.getInvitation(token)
        setInvitation(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load invitation')
      } finally {
        setLoading(false)
      }
    }

    fetchInvitation()
  }, [token])

  const handleLogin = () => {
    // Store the invitation URL so we can return here after login
    sessionStorage.setItem('returnUrl', window.location.pathname)
    instance.loginRedirect(loginRequest)
  }

  const handleAccept = async () => {
    if (!token) return

    setAccepting(true)
    try {
      const result = await apiClient.acceptInvitation(token)
      navigate(`/organizations/${invitation?.organization?.slug || result.organization.id}/manage`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invitation')
    } finally {
      setAccepting(false)
    }
  }

  const handleDecline = async () => {
    if (!token) return
    if (!confirm('Are you sure you want to decline this invitation?')) return

    setDeclining(true)
    try {
      await apiClient.declineInvitation(token)
      navigate('/my-organizations')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decline invitation')
    } finally {
      setDeclining(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12">
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage"></div>
        </div>
      </div>
    )
  }

  if (error && !invitation) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-8 text-center">
          <div className="text-red-500 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Invitation Not Found</h1>
          <p className="text-gray-500 mb-6">
            This invitation may have expired or already been used.
          </p>
          <Link to="/" className="text-sage hover:underline">
            Go to Home
          </Link>
        </div>
      </div>
    )
  }

  if (!invitation) return null

  const isExpired = invitation.status === 'expired'
  const isAlreadyProcessed = ['accepted', 'declined'].includes(invitation.status)

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-8">
        {/* Organization Info */}
        <div className="text-center mb-8">
          {invitation.organization?.logoUrl ? (
            <img
              src={invitation.organization.logoUrl}
              alt={invitation.organization.name}
              className="w-20 h-20 rounded-lg object-cover mx-auto mb-4"
            />
          ) : (
            <div className="w-20 h-20 rounded-lg bg-sage/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl font-bold text-sage">
                {invitation.organization?.name.charAt(0)}
              </span>
            </div>
          )}
          <h1 className="text-xl font-bold text-white">
            {invitation.organization?.name}
          </h1>
        </div>

        {/* Invitation Details */}
        <div className="text-center mb-8">
          {isExpired ? (
            <>
              <div className="text-red-500 mb-2">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">Invitation Expired</h2>
              <p className="text-gray-500">
                This invitation has expired. Please contact the organization for a new invitation.
              </p>
            </>
          ) : isAlreadyProcessed ? (
            <>
              <h2 className="text-lg font-semibold text-white mb-2">
                Invitation {invitation.status === 'accepted' ? 'Accepted' : 'Declined'}
              </h2>
              <p className="text-gray-500">
                This invitation has already been {invitation.status}.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-white mb-2">
                You've been invited!
              </h2>
              <p className="text-gray-600">
                <span className="font-medium">{invitation.inviterName || 'Someone'}</span> has invited you
                to join <span className="font-medium">{invitation.organization?.name}</span> as
                a <span className="font-medium">{invitation.role}</span>.
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Invitation sent to: <span className="font-medium">{invitation.email}</span>
              </p>
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Actions */}
        {!isExpired && !isAlreadyProcessed && (
          <div className="space-y-4">
            {isAuthInProgress ? (
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sage mx-auto mb-2"></div>
                <p className="text-sm text-gray-500">Checking authentication...</p>
              </div>
            ) : !isAuthenticated ? (
              <div className="text-center">
                <p className="text-sm text-gray-500 mb-4">
                  Sign in to accept this invitation
                </p>
                <button
                  onClick={handleLogin}
                  className="w-full bg-sage text-white px-6 py-3 rounded-lg hover:bg-sage/90 transition-colors"
                >
                  Sign In
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={handleAccept}
                  disabled={accepting || declining}
                  className="w-full bg-sage text-white px-6 py-3 rounded-lg hover:bg-sage/90 transition-colors disabled:opacity-50"
                >
                  {accepting ? 'Accepting...' : 'Accept Invitation'}
                </button>
                <button
                  onClick={handleDecline}
                  disabled={accepting || declining}
                  className="w-full border border-sage/30 text-gray-600 px-6 py-3 rounded-lg hover:bg-sage/10 transition-colors disabled:opacity-50"
                >
                  {declining ? 'Declining...' : 'Decline'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Link to org */}
        <div className="mt-6 pt-6 border-t border-sage/20 text-center">
          <Link
            to={`/organizations/${invitation.organization?.slug}`}
            className="text-sage hover:underline"
          >
            View Organization
          </Link>
        </div>
      </div>
    </div>
  )
}
