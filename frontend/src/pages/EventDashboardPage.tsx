import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { apiClient } from '../services/api'
import type { AuctionEvent, EventItem, UpdateEventRequest, ItemSubmissionStatus } from '../types'
import ImageDropZone from '../components/ImageDropZone'

const statusColors = {
  draft: 'bg-gray-100 text-gray-800',
  scheduled: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
  ended: 'bg-amber-100 text-amber-800',
  cancelled: 'bg-red-100 text-red-800',
}

const submissionStatusColors: Record<ItemSubmissionStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  resubmit_requested: 'bg-orange-100 text-orange-800',
}

export default function EventDashboardPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  const [event, setEvent] = useState<AuctionEvent | null>(null)
  const [items, setItems] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<'overview' | 'items' | 'settings'>('overview')
  const [itemFilter, setItemFilter] = useState<'all' | ItemSubmissionStatus>('all')

  const [showRejectModal, setShowRejectModal] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [showResubmitModal, setShowResubmitModal] = useState<string | null>(null)
  const [resubmitReason, setResubmitReason] = useState('')

  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState<UpdateEventRequest>({})
  const [saving, setSaving] = useState(false)

  const [showShareModal, setShowShareModal] = useState(false)
  const [submissionLink, setSubmissionLink] = useState<{ url: string; accessCode: string } | null>(null)

  // Success banner state (for showing payment confirmation)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Publishing state
  const [isPublishing, setIsPublishing] = useState(false)

  // Cover image upload state
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null)
  const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null)
  const [uploadingCoverImage, setUploadingCoverImage] = useState(false)

  const fetchData = useCallback(async () => {
    if (!slug) return

    try {
      setLoading(true)
      const [eventData, itemsData] = await Promise.all([
        apiClient.getEvent(slug),
        apiClient.getEventItems(slug).catch(() => []),
      ])

      if (!eventData.isAdmin) {
        navigate(`/events/${slug}`)
        return
      }

      setEvent(eventData)
      setItems(itemsData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load event')
    } finally {
      setLoading(false)
    }
  }, [slug, navigate])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handlePublish = async () => {
    if (!event) return

    setIsPublishing(true)
    try {
      const result = await apiClient.publishEvent(event.id)
      if (result.success) {
        // Show success message
        setSuccessMessage('Your auction has been published successfully! It will go live at the scheduled start time. ' + result.feeInfo.description)
        // Refresh event data to get updated status
        await fetchData()
        // Auto-dismiss success message after 10 seconds
        setTimeout(() => setSuccessMessage(null), 10000)
      } else {
        alert(result.message)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to publish event')
    } finally {
      setIsPublishing(false)
    }
  }

  const handleApproveItem = async (itemId: string) => {
    if (!event) return

    try {
      await apiClient.approveEventItem(event.id, itemId)
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, submissionStatus: 'approved' } : item
        )
      )
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to approve item')
    }
  }

  const handleRejectItem = async () => {
    if (!event || !showRejectModal) return

    try {
      await apiClient.rejectEventItem(event.id, showRejectModal, rejectReason)
      setItems((prev) =>
        prev.map((item) =>
          item.id === showRejectModal
            ? { ...item, submissionStatus: 'rejected', rejectionReason: rejectReason }
            : item
        )
      )
      setShowRejectModal(null)
      setRejectReason('')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reject item')
    }
  }

  const handleRequestResubmit = async () => {
    if (!event || !showResubmitModal) return

    try {
      await apiClient.requestItemResubmit(event.id, showResubmitModal, resubmitReason)
      setItems((prev) =>
        prev.map((item) =>
          item.id === showResubmitModal
            ? { ...item, submissionStatus: 'resubmit_requested', rejectionReason: resubmitReason }
            : item
        )
      )
      setShowResubmitModal(null)
      setResubmitReason('')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to request resubmission')
    }
  }

  const handleRemoveItem = async (itemId: string) => {
    if (!event) return
    if (!confirm('Remove this item from the auction? If the auction is active, bidders will be notified.')) return

    try {
      await apiClient.removeEventItem(event.id, itemId)
      setItems((prev) => prev.filter((item) => item.id !== itemId))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove item')
    }
  }

  const handleSaveSettings = async () => {
    if (!event) return

    setSaving(true)
    try {
      const updated = await apiClient.updateEvent(event.id, editData)
      setEvent(updated)
      setEditMode(false)
      setEditData({})
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  const handleGetSubmissionLink = async () => {
    if (!event) return

    try {
      const link = await apiClient.getEventSubmissionLink(event.id)
      setSubmissionLink(link)
      setShowShareModal(true)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to get submission link')
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    alert('Copied to clipboard!')
  }

  const handleCoverImageSelect = (file: File) => {
    setCoverImageFile(file)
    if (coverImagePreview) {
      URL.revokeObjectURL(coverImagePreview)
    }
    setCoverImagePreview(URL.createObjectURL(file))
  }

  const handleCoverImageUpload = async () => {
    if (!event || !coverImageFile) return

    setUploadingCoverImage(true)
    try {
      await apiClient.uploadEventCoverImage(event.id, coverImageFile)
      // Refresh event data to get new cover image URL
      await fetchData()
      setCoverImageFile(null)
      if (coverImagePreview) {
        URL.revokeObjectURL(coverImagePreview)
        setCoverImagePreview(null)
      }
      setSuccessMessage('Cover image uploaded successfully')
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to upload cover image')
    } finally {
      setUploadingCoverImage(false)
    }
  }

  const handleCoverImageDelete = async () => {
    if (!event) return
    if (!confirm('Remove the cover image?')) return

    setUploadingCoverImage(true)
    try {
      await apiClient.deleteEventCoverImage(event.id)
      // Refresh event data
      await fetchData()
      setSuccessMessage('Cover image removed successfully')
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove cover image')
    } finally {
      setUploadingCoverImage(false)
    }
  }

  const handleCancelCoverImageUpload = () => {
    setCoverImageFile(null)
    if (coverImagePreview) {
      URL.revokeObjectURL(coverImagePreview)
      setCoverImagePreview(null)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const filteredItems = itemFilter === 'all'
    ? items
    : items.filter((item) => item.submissionStatus === itemFilter)

  const pendingCount = items.filter((i) => i.submissionStatus === 'pending').length

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage"></div>
        </div>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error || 'Event not found'}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to="/my-events" className="text-sage hover:underline">
            &larr; Back to My Events
          </Link>
          <h1 className="text-2xl font-bold text-charcoal mt-2">{event.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[event.status]}`}>
              {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
            </span>
            {event.organization && (
              <span className="text-gray-500">{event.organization.name}</span>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleGetSubmissionLink}
            className="px-4 py-2 border border-sage text-sage rounded-lg hover:bg-sage/10"
          >
            Share Submission Link
          </button>
          {event.status === 'draft' && (
            <button
              onClick={handlePublish}
              className="px-4 py-2 bg-sage text-white rounded-lg hover:bg-sage/90"
            >
              Publish Event
            </button>
          )}
          <Link
            to={`/events/${slug}`}
            className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            View Public Page
          </Link>
        </div>
      </div>

      {/* Success Banner */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
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

      {/* Pending Items Alert */}
      {pendingCount > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg mb-6 flex items-center justify-between">
          <span>
            <strong>{pendingCount}</strong> item{pendingCount !== 1 ? 's' : ''} awaiting review
          </span>
          <button
            onClick={() => {
              setActiveTab('items')
              setItemFilter('pending')
            }}
            className="text-yellow-800 font-medium hover:underline"
          >
            Review now &rarr;
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-sage/20 mb-6">
        <nav className="flex gap-8">
          {['overview', 'items', 'settings'].map((tab) => (
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
              {tab === 'items' && pendingCount > 0 && (
                <span className="ml-2 bg-yellow-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-6">
              <div className="text-3xl font-bold text-sage">{event.itemCount}</div>
              <div className="text-gray-500 text-sm">Total Items</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-6">
              <div className="text-3xl font-bold text-sage">{event.totalBids}</div>
              <div className="text-gray-500 text-sm">Total Bids</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-6">
              <div className="text-3xl font-bold text-sage">
                ${event.totalRaised.toLocaleString()}
              </div>
              <div className="text-gray-500 text-sm">Total Raised</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-6">
              <div className="text-3xl font-bold text-charcoal">{event.maxItems}</div>
              <div className="text-gray-500 text-sm">Max Items ({event.tier})</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-6">
              <h3 className="font-semibold text-charcoal mb-4">Event Schedule</h3>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm text-gray-500">Start Time</dt>
                  <dd className="font-medium text-charcoal">{formatDate(event.startTime)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">End Time</dt>
                  <dd className="font-medium text-charcoal">{formatDate(event.endTime)}</dd>
                </div>
                {event.submissionDeadline && (
                  <div>
                    <dt className="text-sm text-gray-500">Submission Deadline</dt>
                    <dd className="font-medium text-charcoal">{formatDate(event.submissionDeadline)}</dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-6">
              <h3 className="font-semibold text-charcoal mb-4">Auction Settings</h3>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm text-gray-500">Auction Type</dt>
                  <dd className="font-medium text-charcoal capitalize">{event.auctionType}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Bid Increment</dt>
                  <dd className="font-medium text-charcoal">
                    {event.incrementType === 'fixed'
                      ? `$${event.incrementValue}`
                      : `${event.incrementValue}%`}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Buy Now</dt>
                  <dd className="font-medium text-charcoal">
                    {event.buyNowEnabled ? 'Enabled' : 'Disabled'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      )}

      {/* Items Tab */}
      {activeTab === 'items' && (
        <div className="space-y-6">
          {/* Item Filters */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {(['all', 'pending', 'approved', 'rejected', 'resubmit_requested'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setItemFilter(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  itemFilter === status
                    ? 'bg-sage text-white'
                    : 'bg-sage/10 text-charcoal hover:bg-sage/20'
                }`}
              >
                {status === 'all' ? 'All Items' : status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                {status !== 'all' && (
                  <span className="ml-1 opacity-70">
                    ({items.filter((i) => i.submissionStatus === status).length})
                  </span>
                )}
              </button>
            ))}
          </div>

          {filteredItems.length === 0 ? (
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
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
              <h2 className="text-xl font-semibold text-charcoal mb-2">No items yet</h2>
              <p className="text-gray-500 mb-4">
                Share your submission link to start collecting items
              </p>
              <button
                onClick={handleGetSubmissionLink}
                className="inline-block bg-sage text-white px-6 py-3 rounded-xl font-semibold hover:bg-sage/90"
              >
                Get Submission Link
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-sage/20 overflow-hidden">
              <table className="w-full">
                <thead className="bg-sage/10">
                  <tr>
                    <th className="text-left px-6 py-3 text-sm font-medium text-charcoal">Item</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-charcoal">Submitted By</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-charcoal">Price</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-charcoal">Status</th>
                    <th className="text-right px-6 py-3 text-sm font-medium text-charcoal">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sage/10">
                  {filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {item.images.length > 0 ? (
                            <img
                              src={item.images[0].blobUrl}
                              alt={item.title}
                              className="w-12 h-12 object-cover rounded-lg"
                            />
                          ) : (
                            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-charcoal">{item.title}</div>
                            {item.description && (
                              <div className="text-sm text-gray-500 truncate max-w-xs">
                                {item.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-charcoal">
                          {item.submitter?.name || item.submitterName || 'Unknown'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm">
                          {item.startingPrice ? (
                            <span className="text-charcoal">${item.startingPrice}</span>
                          ) : (
                            <span className="text-gray-400">No starting price</span>
                          )}
                          {item.buyNowPrice && (
                            <div className="text-xs text-gray-500">
                              Buy Now: ${item.buyNowPrice}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${submissionStatusColors[item.submissionStatus]}`}>
                          {item.submissionStatus.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </span>
                        {item.rejectionReason && (
                          <div className="text-xs text-gray-500 mt-1 max-w-xs truncate">
                            {item.rejectionReason}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {item.submissionStatus === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApproveItem(item.id)}
                                className="text-green-600 hover:underline text-sm"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => setShowRejectModal(item.id)}
                                className="text-red-600 hover:underline text-sm"
                              >
                                Reject
                              </button>
                              <button
                                onClick={() => setShowResubmitModal(item.id)}
                                className="text-orange-600 hover:underline text-sm"
                              >
                                Request Changes
                              </button>
                            </>
                          )}
                          {item.submissionStatus === 'approved' && event.status !== 'active' && (
                            <button
                              onClick={() => handleRemoveItem(item.id)}
                              className="text-red-600 hover:underline text-sm"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-charcoal">Event Settings</h2>
              {!editMode ? (
                <button
                  onClick={() => {
                    setEditMode(true)
                    setEditData({
                      name: event.name,
                      description: event.description,
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
              </div>
            ) : (
              <dl className="space-y-4">
                <div>
                  <dt className="text-sm text-gray-500">Name</dt>
                  <dd className="font-medium text-charcoal">{event.name}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Description</dt>
                  <dd className="text-charcoal">{event.description || '-'}</dd>
                </div>
              </dl>
            )}
          </div>

          {/* Cover Image Section */}
          <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-6">
            <h2 className="text-lg font-semibold text-charcoal mb-4">Cover Image</h2>
            <ImageDropZone
              currentImageUrl={event.coverImageUrl}
              previewUrl={coverImagePreview}
              onFileSelect={handleCoverImageSelect}
              onRemove={event.coverImageUrl && !coverImageFile ? handleCoverImageDelete : undefined}
              aspectRatio="landscape"
              maxSizeMB={10}
              label=""
              hint="Recommended size: 1200x600px. Click, drag & drop, or paste an image."
              disabled={uploadingCoverImage}
            />
            {coverImageFile && (
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleCoverImageUpload}
                  disabled={uploadingCoverImage}
                  className="bg-sage text-white px-4 py-2 rounded-lg hover:bg-sage/90 disabled:opacity-50"
                >
                  {uploadingCoverImage ? 'Uploading...' : 'Save Image'}
                </button>
                <button
                  onClick={handleCancelCoverImageUpload}
                  disabled={uploadingCoverImage}
                  className="px-4 py-2 border border-sage/30 rounded-lg hover:bg-sage/10"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {event.status === 'draft' && (
            <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6">
              <h3 className="text-lg font-semibold text-red-600 mb-2">Danger Zone</h3>
              <p className="text-sm text-gray-500 mb-4">
                Deleting this event will remove all items and cannot be undone.
              </p>
              <button
                onClick={async () => {
                  if (!confirm(`Are you sure you want to delete "${event.name}"? This cannot be undone.`)) return
                  try {
                    await apiClient.deleteEvent(event.id)
                    navigate('/my-events')
                  } catch (err) {
                    alert(err instanceof Error ? err.message : 'Failed to delete event')
                  }
                }}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
              >
                Delete Event
              </button>
            </div>
          )}

          {(event.status === 'scheduled' || event.status === 'active') && (
            <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6">
              <h3 className="text-lg font-semibold text-red-600 mb-2">Cancel Auction</h3>
              {event.status === 'scheduled' ? (
                <p className="text-sm text-gray-500 mb-4">
                  Cancel this auction before it starts. You will receive a full refund of the publishing fee.
                  All submitted items will be preserved but the auction will not go live.
                </p>
              ) : (
                <p className="text-sm text-gray-500 mb-4">
                  Cancel this active auction. <strong>No refund will be issued</strong> as the auction has already started.
                  All current bids will be cancelled and bidders will be notified.
                </p>
              )}
              <button
                onClick={async () => {
                  const warningMessage = event.status === 'active'
                    ? `Are you sure you want to cancel "${event.name}"? This auction is currently active. All bids will be cancelled and bidders will be notified.`
                    : `Are you sure you want to cancel "${event.name}"?`
                  if (!confirm(warningMessage)) return
                  try {
                    const result = await apiClient.cancelEvent(event.id)
                    setSuccessMessage(result.message)
                    await fetchData()
                  } catch (err) {
                    alert(err instanceof Error ? err.message : 'Failed to cancel auction')
                  }
                }}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
              >
                Cancel Auction
              </button>
            </div>
          )}
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-charcoal mb-4">Reject Item</h2>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Reason</label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
                placeholder="Explain why this item is being rejected..."
              />
            </div>
            <div className="flex justify-end gap-4 mt-6">
              <button
                onClick={() => {
                  setShowRejectModal(null)
                  setRejectReason('')
                }}
                className="px-4 py-2 border border-sage/30 rounded-lg hover:bg-sage/10"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectItem}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
              >
                Reject Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Resubmit Modal */}
      {showResubmitModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-charcoal mb-4">Request Changes</h2>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">What needs to change?</label>
              <textarea
                rows={3}
                value={resubmitReason}
                onChange={(e) => setResubmitReason(e.target.value)}
                className="w-full px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
                placeholder="Explain what changes are needed..."
              />
            </div>
            <div className="flex justify-end gap-4 mt-6">
              <button
                onClick={() => {
                  setShowResubmitModal(null)
                  setResubmitReason('')
                }}
                className="px-4 py-2 border border-sage/30 rounded-lg hover:bg-sage/10"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestResubmit}
                className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700"
              >
                Request Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && submissionLink && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg mx-4">
            <h2 className="text-lg font-semibold text-charcoal mb-4">Share Submission Link</h2>
            <p className="text-gray-600 mb-4">
              Share this link with people who want to submit items to your auction.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Submission URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={submissionLink.url}
                    className="flex-1 px-4 py-2 border border-sage/30 rounded-lg bg-gray-50"
                  />
                  <button
                    onClick={() => copyToClipboard(submissionLink.url)}
                    className="px-4 py-2 bg-sage text-white rounded-lg hover:bg-sage/90"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Access Code</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={submissionLink.accessCode}
                    className="flex-1 px-4 py-2 border border-sage/30 rounded-lg bg-gray-50 font-mono text-lg"
                  />
                  <button
                    onClick={() => copyToClipboard(submissionLink.accessCode)}
                    className="px-4 py-2 bg-sage text-white rounded-lg hover:bg-sage/90"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Submitters will need this code to add items
                </p>
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setShowShareModal(false)}
                className="px-4 py-2 border border-sage/30 rounded-lg hover:bg-sage/10"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
