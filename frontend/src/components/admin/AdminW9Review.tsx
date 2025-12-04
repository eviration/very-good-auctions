import { useState, useEffect } from 'react'
import { apiClient } from '../../services/api'

interface TaxSubmission {
  id: string
  userId?: string
  organizationId?: string
  taxFormType: string
  legalName: string
  businessName?: string
  taxClassification: string
  tinType: 'ssn' | 'ein'
  tinLastFour: string
  address: {
    line1?: string
    line2?: string
    city?: string
    state?: string
    postalCode?: string
    country: string
  }
  status: 'pending' | 'verified' | 'invalid' | 'expired'
  signatureName: string
  signatureDate: string
  verifiedAt?: string
  verifiedBy?: string
  createdAt: string
}

interface TaxStats {
  total: number
  pending: number
  verified: number
  invalid: number
  expired: number
}

export default function AdminW9Review() {
  const [submissions, setSubmissions] = useState<TaxSubmission[]>([])
  const [stats, setStats] = useState<TaxStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Selected submission for detail view
  const [selectedSubmission, setSelectedSubmission] = useState<TaxSubmission | null>(null)

  // Action modal
  const [showActionModal, setShowActionModal] = useState(false)
  const [actionType, setActionType] = useState<'verified' | 'invalid' | null>(null)
  const [actionNotes, setActionNotes] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    fetchData()
  }, [statusFilter, searchQuery])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [submissionsData, statsData] = await Promise.all([
        apiClient.getAdminTaxSubmissions({
          status: statusFilter !== 'all' ? (statusFilter as 'pending' | 'verified' | 'invalid' | 'expired') : undefined,
          search: searchQuery || undefined,
          limit: 50,
        }),
        apiClient.getAdminTaxStats(),
      ])

      setSubmissions(submissionsData.submissions)
      setStats(statsData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async () => {
    if (!selectedSubmission || !actionType) return

    setActionLoading(true)
    try {
      await apiClient.verifyTaxSubmission(selectedSubmission.id, actionType, actionNotes || undefined)
      await fetchData()
      setShowActionModal(false)
      setSelectedSubmission(null)
      setActionType(null)
      setActionNotes('')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActionLoading(false)
    }
  }

  const openActionModal = (submission: TaxSubmission, type: 'verified' | 'invalid') => {
    setSelectedSubmission(submission)
    setActionType(type)
    setActionNotes('')
    setShowActionModal(true)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const formatTaxClassification = (classification: string) => {
    const labels: Record<string, string> = {
      individual: 'Individual',
      sole_proprietor: 'Sole Proprietor',
      c_corp: 'C Corporation',
      s_corp: 'S Corporation',
      partnership: 'Partnership',
      trust_estate: 'Trust/Estate',
      llc_c: 'LLC (C Corp)',
      llc_s: 'LLC (S Corp)',
      llc_p: 'LLC (Partnership)',
      nonprofit: 'Nonprofit',
      other: 'Other',
    }
    return labels[classification] || classification
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      verified: 'bg-green-100 text-green-700',
      invalid: 'bg-red-100 text-red-700',
      expired: 'bg-gray-100 text-gray-700',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-charcoal">W-9 Submissions</h2>
          <p className="text-gray-500">Review and verify tax information</p>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <p className="text-2xl font-bold text-charcoal">{stats.total}</p>
            <p className="text-sm text-gray-500">Total</p>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4 shadow-sm border border-yellow-100">
            <p className="text-2xl font-bold text-yellow-700">{stats.pending}</p>
            <p className="text-sm text-yellow-600">Pending</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 shadow-sm border border-green-100">
            <p className="text-2xl font-bold text-green-700">{stats.verified}</p>
            <p className="text-sm text-green-600">Verified</p>
          </div>
          <div className="bg-red-50 rounded-lg p-4 shadow-sm border border-red-100">
            <p className="text-2xl font-bold text-red-700">{stats.invalid}</p>
            <p className="text-sm text-red-600">Invalid</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 shadow-sm border border-gray-200">
            <p className="text-2xl font-bold text-gray-700">{stats.expired}</p>
            <p className="text-sm text-gray-500">Expired</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or last 4 digits..."
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-sage focus:border-sage"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-sage focus:border-sage"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="invalid">Invalid</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
          Loading submissions...
        </div>
      ) : submissions.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
          No W-9 submissions found.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Classification
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  TIN
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Submitted
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {submissions.map((submission) => (
                <tr key={submission.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-charcoal">{submission.legalName}</div>
                    {submission.businessName && (
                      <div className="text-sm text-gray-500">{submission.businessName}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {formatTaxClassification(submission.taxClassification)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-600">
                      {submission.tinType.toUpperCase()}: ***-**-{submission.tinLastFour}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(submission.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(submission.createdAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setSelectedSubmission(submission)}
                        className="text-sage hover:text-sage/80 text-sm font-medium"
                      >
                        View
                      </button>
                      {submission.status === 'pending' && (
                        <>
                          <button
                            onClick={() => openActionModal(submission, 'verified')}
                            className="text-green-600 hover:text-green-700 text-sm font-medium"
                          >
                            Verify
                          </button>
                          <button
                            onClick={() => openActionModal(submission, 'invalid')}
                            className="text-red-600 hover:text-red-700 text-sm font-medium"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Slide-over */}
      {selectedSubmission && !showActionModal && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedSubmission(null)} />
          <div className="absolute inset-y-0 right-0 w-full max-w-lg bg-white shadow-xl">
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between p-6 border-b">
                <h3 className="text-lg font-semibold text-charcoal">W-9 Details</h3>
                <button
                  onClick={() => setSelectedSubmission(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-6">
                  {/* Status */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Status</span>
                    {getStatusBadge(selectedSubmission.status)}
                  </div>

                  {/* Legal Name */}
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Legal Name</label>
                    <p className="font-medium text-charcoal">{selectedSubmission.legalName}</p>
                  </div>

                  {/* Business Name */}
                  {selectedSubmission.businessName && (
                    <div>
                      <label className="block text-sm text-gray-500 mb-1">Business Name</label>
                      <p className="font-medium text-charcoal">{selectedSubmission.businessName}</p>
                    </div>
                  )}

                  {/* Tax Classification */}
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Tax Classification</label>
                    <p className="font-medium text-charcoal">
                      {formatTaxClassification(selectedSubmission.taxClassification)}
                    </p>
                  </div>

                  {/* TIN */}
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">
                      {selectedSubmission.tinType === 'ssn' ? 'Social Security Number' : 'Employer ID Number'}
                    </label>
                    <p className="font-medium text-charcoal font-mono">
                      ***-**-{selectedSubmission.tinLastFour}
                    </p>
                  </div>

                  {/* Address */}
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Address</label>
                    <p className="font-medium text-charcoal">
                      {selectedSubmission.address.line1}
                      {selectedSubmission.address.line2 && <><br />{selectedSubmission.address.line2}</>}
                      <br />
                      {selectedSubmission.address.city}, {selectedSubmission.address.state} {selectedSubmission.address.postalCode}
                      <br />
                      {selectedSubmission.address.country}
                    </p>
                  </div>

                  {/* Signature */}
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Electronic Signature</label>
                    <p className="font-medium text-charcoal italic">"{selectedSubmission.signatureName}"</p>
                    <p className="text-sm text-gray-500">Signed on {formatDate(selectedSubmission.signatureDate)}</p>
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-500 mb-1">Submitted</label>
                      <p className="font-medium text-charcoal">{formatDate(selectedSubmission.createdAt)}</p>
                    </div>
                    {selectedSubmission.verifiedAt && (
                      <div>
                        <label className="block text-sm text-gray-500 mb-1">Verified</label>
                        <p className="font-medium text-charcoal">{formatDate(selectedSubmission.verifiedAt)}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              {selectedSubmission.status === 'pending' && (
                <div className="p-6 border-t bg-gray-50">
                  <div className="flex gap-3">
                    <button
                      onClick={() => openActionModal(selectedSubmission, 'verified')}
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
                    >
                      Verify W-9
                    </button>
                    <button
                      onClick={() => openActionModal(selectedSubmission, 'invalid')}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Confirmation Modal */}
      {showActionModal && selectedSubmission && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowActionModal(false)} />
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-xl font-bold text-charcoal mb-4">
              {actionType === 'verified' ? 'Verify W-9' : 'Reject W-9'}
            </h3>
            <p className="text-gray-600 mb-4">
              {actionType === 'verified'
                ? `Confirm verification of W-9 for "${selectedSubmission.legalName}"`
                : `Reject W-9 submission for "${selectedSubmission.legalName}"`}
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes {actionType === 'invalid' ? '(required for rejection)' : '(optional)'}
              </label>
              <textarea
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                placeholder={actionType === 'verified' ? 'Any verification notes...' : 'Reason for rejection...'}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sage focus:border-sage"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowActionModal(false)}
                disabled={actionLoading}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleAction}
                disabled={actionLoading || (actionType === 'invalid' && !actionNotes.trim())}
                className={`px-4 py-2 rounded-lg font-medium disabled:opacity-50 ${
                  actionType === 'verified'
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                {actionLoading ? 'Processing...' : actionType === 'verified' ? 'Verify' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
