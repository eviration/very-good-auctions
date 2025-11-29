import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import { apiClient } from '../services/api'
import { loginRequest } from '../auth/authConfig'
import type { Organization, OrganizationType } from '../types'

const ORG_TYPE_LABELS: Record<OrganizationType, string> = {
  nonprofit: 'Nonprofit',
  school: 'School',
  religious: 'Religious',
  club: 'Club',
  company: 'Company',
  other: 'Other',
}

export default function OrganizationsPage() {
  const { instance, accounts } = useMsal()
  const navigate = useNavigate()
  const isAuthenticated = accounts.length > 0

  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [orgType, setOrgType] = useState<OrganizationType | ''>('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const handleCreateOrg = () => {
    if (isAuthenticated) {
      navigate('/organizations/new')
    } else {
      instance.loginRedirect(loginRequest)
    }
  }

  useEffect(() => {
    const fetchOrganizations = async () => {
      try {
        setLoading(true)
        const response = await apiClient.getOrganizations({
          page,
          pageSize: 12,
          search: search || undefined,
          orgType: orgType || undefined,
        })
        setOrganizations(response.data)
        setTotalPages(response.pagination.totalPages)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load organizations')
      } finally {
        setLoading(false)
      }
    }

    fetchOrganizations()
  }, [page, search, orgType])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1) // Reset to first page on new search
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-charcoal">Organizations</h1>
          <p className="text-gray-600 mt-1">
            Browse verified organizations running fundraiser auctions
          </p>
        </div>
        <button
          onClick={handleCreateOrg}
          className="bg-forest text-white px-6 py-2 rounded-lg hover:bg-forest/90 transition-colors"
        >
          Create Organization
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-4 mb-6">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search organizations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest/50"
            />
          </div>
          <div>
            <select
              value={orgType}
              onChange={(e) => {
                setOrgType(e.target.value as OrganizationType | '')
                setPage(1)
              }}
              className="px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest/50"
            >
              <option value="">All Types</option>
              {Object.entries(ORG_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="bg-forest text-white px-6 py-2 rounded-lg hover:bg-forest/90 transition-colors"
          >
            Search
          </button>
        </form>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-forest"></div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      ) : organizations.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No organizations found</p>
          <button
            onClick={handleCreateOrg}
            className="mt-4 inline-block text-forest hover:underline"
          >
            Create the first organization
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {organizations.map((org) => (
              <Link
                key={org.id}
                to={`/organizations/${org.slug}`}
                className="bg-white rounded-lg shadow-sm border border-sage/20 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-4">
                  {org.logoUrl ? (
                    <img
                      src={org.logoUrl}
                      alt={org.name}
                      className="w-16 h-16 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-sage/20 flex items-center justify-center">
                      <span className="text-2xl font-bold text-forest">
                        {org.name.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-charcoal truncate">
                        {org.name}
                      </h3>
                      {org.status === 'verified' && (
                        <span className="text-forest" title="Verified">
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-sage bg-sage/10 px-2 py-0.5 rounded-full">
                      {ORG_TYPE_LABELS[org.orgType]}
                    </span>
                  </div>
                </div>
                {org.description && (
                  <p className="mt-4 text-sm text-gray-600 line-clamp-2">
                    {org.description}
                  </p>
                )}
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-8">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border border-sage/30 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-sage/10"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 border border-sage/30 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-sage/10"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
