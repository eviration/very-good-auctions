import { useState, useEffect } from 'react'
import { apiClient } from '../../services/api'
import { useAuthStore } from '../../hooks/useAuthStore'

interface AdminUser {
  id: string
  email: string
  displayName: string
  isPlatformAdmin: boolean
  createdAt?: string
}

interface AuditLogEntry {
  id: string
  action: string
  targetUserId: string
  targetEmail: string
  performedByUserId: string
  performedByEmail: string
  reason: string | null
  createdAt: string
}

export default function AdminManageAdmins() {
  const { user } = useAuthStore()

  // Data
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Search for new admins
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<AdminUser[]>([])
  const [searching, setSearching] = useState(false)

  // Modal state
  const [showGrantModal, setShowGrantModal] = useState(false)
  const [showRevokeModal, setShowRevokeModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [actionReason, setActionReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // Active tab
  const [activeTab, setActiveTab] = useState<'admins' | 'audit'>('admins')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [adminsData, auditData] = await Promise.all([
        apiClient.getPlatformAdmins(),
        apiClient.getAdminAuditLog({ limit: 50 }),
      ])
      setAdmins(adminsData.admins)
      setAuditLog(auditData.entries)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  // Search for users
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([])
      return
    }

    const searchTimeout = setTimeout(async () => {
      setSearching(true)
      try {
        const result = await apiClient.searchUsers(searchQuery)
        // Filter out users who are already admins
        setSearchResults(result.users.filter(u => !u.isPlatformAdmin))
      } catch (err) {
        console.error('Search failed:', err)
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => clearTimeout(searchTimeout)
  }, [searchQuery])

  const handleGrantAdmin = async () => {
    if (!selectedUser) return

    setActionLoading(true)
    try {
      await apiClient.grantAdminAccess(selectedUser.id, actionReason || undefined)
      await fetchData()
      setShowGrantModal(false)
      setSelectedUser(null)
      setActionReason('')
      setSearchQuery('')
      setSearchResults([])
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to grant admin access')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRevokeAdmin = async () => {
    if (!selectedUser) return

    setActionLoading(true)
    try {
      await apiClient.revokeAdminAccess(selectedUser.id, actionReason || undefined)
      await fetchData()
      setShowRevokeModal(false)
      setSelectedUser(null)
      setActionReason('')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to revoke admin access')
    } finally {
      setActionLoading(false)
    }
  }

  const openGrantModal = (adminUser: AdminUser) => {
    setSelectedUser(adminUser)
    setActionReason('')
    setShowGrantModal(true)
  }

  const openRevokeModal = (adminUser: AdminUser) => {
    setSelectedUser(adminUser)
    setActionReason('')
    setShowRevokeModal(true)
  }

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48 mb-8"></div>
        <div className="h-64 bg-gray-200 rounded"></div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-charcoal">Manage Administrators</h2>
        <p className="text-gray-500">Control who has administrative access to the platform.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('admins')}
          className={`px-4 py-2 font-medium text-sm border-b-2 -mb-px transition-colors ${
            activeTab === 'admins'
              ? 'border-sage text-sage'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Administrators ({admins.length})
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2 font-medium text-sm border-b-2 -mb-px transition-colors ${
            activeTab === 'audit'
              ? 'border-sage text-sage'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Audit Log
        </button>
      </div>

      {activeTab === 'admins' && (
        <>
          {/* Add Admin Section */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="text-lg font-semibold text-charcoal mb-4">Add New Admin</h3>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by email or name..."
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-sage focus:border-sage"
              />
              {searching && (
                <div className="absolute right-3 top-2.5 text-gray-400">
                  Searching...
                </div>
              )}
            </div>

            {searchResults.length > 0 && (
              <div className="mt-2 border border-gray-200 rounded-lg divide-y">
                {searchResults.map((searchUser) => (
                  <div
                    key={searchUser.id}
                    className="flex items-center justify-between p-3 hover:bg-gray-50"
                  >
                    <div>
                      <div className="font-medium text-charcoal">
                        {searchUser.displayName || 'No name'}
                      </div>
                      <div className="text-sm text-gray-500">{searchUser.email}</div>
                    </div>
                    <button
                      onClick={() => openGrantModal(searchUser)}
                      className="px-3 py-1 bg-sage text-white rounded-lg text-sm font-medium hover:bg-sage/90"
                    >
                      Grant Admin
                    </button>
                  </div>
                ))}
              </div>
            )}

            {searchQuery.length >= 2 && searchResults.length === 0 && !searching && (
              <div className="mt-2 text-sm text-gray-500">
                No users found matching your search.
              </div>
            )}
          </div>

          {/* Current Admins */}
          <div className="bg-white rounded-lg shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-charcoal">Current Administrators</h3>
            </div>
            <div className="divide-y divide-gray-200">
              {admins.map((adminUser) => (
                <div
                  key={adminUser.id}
                  className="flex items-center justify-between p-4 hover:bg-gray-50"
                >
                  <div>
                    <div className="font-medium text-charcoal">
                      {adminUser.displayName || 'No name'}
                    </div>
                    <div className="text-sm text-gray-500">{adminUser.email}</div>
                    {adminUser.createdAt && (
                      <div className="text-xs text-gray-400">
                        Member since {new Date(adminUser.createdAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {adminUser.id === user?.id ? (
                      <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-sm">
                        You
                      </span>
                    ) : (
                      <button
                        onClick={() => openRevokeModal(adminUser)}
                        className="px-3 py-1 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100"
                      >
                        Revoke Access
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {activeTab === 'audit' && (
        <div className="bg-white rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-charcoal">Admin Access History</h3>
          </div>
          {auditLog.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No audit log entries yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {auditLog.map((entry) => (
                <div key={entry.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            entry.action === 'grant_admin'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {entry.action === 'grant_admin' ? 'Granted' : 'Revoked'}
                        </span>
                        <span className="text-charcoal font-medium">
                          {entry.targetEmail}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        By {entry.performedByEmail}
                      </div>
                      {entry.reason && (
                        <div className="text-sm text-gray-600 mt-1 italic">
                          Reason: {entry.reason}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(entry.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Grant Modal */}
      {showGrantModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-xl font-bold text-charcoal mb-4">Grant Admin Access</h3>
            <p className="text-gray-600 mb-4">
              You are about to grant platform admin access to:
            </p>
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <div className="font-medium">{selectedUser.displayName || 'No name'}</div>
              <div className="text-sm text-gray-500">{selectedUser.email}</div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason (optional)
              </label>
              <textarea
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="Why are you granting admin access?"
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowGrantModal(false)}
                disabled={actionLoading}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleGrantAdmin}
                disabled={actionLoading}
                className="px-4 py-2 bg-sage text-white rounded-lg font-medium hover:bg-sage/90 disabled:opacity-50"
              >
                {actionLoading ? 'Granting...' : 'Grant Access'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Modal */}
      {showRevokeModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-xl font-bold text-charcoal mb-4">Revoke Admin Access</h3>
            <p className="text-gray-600 mb-4">
              You are about to revoke platform admin access from:
            </p>
            <div className="bg-red-50 rounded-lg p-3 mb-4">
              <div className="font-medium">{selectedUser.displayName || 'No name'}</div>
              <div className="text-sm text-gray-500">{selectedUser.email}</div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason (optional)
              </label>
              <textarea
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="Why are you revoking admin access?"
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowRevokeModal(false)}
                disabled={actionLoading}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleRevokeAdmin}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading ? 'Revoking...' : 'Revoke Access'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
