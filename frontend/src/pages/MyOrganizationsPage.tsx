import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '../services/api'
import type { Organization } from '../types'

const roleConfig: Record<string, { label: string; color: string }> = {
  owner: { label: 'Owner', color: 'bg-clay-lavender' },
  admin: { label: 'Admin', color: 'bg-clay-sky' },
  member: { label: 'Member', color: 'bg-clay-butter' },
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
      <div className="min-h-screen bg-clay-bg">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="flex justify-center py-16">
            <div className="w-16 h-16 rounded-clay bg-clay-mint shadow-clay-pressed flex items-center justify-center">
              <div className="w-8 h-8 border-3 border-charcoal border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-clay-bg">
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="clay-section mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-black text-charcoal mb-2">My Organizations</h1>
            <p className="text-charcoal-light font-medium">Organizations you're a member of</p>
          </div>
          <Link
            to="/organizations/new"
            className="clay-button bg-clay-mint font-bold inline-flex items-center gap-2 self-start"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Create Organization
          </Link>
        </div>

        {error && (
          <div className="clay-section mb-8 bg-clay-coral/20 border-clay-coral/40">
            <p className="text-clay-coral font-bold">{error}</p>
          </div>
        )}

        {organizations.length === 0 ? (
          <div className="clay-section text-center py-16">
            <div className="w-20 h-20 bg-clay-lavender rounded-clay flex items-center justify-center mx-auto mb-6 shadow-clay">
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
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-charcoal mb-2">No organizations yet</h2>
            <p className="text-charcoal-light font-medium mb-8">
              Create an organization to host auction events, or join one through an invitation
            </p>
            <Link
              to="/organizations/new"
              className="clay-button bg-clay-mint font-bold inline-flex items-center gap-2"
            >
              Create Your First Organization
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {organizations.map((org) => (
              <div
                key={org.id}
                className="clay-card overflow-hidden"
              >
                {/* Organization Header */}
                <div className="p-6">
                  <div className="flex items-start gap-4">
                    {/* Logo */}
                    {org.logoUrl ? (
                      <img
                        src={org.logoUrl}
                        alt={org.name}
                        className="w-16 h-16 object-cover rounded-clay shadow-clay-sm flex-shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-clay-lavender/30 rounded-clay shadow-clay-sm flex items-center justify-center flex-shrink-0">
                        <svg
                          className="w-8 h-8 text-charcoal-light"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                          />
                        </svg>
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-black text-lg text-charcoal">{org.name}</h3>
                        {org.userRole && (
                          <span className={`clay-badge text-xs ${roleConfig[org.userRole]?.color || 'bg-clay-butter'}`}>
                            {roleConfig[org.userRole]?.label || org.userRole}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-charcoal-light font-medium mt-1">
                        {orgTypeLabels[org.orgType] || org.orgType}
                      </p>
                      {org.description && (
                        <p className="text-sm text-charcoal-light mt-2 line-clamp-2">{org.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex gap-6 mt-5 pt-5 border-t-2 border-white/60">
                    <div className="clay-badge bg-clay-butter/50">
                      <span className="font-black text-charcoal">{org.memberCount || 0}</span>
                      <span className="text-charcoal-light font-medium">Members</span>
                    </div>
                    <div className="clay-badge bg-clay-sky/50">
                      <span className="font-black text-charcoal">{org.eventCount || 0}</span>
                      <span className="text-charcoal-light font-medium">Events</span>
                    </div>
                    {org.totalRaised !== undefined && org.totalRaised > 0 && (
                      <div className="clay-badge bg-clay-mint/50">
                        <span className="font-black text-charcoal">${org.totalRaised.toLocaleString()}</span>
                        <span className="text-charcoal-light font-medium">Raised</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="px-6 py-4 bg-clay-butter/20 border-t-2 border-white/60 flex gap-3">
                  <Link
                    to={`/organizations/${org.slug}`}
                    className="flex-1 text-center clay-button bg-clay-surface text-sm"
                  >
                    View Profile
                  </Link>
                  {(org.userRole === 'owner' || org.userRole === 'admin') && (
                    <Link
                      to={`/organizations/${org.slug}/manage`}
                      className="flex-1 text-center clay-button bg-clay-mint text-sm"
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
    </div>
  )
}
