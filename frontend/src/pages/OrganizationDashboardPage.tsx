import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { apiClient } from '../services/api'
import type { Organization, OrganizationMember, OrganizationInvitation, UpdateOrganizationRequest } from '../types'
import ImageDropZone from '../components/ImageDropZone'

export default function OrganizationDashboardPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  const [organization, setOrganization] = useState<Organization | null>(null)
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'settings'>('overview')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member')
  const [inviting, setInviting] = useState(false)

  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState<UpdateOrganizationRequest>({})
  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Logo upload state
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Stripe Connect state
  const [stripeLoading, setStripeLoading] = useState(false)

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletionSummary, setDeletionSummary] = useState<{
    canDelete: boolean
    blockers: string[]
    organization: { name: string; createdAt: string; hasStripeAccount: boolean }
    willDelete: { events: number; items: number; members: number }
    financial: { totalRaised: number; totalPaidOut: number; completedPayouts: number }
  } | null>(null)
  const [loadingDeletionSummary, setLoadingDeletionSummary] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      if (!slug) return

      try {
        setLoading(true)
        const org = await apiClient.getOrganization(slug)

        // Check if user is a member
        if (!org.membership) {
          navigate(`/organizations/${slug}`)
          return
        }

        setOrganization(org)

        // Fetch members if user can view them
        if (org.membership.canManageMembers || org.membership.role === 'owner') {
          const [membersData, invitationsData] = await Promise.all([
            apiClient.getOrganizationMembers(org.id),
            apiClient.getOrganizationInvitations(org.id),
          ])
          setMembers(membersData)
          setInvitations(invitationsData)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load organization')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [slug, navigate])

  const handleStripeConnect = async () => {
    if (!organization) return
    setStripeLoading(true)
    try {
      const { url } = await apiClient.startStripeConnect(organization.id)
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Stripe setup')
      setStripeLoading(false)
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!organization) return

    const emailToInvite = inviteEmail
    setInviting(true)
    try {
      await apiClient.sendOrganizationInvitation(organization.id, {
        email: emailToInvite,
        role: inviteRole,
      })
      // Refresh invitations
      const invitationsData = await apiClient.getOrganizationInvitations(organization.id)
      setInvitations(invitationsData)
      setShowInviteModal(false)
      setInviteEmail('')
      setInviteRole('member')
      // Show success message
      setSuccessMessage(`Invitation email sent to ${emailToInvite}`)
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send invitation')
    } finally {
      setInviting(false)
    }
  }

  const handleCancelInvitation = async (invitationId: string) => {
    if (!organization) return
    if (!confirm('Cancel this invitation?')) return

    try {
      await apiClient.cancelOrganizationInvitation(organization.id, invitationId)
      setInvitations((prev) => prev.filter((i) => i.id !== invitationId))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel invitation')
    }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!organization) return
    if (!confirm('Remove this member from the organization?')) return

    try {
      await apiClient.removeOrganizationMember(organization.id, userId)
      setMembers((prev) => prev.filter((m) => m.userId !== userId))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove member')
    }
  }

  const handleSaveSettings = async () => {
    if (!organization) return

    setSaving(true)
    try {
      await apiClient.updateOrganization(organization.id, editData)
      // Refresh org data
      const org = await apiClient.getOrganization(slug!)
      setOrganization(org)
      setEditMode(false)
      setEditData({})
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  const handleLogoSelect = (file: File) => {
    setLogoFile(file)
    if (logoPreview) {
      URL.revokeObjectURL(logoPreview)
    }
    setLogoPreview(URL.createObjectURL(file))
  }

  const handleLogoUpload = async () => {
    if (!organization || !logoFile) return

    setUploadingLogo(true)
    try {
      await apiClient.uploadOrganizationLogo(organization.id, logoFile)
      // Refresh org data to get new logo URL
      const org = await apiClient.getOrganization(slug!)
      setOrganization(org)
      setLogoFile(null)
      setLogoPreview(null)
      setSuccessMessage('Logo uploaded successfully')
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to upload logo')
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleLogoDelete = async () => {
    if (!organization) return
    if (!confirm('Remove the organization logo?')) return

    setUploadingLogo(true)
    try {
      await apiClient.deleteOrganizationLogo(organization.id)
      // Refresh org data
      const org = await apiClient.getOrganization(slug!)
      setOrganization(org)
      setSuccessMessage('Logo removed successfully')
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove logo')
    } finally {
      setUploadingLogo(false)
    }
  }

  const canManageMembers = organization?.membership?.canManageMembers || organization?.membership?.role === 'owner'
  const isOwner = organization?.membership?.role === 'owner'
  const isAdmin = organization?.membership?.role === 'admin' || isOwner

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage"></div>
        </div>
      </div>
    )
  }

  if (error || !organization) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error || 'Organization not found'}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to={`/organizations/${slug}`} className="text-sage hover:underline">
            &larr; Back to Public Page
          </Link>
          <h1 className="text-2xl font-bold text-charcoal mt-2">{organization.name}</h1>
          <p className="text-gray-500">
            {organization.membership?.role === 'owner' ? 'Owner' :
             organization.membership?.role === 'admin' ? 'Admin' : 'Member'}
          </p>
        </div>
      </div>

      {/* Status Banner */}
      {organization.status === 'pending' && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <strong>Pending Verification:</strong> Complete Stripe Connect setup to verify your organization
            and start accepting payments.
          </div>
          <button
            onClick={handleStripeConnect}
            disabled={stripeLoading}
            className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 disabled:opacity-50 transition-colors"
          >
            {stripeLoading ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Complete Setup</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Success Banner */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-green-600 hover:text-green-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-sage/20 mb-6">
        <nav className="flex gap-8">
          {['overview', 'members', 'settings'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as typeof activeTab)}
              className={`pb-4 text-sm font-medium capitalize border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-sage text-sage'
                  : 'border-transparent text-gray-500 hover:text-charcoal'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-6">
              <div className="text-3xl font-bold text-sage">0</div>
              <div className="text-gray-500 text-sm">Active Events</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-6">
              <div className="text-3xl font-bold text-sage">$0</div>
              <div className="text-gray-500 text-sm">Total Raised</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-6">
              <div className="text-3xl font-bold text-sage">{members.length}</div>
              <div className="text-gray-500 text-sm">Team Members</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-6">
            <h2 className="text-lg font-semibold text-charcoal mb-4">Quick Actions</h2>
            <div className="flex flex-wrap gap-4">
              <button
                disabled
                className="bg-sage/20 text-sage px-4 py-2 rounded-lg cursor-not-allowed"
              >
                Create Event (Coming Soon)
              </button>
              {canManageMembers && (
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="bg-sage text-white px-4 py-2 rounded-lg hover:bg-sage/90"
                >
                  Invite Member
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Members Tab */}
      {activeTab === 'members' && (
        <div className="space-y-6">
          {canManageMembers && (
            <div className="flex justify-end">
              <button
                onClick={() => setShowInviteModal(true)}
                className="bg-sage text-white px-4 py-2 rounded-lg hover:bg-sage/90"
              >
                Invite Member
              </button>
            </div>
          )}

          {/* Members List */}
          <div className="bg-white rounded-lg shadow-sm border border-sage/20 overflow-hidden">
            <table className="w-full">
              <thead className="bg-sage/10">
                <tr>
                  <th className="text-left px-6 py-3 text-sm font-medium text-charcoal">Member</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-charcoal">Role</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-charcoal">Joined</th>
                  {canManageMembers && (
                    <th className="text-right px-6 py-3 text-sm font-medium text-charcoal">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-sage/10">
                {members.map((member) => (
                  <tr key={member.id}>
                    <td className="px-6 py-4">
                      <div className="font-medium text-charcoal">{member.displayName}</div>
                      <div className="text-sm text-gray-500">{member.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-sm px-2 py-1 rounded-full ${
                        member.role === 'owner' ? 'bg-amber-100 text-amber-800' :
                        member.role === 'admin' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(member.joinedAt).toLocaleDateString()}
                    </td>
                    {canManageMembers && (
                      <td className="px-6 py-4 text-right">
                        {member.role !== 'owner' && (
                          <button
                            onClick={() => handleRemoveMember(member.userId)}
                            className="text-red-600 hover:underline text-sm"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pending Invitations */}
          {canManageMembers && invitations.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-6">
              <h3 className="font-semibold text-charcoal mb-4">Pending Invitations</h3>
              <div className="space-y-3">
                {invitations.map((invitation) => (
                  <div key={invitation.id} className="flex items-center justify-between py-2 border-b border-sage/10 last:border-0">
                    <div>
                      <div className="font-medium text-charcoal">{invitation.email}</div>
                      <div className="text-sm text-gray-500">
                        Invited as {invitation.role} &bull; Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => handleCancelInvitation(invitation.id)}
                      className="text-red-600 hover:underline text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && isAdmin && (
        <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-charcoal">Organization Settings</h2>
            {!editMode ? (
              <button
                onClick={() => {
                  setEditMode(true)
                  setEditData({
                    name: organization.name,
                    description: organization.description,
                    contactEmail: organization.contactEmail,
                    contactPhone: organization.contactPhone,
                    websiteUrl: organization.websiteUrl,
                  })
                }}
                className="text-sage hover:underline"
              >
                Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditMode(false)
                    setEditData({})
                  }}
                  className="px-4 py-2 border border-sage/30 rounded-lg hover:bg-sage/10"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSettings}
                  disabled={saving}
                  className="bg-sage text-white px-4 py-2 rounded-lg hover:bg-sage/90 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>

          {/* Logo Upload Section */}
          <div className="mb-8 pb-6 border-b border-sage/20">
            <h3 className="text-sm font-medium text-charcoal mb-3">Organization Logo</h3>
            <div className="flex items-start gap-6">
              <ImageDropZone
                currentImageUrl={organization.logoUrl}
                previewUrl={logoPreview}
                onFileSelect={handleLogoSelect}
                onRemove={organization.logoUrl && !logoFile ? handleLogoDelete : undefined}
                aspectRatio="square"
                maxSizeMB={5}
                label=""
                hint="Recommended: 200x200px. Click, drag & drop, or paste."
                disabled={uploadingLogo}
                className="w-32"
              />
              {logoFile && (
                <div className="flex flex-col gap-2 pt-8">
                  <button
                    onClick={handleLogoUpload}
                    disabled={uploadingLogo}
                    className="bg-sage text-white px-4 py-2 rounded-lg hover:bg-sage/90 disabled:opacity-50"
                  >
                    {uploadingLogo ? 'Uploading...' : 'Save Logo'}
                  </button>
                  <button
                    onClick={() => {
                      setLogoFile(null)
                      if (logoPreview) {
                        URL.revokeObjectURL(logoPreview)
                        setLogoPreview(null)
                      }
                    }}
                    disabled={uploadingLogo}
                    className="px-4 py-2 border border-sage/30 rounded-lg hover:bg-sage/10"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          {editMode ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Name</label>
                <input
                  type="text"
                  value={editData.name || ''}
                  onChange={(e) => setEditData((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Description</label>
                <textarea
                  rows={4}
                  value={editData.description || ''}
                  onChange={(e) => setEditData((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Contact Email</label>
                <input
                  type="email"
                  value={editData.contactEmail || ''}
                  onChange={(e) => setEditData((prev) => ({ ...prev, contactEmail: e.target.value }))}
                  className="w-full px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Phone</label>
                <input
                  type="tel"
                  value={editData.contactPhone || ''}
                  onChange={(e) => setEditData((prev) => ({ ...prev, contactPhone: e.target.value }))}
                  className="w-full px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Website</label>
                <input
                  type="url"
                  value={editData.websiteUrl || ''}
                  onChange={(e) => setEditData((prev) => ({ ...prev, websiteUrl: e.target.value }))}
                  className="w-full px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
                />
              </div>
            </div>
          ) : (
            <dl className="space-y-4">
              <div>
                <dt className="text-sm text-gray-500">Name</dt>
                <dd className="font-medium text-charcoal">{organization.name}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Description</dt>
                <dd className="text-charcoal">{organization.description || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Contact Email</dt>
                <dd className="text-charcoal">{organization.contactEmail || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Phone</dt>
                <dd className="text-charcoal">{organization.contactPhone || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Website</dt>
                <dd className="text-charcoal">{organization.websiteUrl || '-'}</dd>
              </div>
            </dl>
          )}

          {isOwner && (
            <div className="mt-8 pt-6 border-t border-red-200">
              <h3 className="text-lg font-semibold text-red-600 mb-2">Danger Zone</h3>
              <p className="text-sm text-gray-500 mb-4">
                Deleting this organization will remove all events, items, members, and financial records.
              </p>
              <button
                onClick={async () => {
                  setShowDeleteModal(true)
                  setLoadingDeletionSummary(true)
                  setDeletionSummary(null)
                  setDeleteConfirmText('')
                  try {
                    const summary = await apiClient.getOrganizationDeletionSummary(organization.id)
                    setDeletionSummary(summary)
                  } catch (err) {
                    alert(err instanceof Error ? err.message : 'Failed to load deletion summary')
                    setShowDeleteModal(false)
                  } finally {
                    setLoadingDeletionSummary(false)
                  }
                }}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
              >
                Delete Organization
              </button>
            </div>
          )}
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-charcoal mb-4">Invite Member</h2>
            <form onSubmit={handleInvite}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
                    placeholder="email@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
                    className="w-full px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
                  >
                    <option value="member">Member</option>
                    {isOwner && <option value="admin">Admin</option>}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-4 mt-6">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 border border-sage/30 rounded-lg hover:bg-sage/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="bg-sage text-white px-4 py-2 rounded-lg hover:bg-sage/90 disabled:opacity-50"
                >
                  {inviting ? 'Sending...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-red-600 mb-4">Delete Organization</h2>

              {loadingDeletionSummary ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
                </div>
              ) : deletionSummary ? (
                <div className="space-y-6">
                  {/* Blockers */}
                  {deletionSummary.blockers.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <h3 className="font-semibold text-red-800 mb-2">Cannot Delete</h3>
                      <p className="text-sm text-red-700 mb-3">
                        The following issues must be resolved before deletion:
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-sm text-red-700">
                        {deletionSummary.blockers.map((blocker, i) => (
                          <li key={i}>{blocker}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* What will be deleted */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-semibold text-charcoal mb-3">What will be permanently deleted:</h3>
                    <ul className="space-y-2 text-sm text-gray-700">
                      <li className="flex justify-between">
                        <span>Events</span>
                        <span className="font-medium">{deletionSummary.willDelete.events}</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Auction Items</span>
                        <span className="font-medium">{deletionSummary.willDelete.items}</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Team Members</span>
                        <span className="font-medium">{deletionSummary.willDelete.members}</span>
                      </li>
                      {deletionSummary.organization.hasStripeAccount && (
                        <li className="flex justify-between">
                          <span>Stripe Connect Account</span>
                          <span className="font-medium text-amber-600">Will be disconnected</span>
                        </li>
                      )}
                    </ul>
                  </div>

                  {/* Financial Summary */}
                  {(deletionSummary.financial.totalRaised > 0 || deletionSummary.financial.completedPayouts > 0) && (
                    <div className="bg-blue-50 rounded-lg p-4">
                      <h3 className="font-semibold text-charcoal mb-3">Financial History:</h3>
                      <ul className="space-y-2 text-sm text-gray-700">
                        <li className="flex justify-between">
                          <span>Total Raised</span>
                          <span className="font-medium">${deletionSummary.financial.totalRaised.toFixed(2)}</span>
                        </li>
                        <li className="flex justify-between">
                          <span>Total Paid Out</span>
                          <span className="font-medium">${deletionSummary.financial.totalPaidOut.toFixed(2)}</span>
                        </li>
                        <li className="flex justify-between">
                          <span>Completed Payouts</span>
                          <span className="font-medium">{deletionSummary.financial.completedPayouts}</span>
                        </li>
                      </ul>
                    </div>
                  )}

                  {/* Confirmation input */}
                  {deletionSummary.canDelete && (
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-2">
                        Type <span className="font-bold text-red-600">{deletionSummary.organization.name}</span> to confirm:
                      </label>
                      <input
                        type="text"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        className="w-full px-4 py-2 border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                        placeholder="Organization name"
                      />
                    </div>
                  )}
                </div>
              ) : null}

              {/* Actions */}
              <div className="flex justify-end gap-4 mt-6 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(false)
                    setDeletionSummary(null)
                    setDeleteConfirmText('')
                  }}
                  disabled={deleting}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                {deletionSummary?.canDelete && (
                  <button
                    onClick={async () => {
                      if (deleteConfirmText !== deletionSummary.organization.name) {
                        alert('Please type the organization name exactly to confirm.')
                        return
                      }
                      setDeleting(true)
                      try {
                        await apiClient.deleteOrganization(organization!.id)
                        navigate('/my-organizations')
                      } catch (err) {
                        alert(err instanceof Error ? err.message : 'Failed to delete organization')
                        setDeleting(false)
                      }
                    }}
                    disabled={deleting || deleteConfirmText !== deletionSummary.organization.name}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deleting ? 'Deleting...' : 'Delete Forever'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
