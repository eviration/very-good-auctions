import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { apiClient } from '../services/api'
import type { Organization, OrganizationType } from '../types'

const ORG_TYPE_LABELS: Record<OrganizationType, string> = {
  nonprofit: 'Nonprofit',
  school: 'School',
  religious: 'Religious Organization',
  club: 'Club',
  company: 'Company',
  other: 'Other',
}

export default function OrganizationDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchOrganization = async () => {
      if (!slug) return

      try {
        setLoading(true)
        const org = await apiClient.getOrganization(slug)
        setOrganization(org)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load organization')
      } finally {
        setLoading(false)
      }
    }

    fetchOrganization()
  }, [slug])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage"></div>
        </div>
      </div>
    )
  }

  if (error || !organization) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error || 'Organization not found'}
        </div>
        <Link to="/" className="mt-4 inline-block text-sage hover:underline">
          &larr; Back to Home
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link to="/" className="text-sage hover:underline">
        &larr; Back to Home
      </Link>

      {/* Header */}
      <div className="mt-6 bg-white rounded-lg shadow-sm border border-sage/20 p-6">
        <div className="flex items-start gap-6">
          {organization.logoUrl ? (
            <img
              src={organization.logoUrl}
              alt={organization.name}
              className="w-24 h-24 rounded-lg object-cover"
            />
          ) : (
            <div className="w-24 h-24 rounded-lg bg-sage/20 flex items-center justify-center">
              <span className="text-4xl font-bold text-sage">
                {organization.name.charAt(0)}
              </span>
            </div>
          )}

          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{organization.name}</h1>
              {organization.status === 'verified' && (
                <span className="text-sage flex items-center gap-1" title="Verified Organization">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-medium">Verified</span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mt-2">
              <span className="text-sm text-sage bg-sage/10 px-3 py-1 rounded-full">
                {ORG_TYPE_LABELS[organization.orgType]}
              </span>
              {organization.memberCount && (
                <span className="text-sm text-gray-500">
                  {organization.memberCount} member{organization.memberCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {organization.membership && (
              <div className="mt-4">
                <Link
                  to={`/organizations/${slug}/manage`}
                  className="inline-block bg-sage text-white px-4 py-2 rounded-lg hover:bg-sage/90 transition-colors"
                >
                  Manage Organization
                </Link>
              </div>
            )}
          </div>
        </div>

        {organization.description && (
          <div className="mt-6 pt-6 border-t border-sage/20">
            <p className="text-gray-700 whitespace-pre-wrap">{organization.description}</p>
          </div>
        )}

        {/* Contact & Links */}
        <div className="mt-6 pt-6 border-t border-sage/20 flex flex-wrap gap-6">
          {organization.websiteUrl && (
            <a
              href={organization.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sage hover:underline"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              Website
            </a>
          )}

          {organization.address && (
            <div className="flex items-start gap-2 text-gray-600">
              <svg className="w-5 h-5 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>
                {organization.address.city}, {organization.address.state}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Events Section - Placeholder for Sprint 7 */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold text-white mb-4">Upcoming Events</h2>
        <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-8 text-center">
          <p className="text-gray-500">No upcoming events</p>
          <p className="text-sm text-gray-400 mt-2">
            Check back soon for fundraiser auctions from this organization
          </p>
        </div>
      </div>
    </div>
  )
}
