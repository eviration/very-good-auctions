import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '../services/api'
import type { Organization } from '../types'

const roleLabels: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
}

const roleColors: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-800',
  admin: 'bg-blue-100 text-blue-800',
  member: 'bg-gray-100 text-gray-800',
}

const orgTypeLabels: Record<string, string> = {
  nonprofit: 'Nonprofit',
  school: 'School',
  charity: 'Charity',
  community: 'Community',
  other: 'Other',
}

export default function MyOrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchOrganizations = async () => {
      try {
        setLoading(true)
        const data = await apiClient.getMyOrganizations()
        setOrganizations(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load organizations')
      } finally {
        setLoading(false)
      }
    }

    fetchOrganizations()
  }, [])

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-charcoal">My Organizations</h1>
          <p className="text-gray-500 mt-1">Organizations you're a member of</p>
        </div>
        <Link
          to="/organizations/new"
          className="bg-sage text-white px-6 py-3 rounded-xl font-semibold hover:bg-sage/90 transition-colors inline-flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Organization
        </Link>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600">
          {error}
        </div>
      )}

      {organizations.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-sage/20">
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
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
          <h2 className="text-xl font-semibold text-charcoal mb-2">No organizations yet</h2>
          <p className="text-gray-500 mb-6">
            Create an organization to host auction events, or join one through an invitation
          </p>
          <Link
            to="/organizations/new"
            className="inline-block bg-sage text-white px-6 py-3 rounded-xl font-semibold hover:bg-sage/90"
          >
            Create Your First Organization
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {organizations.map((org) => (
            <div
              key={org.id}
              className="bg-white rounded-xl border border-sage/20 overflow-hidden hover:shadow-lg transition-shadow"
            >
              {/* Organization Header */}
              <div className="p-6">
                <div className="flex items-start gap-4">
                  {/* Logo */}
                  {org.logoUrl ? (
                    <img
                      src={org.logoUrl}
                      alt={org.name}
                      className="w-16 h-16 object-cover rounded-xl flex-shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-sage/10 rounded-xl flex items-center justify-center flex-shrink-0">
                      <svg
                        className="w-8 h-8 text-sage"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                        />
                      </svg>
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-lg text-charcoal">{org.name}</h3>
                      {org.userRole && (
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${roleColors[org.userRole]}`}>
                          {roleLabels[org.userRole] || org.userRole}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {orgTypeLabels[org.orgType] || org.orgType}
                    </p>
                    {org.description && (
                      <p className="text-sm text-gray-600 mt-2 line-clamp-2">{org.description}</p>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex gap-6 mt-4 pt-4 border-t border-gray-100">
                  <div>
                    <p className="text-sm text-gray-500">Members</p>
                    <p className="font-semibold text-charcoal">{org.memberCount || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Events</p>
                    <p className="font-semibold text-charcoal">{org.eventCount || 0}</p>
                  </div>
                  {org.totalRaised !== undefined && org.totalRaised > 0 && (
                    <div>
                      <p className="text-sm text-gray-500">Total Raised</p>
                      <p className="font-semibold text-sage">${org.totalRaised.toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3">
                <Link
                  to={`/organizations/${org.slug}`}
                  className="flex-1 text-center py-2 px-4 text-sage font-medium border border-sage rounded-lg hover:bg-sage/10 transition-colors"
                >
                  View Profile
                </Link>
                {(org.userRole === 'owner' || org.userRole === 'admin') && (
                  <Link
                    to={`/organizations/${org.slug}/manage`}
                    className="flex-1 text-center py-2 px-4 bg-sage text-white font-medium rounded-lg hover:bg-sage/90 transition-colors"
                  >
                    Manage
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
