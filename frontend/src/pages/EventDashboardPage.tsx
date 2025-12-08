import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { apiClient } from '../services/api'
import type { AuctionEvent, EventItem, UpdateEventRequest, ItemSubmissionStatus, ItemPaymentStatus, ItemFulfillmentStatus } from '../types'
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

const paymentStatusColors: Record<ItemPaymentStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  paid: 'bg-green-100 text-green-800',
  payment_issue: 'bg-red-100 text-red-800',
  waived: 'bg-gray-100 text-gray-800',
  refunded: 'bg-purple-100 text-purple-800',
}

const fulfillmentStatusColors: Record<ItemFulfillmentStatus, string> = {
  pending: 'bg-gray-100 text-gray-800',
  processing: 'bg-blue-100 text-blue-800',
  ready_for_pickup: 'bg-amber-100 text-amber-800',
  shipped: 'bg-indigo-100 text-indigo-800',
  out_for_delivery: 'bg-cyan-100 text-cyan-800',
  delivered: 'bg-green-100 text-green-800',
  picked_up: 'bg-green-100 text-green-800',
  issue: 'bg-red-100 text-red-800',
}

export default function EventDashboardPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  const [event, setEvent] = useState<AuctionEvent | null>(null)
  const [items, setItems] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<'overview' | 'items' | 'donations' | 'payments' | 'settings'>('overview')
  const [itemFilter, setItemFilter] = useState<'all' | ItemSubmissionStatus>('all')

  // Donor submissions state
  type DonorSubmission = {
    id: string
    name: string
    description: string | null
    estimatedValue: number | null
    condition: string | null
    category: string | null
    donor: {
      name: string | null
      email: string | null
      phone: string | null
      notes: string | null
      anonymous: boolean
    }
    status: string
    reviewedBy: string | null
    reviewedAt: string | null
    reviewNotes: string | null
    rejectionReason: string | null
    eventItemId: string | null
    submittedAt: string
    lastEditedBy: string | null
    lastEditedAt: string | null
    imageCount: number
    primaryImageUrl: string | null
  }
  const [donorSubmissions, setDonorSubmissions] = useState<DonorSubmission[]>([])
  const [donorSubmissionsLoading, setDonorSubmissionsLoading] = useState(false)
  const [donorSubmissionFilter, setDonorSubmissionFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'withdrawn'>('all')
  const [donorSubmissionStats, setDonorSubmissionStats] = useState<{ pending: number; approved: number; rejected: number; converted: number } | null>(null)
  const [showConvertModal, setShowConvertModal] = useState<string | null>(null)
  const [convertModalData, setConvertModalData] = useState<{ startingBid: string; buyNowPrice: string }>({ startingBid: '', buyNowPrice: '' })
  const [showDonorRejectModal, setShowDonorRejectModal] = useState<string | null>(null)
  const [donorRejectReason, setDonorRejectReason] = useState('')
  const [showDonationSettingsModal, setShowDonationSettingsModal] = useState(false)
  const [donationSettings, setDonationSettings] = useState<{
    code: string | null
    enabled: boolean
    createdAt: string | null
    expiresAt: string | null
    requiresContact: boolean
    requireValueEstimate: boolean
    maxImages: number
    instructions: string | null
    notifyOnSubmission: boolean
    autoThankDonor: boolean
    donationUrl: string | null
  } | null>(null)

  // Self-managed payment tracking state
  const [wonItems, setWonItems] = useState<EventItem[]>([])
  const [wonItemsLoading, setWonItemsLoading] = useState(false)
  const [paymentFilter, setPaymentFilter] = useState<'all' | ItemPaymentStatus>('all')
  const [showPaymentModal, setShowPaymentModal] = useState<string | null>(null)
  const [paymentModalData, setPaymentModalData] = useState<{ status: ItemPaymentStatus; methodUsed: string; notes: string }>({ status: 'paid', methodUsed: '', notes: '' })
  const [showFulfillmentModal, setShowFulfillmentModal] = useState<string | null>(null)
  const [fulfillmentModalData, setFulfillmentModalData] = useState<{ status: ItemFulfillmentStatus; type?: 'shipping' | 'pickup' | 'digital'; trackingNumber: string; trackingCarrier: string; notes: string }>({ status: 'delivered', trackingNumber: '', trackingCarrier: '', notes: '' })

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

  // Fetch won items for self-managed payment tracking
  const fetchWonItems = useCallback(async () => {
    if (!event) return

    setWonItemsLoading(true)
    try {
      const items = await apiClient.getEventWonItems(event.id)
      setWonItems(items)
    } catch (err) {
      console.error('Failed to fetch won items:', err)
    } finally {
      setWonItemsLoading(false)
    }
  }, [event])

  // Load won items when switching to payments tab
  useEffect(() => {
    if (activeTab === 'payments' && event && wonItems.length === 0 && !wonItemsLoading) {
      fetchWonItems()
    }
  }, [activeTab, event, wonItems.length, wonItemsLoading, fetchWonItems])

  // Fetch donor submissions
  const fetchDonorSubmissions = useCallback(async () => {
    if (!event) return

    setDonorSubmissionsLoading(true)
    try {
      const [submissionsData, statsData] = await Promise.all([
        apiClient.getEventSubmissions(event.id, {
          status: donorSubmissionFilter === 'all' ? undefined : donorSubmissionFilter,
        }),
        apiClient.getSubmissionStats(event.id),
      ])
      setDonorSubmissions(submissionsData.submissions)
      setDonorSubmissionStats({
        pending: statsData.pending,
        approved: statsData.approved,
        rejected: statsData.rejected,
        converted: statsData.converted,
      })
    } catch (err) {
      console.error('Failed to fetch donor submissions:', err)
    } finally {
      setDonorSubmissionsLoading(false)
    }
  }, [event, donorSubmissionFilter])

  // Load donor submissions when switching to donations tab
  useEffect(() => {
    if (activeTab === 'donations' && event) {
      fetchDonorSubmissions()
    }
  }, [activeTab, event, fetchDonorSubmissions])

  // Fetch donation settings
  const fetchDonationSettings = useCallback(async () => {
    if (!event) return
    try {
      const settings = await apiClient.getDonationSettings(event.id)
      setDonationSettings(settings)
    } catch (err) {
      console.error('Failed to fetch donation settings:', err)
    }
  }, [event])

  useEffect(() => {
    if (event) {
      fetchDonationSettings()
    }
  }, [event, fetchDonationSettings])

  const handleApproveSubmission = async (submissionId: string) => {
    if (!event) return
    try {
      await apiClient.approveSubmission(event.id, submissionId)
      setDonorSubmissions((prev) =>
        prev.map((s) => (s.id === submissionId ? { ...s, status: 'approved' } : s))
      )
      setSuccessMessage('Submission approved! You can now convert it to an auction item.')
      setTimeout(() => setSuccessMessage(null), 5000)
      // Refresh stats
      fetchDonorSubmissions()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to approve submission')
    }
  }

  const handleRejectSubmission = async () => {
    if (!event || !showDonorRejectModal) return
    try {
      await apiClient.rejectSubmission(event.id, showDonorRejectModal, donorRejectReason)
      setDonorSubmissions((prev) =>
        prev.map((s) => (s.id === showDonorRejectModal ? { ...s, status: 'rejected', rejectionReason: donorRejectReason } : s))
      )
      setShowDonorRejectModal(null)
      setDonorRejectReason('')
      setSuccessMessage('Submission rejected.')
      setTimeout(() => setSuccessMessage(null), 5000)
      fetchDonorSubmissions()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reject submission')
    }
  }

  const handleConvertSubmission = async () => {
    if (!event || !showConvertModal) return
    try {
      const result = await apiClient.convertSubmissionToItem(event.id, showConvertModal, {
        startingBid: convertModalData.startingBid ? parseFloat(convertModalData.startingBid) : undefined,
        buyNowPrice: convertModalData.buyNowPrice ? parseFloat(convertModalData.buyNowPrice) : undefined,
      })
      setDonorSubmissions((prev) =>
        prev.map((s) => (s.id === showConvertModal ? { ...s, status: 'converted', eventItemId: result.eventItemId } : s))
      )
      setShowConvertModal(null)
      setConvertModalData({ startingBid: '', buyNowPrice: '' })
      setSuccessMessage('Item successfully added to auction!')
      setTimeout(() => setSuccessMessage(null), 5000)
      // Refresh items list too
      fetchData()
      fetchDonorSubmissions()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to convert submission')
    }
  }

  const handleGenerateDonationCode = async () => {
    if (!event) return
    try {
      const result = await apiClient.generateDonationCode(event.id)
      setDonationSettings((prev) => prev ? { ...prev, code: result.code, enabled: true, donationUrl: result.donationUrl } : null)
      setSuccessMessage('Donation code generated!')
      setTimeout(() => setSuccessMessage(null), 5000)
      // Refresh settings to get full data
      fetchDonationSettings()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate donation code')
    }
  }

  const handleToggleDonationCode = async (enabled: boolean) => {
    if (!event) return
    try {
      await apiClient.updateDonationSettings(event.id, { enabled })
      setDonationSettings((prev) => prev ? { ...prev, enabled } : null)
      setSuccessMessage(enabled ? 'Donations enabled!' : 'Donations disabled.')
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update donation settings')
    }
  }

  const handleUpdatePaymentStatus = async () => {
    if (!showPaymentModal) return

    try {
      const updated = await apiClient.updateItemPaymentStatus(showPaymentModal, {
        paymentStatus: paymentModalData.status,
        paymentMethodUsed: paymentModalData.methodUsed || undefined,
        paymentNotes: paymentModalData.notes || undefined,
      })

      // Update the item in the list
      setWonItems((prev) =>
        prev.map((item) => (item.id === showPaymentModal ? { ...item, ...updated } : item))
      )

      setSuccessMessage('Payment status updated successfully')
      setTimeout(() => setSuccessMessage(null), 5000)
      setShowPaymentModal(null)
      setPaymentModalData({ status: 'paid', methodUsed: '', notes: '' })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update payment status')
    }
  }

  const handleUpdateFulfillmentStatus = async () => {
    if (!showFulfillmentModal) return

    try {
      const updated = await apiClient.updateItemFulfillmentStatus(showFulfillmentModal, {
        fulfillmentStatus: fulfillmentModalData.status,
        fulfillmentType: fulfillmentModalData.type,
        trackingNumber: fulfillmentModalData.trackingNumber || undefined,
        trackingCarrier: fulfillmentModalData.trackingCarrier || undefined,
        fulfillmentNotes: fulfillmentModalData.notes || undefined,
      })

      // Update the item in the list
      setWonItems((prev) =>
        prev.map((item) => (item.id === showFulfillmentModal ? { ...item, ...updated } : item))
      )

      setSuccessMessage('Fulfillment status updated successfully')
      setTimeout(() => setSuccessMessage(null), 5000)
      setShowFulfillmentModal(null)
      setFulfillmentModalData({ status: 'delivered', trackingNumber: '', trackingCarrier: '', notes: '' })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update fulfillment status')
    }
  }

  // Filter won items by payment status
  const filteredWonItems = paymentFilter === 'all'
    ? wonItems
    : wonItems.filter((item) => item.paymentStatus === paymentFilter)

  // Count of items needing attention
  const unpaidCount = wonItems.filter((i) => i.paymentStatus === 'pending' || i.paymentStatus === 'payment_issue').length
  const pendingFulfillmentCount = wonItems.filter((i) => i.fulfillmentStatus === 'pending' || i.fulfillmentStatus === 'processing').length

  // Check if event uses self-managed payments
  const isSelfManaged = event?.paymentMode === 'self_managed'
  const showPaymentsTab = isSelfManaged && (event?.status === 'ended' || event?.status === 'active')

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
          {(['overview', 'items', 'donations', ...(showPaymentsTab ? ['payments'] : []), 'settings'] as const).map((tab) => (
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
              {tab === 'donations' && donorSubmissionStats && donorSubmissionStats.pending > 0 && (
                <span className="ml-2 bg-purple-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {donorSubmissionStats.pending}
                </span>
              )}
              {tab === 'payments' && unpaidCount > 0 && (
                <span className="ml-2 bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {unpaidCount}
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

      {/* Donations Tab */}
      {activeTab === 'donations' && (
        <div className="space-y-6">
          {/* Donation Link Card */}
          <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-charcoal">Public Donation Link</h3>
                <p className="text-sm text-gray-500">Share this link to collect item donations from the public</p>
              </div>
              {donationSettings?.code ? (
                <div className="flex items-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={donationSettings.enabled}
                      onChange={(e) => handleToggleDonationCode(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sage/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sage"></div>
                    <span className="ml-3 text-sm font-medium text-charcoal">
                      {donationSettings.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </label>
                </div>
              ) : (
                <button
                  onClick={handleGenerateDonationCode}
                  className="px-4 py-2 bg-sage text-white rounded-lg hover:bg-sage/90"
                >
                  Enable Donations
                </button>
              )}
            </div>

            {donationSettings?.code && donationSettings.enabled && (
              <div className="bg-sage/5 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/donate/${donationSettings.code}`}
                    className="flex-1 px-4 py-2 border border-sage/30 rounded-lg bg-white font-mono text-sm"
                  />
                  <button
                    onClick={() => copyToClipboard(`${window.location.origin}/donate/${donationSettings.code}`)}
                    className="px-4 py-2 bg-sage text-white rounded-lg hover:bg-sage/90"
                  >
                    Copy Link
                  </button>
                  <button
                    onClick={() => setShowDonationSettingsModal(true)}
                    className="px-4 py-2 border border-sage text-sage rounded-lg hover:bg-sage/10"
                  >
                    Settings
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Stats Cards */}
          {donorSubmissionStats && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-4">
                <div className="text-2xl font-bold text-purple-600">{donorSubmissionStats.pending}</div>
                <div className="text-gray-500 text-sm">Pending Review</div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-4">
                <div className="text-2xl font-bold text-green-600">{donorSubmissionStats.approved}</div>
                <div className="text-gray-500 text-sm">Approved</div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-4">
                <div className="text-2xl font-bold text-sage">{donorSubmissionStats.converted}</div>
                <div className="text-gray-500 text-sm">Added to Auction</div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-4">
                <div className="text-2xl font-bold text-red-600">{donorSubmissionStats.rejected}</div>
                <div className="text-gray-500 text-sm">Rejected</div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {(['all', 'pending', 'approved', 'rejected'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setDonorSubmissionFilter(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  donorSubmissionFilter === status
                    ? 'bg-sage text-white'
                    : 'bg-sage/10 text-charcoal hover:bg-sage/20'
                }`}
              >
                {status === 'all' ? 'All Donations' : status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>

          {/* Submissions List */}
          {donorSubmissionsLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sage"></div>
            </div>
          ) : donorSubmissions.length === 0 ? (
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
                  d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"
                />
              </svg>
              <h2 className="text-xl font-semibold text-charcoal mb-2">No donations yet</h2>
              <p className="text-gray-500 mb-4">
                {donationSettings?.code
                  ? 'Share your donation link to start receiving item donations'
                  : 'Enable donations to start accepting items from donors'}
              </p>
              {!donationSettings?.code && (
                <button
                  onClick={handleGenerateDonationCode}
                  className="inline-block bg-sage text-white px-6 py-3 rounded-xl font-semibold hover:bg-sage/90"
                >
                  Enable Donations
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-sage/20 overflow-hidden">
              <table className="w-full">
                <thead className="bg-sage/10">
                  <tr>
                    <th className="text-left px-6 py-3 text-sm font-medium text-charcoal">Item</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-charcoal">Donor</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-charcoal">Est. Value</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-charcoal">Status</th>
                    <th className="text-right px-6 py-3 text-sm font-medium text-charcoal">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sage/10">
                  {donorSubmissions.map((submission) => (
                    <tr key={submission.id}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {submission.primaryImageUrl ? (
                            <img
                              src={submission.primaryImageUrl}
                              alt={submission.name}
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
                            <div className="font-medium text-charcoal">{submission.name}</div>
                            {submission.description && (
                              <div className="text-sm text-gray-500 truncate max-w-xs">
                                {submission.description}
                              </div>
                            )}
                            {submission.condition && (
                              <div className="text-xs text-gray-400 mt-1">
                                Condition: {submission.condition}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm">
                          {submission.donor.anonymous ? (
                            <span className="text-gray-400 italic">Anonymous</span>
                          ) : (
                            <>
                              <div className="text-charcoal">{submission.donor.name || 'Unknown'}</div>
                              {submission.donor.email && (
                                <div className="text-gray-500 text-xs">{submission.donor.email}</div>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-charcoal">
                          {submission.estimatedValue ? `$${submission.estimatedValue.toLocaleString()}` : '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          submission.status === 'pending' ? 'bg-purple-100 text-purple-800' :
                          submission.status === 'approved' ? 'bg-green-100 text-green-800' :
                          submission.status === 'rejected' ? 'bg-red-100 text-red-800' :
                          submission.status === 'converted' ? 'bg-sage/20 text-sage' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {submission.status === 'converted' ? 'In Auction' : submission.status.charAt(0).toUpperCase() + submission.status.slice(1)}
                        </span>
                        {submission.rejectionReason && (
                          <div className="text-xs text-gray-500 mt-1 max-w-xs truncate">
                            {submission.rejectionReason}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {submission.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApproveSubmission(submission.id)}
                                className="text-green-600 hover:underline text-sm"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => setShowDonorRejectModal(submission.id)}
                                className="text-red-600 hover:underline text-sm"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {submission.status === 'approved' && !submission.eventItemId && (
                            <button
                              onClick={() => {
                                setShowConvertModal(submission.id)
                                setConvertModalData({
                                  startingBid: submission.estimatedValue ? String(Math.floor(submission.estimatedValue * 0.5)) : '',
                                  buyNowPrice: submission.estimatedValue ? String(submission.estimatedValue) : '',
                                })
                              }}
                              className="text-sage hover:underline text-sm font-medium"
                            >
                              Add to Auction
                            </button>
                          )}
                          {submission.eventItemId && (
                            <span className="text-gray-400 text-sm">Added</span>
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

      {/* Payments Tab (Self-Managed Payments) */}
      {activeTab === 'payments' && showPaymentsTab && (
        <div className="space-y-6">
          {/* Payment Info Banner */}
          <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg">
            <h3 className="font-medium mb-1">Self-Managed Payments</h3>
            <p className="text-sm">
              Winners will pay you directly using the payment method you specified. Track payments and fulfillment status below.
            </p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-4">
              <div className="text-2xl font-bold text-sage">{wonItems.length}</div>
              <div className="text-gray-500 text-sm">Items Won</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-4">
              <div className="text-2xl font-bold text-amber-600">{unpaidCount}</div>
              <div className="text-gray-500 text-sm">Awaiting Payment</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-4">
              <div className="text-2xl font-bold text-green-600">
                {wonItems.filter((i) => i.paymentStatus === 'paid').length}
              </div>
              <div className="text-gray-500 text-sm">Paid</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-4">
              <div className="text-2xl font-bold text-charcoal">{pendingFulfillmentCount}</div>
              <div className="text-gray-500 text-sm">Pending Fulfillment</div>
            </div>
          </div>

          {/* Payment Filters */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {(['all', 'pending', 'paid', 'payment_issue', 'waived', 'refunded'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setPaymentFilter(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  paymentFilter === status
                    ? 'bg-sage text-white'
                    : 'bg-sage/10 text-charcoal hover:bg-sage/20'
                }`}
              >
                {status === 'all' ? 'All Items' : status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                {status !== 'all' && (
                  <span className="ml-1 opacity-70">
                    ({wonItems.filter((i) => i.paymentStatus === status).length})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Won Items Table */}
          {wonItemsLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sage"></div>
            </div>
          ) : filteredWonItems.length === 0 ? (
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
                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z"
                />
              </svg>
              <h2 className="text-xl font-semibold text-charcoal mb-2">No won items</h2>
              <p className="text-gray-500">
                {paymentFilter === 'all'
                  ? 'No items have been won yet'
                  : `No items with ${paymentFilter.replace('_', ' ')} payment status`}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-sage/20 overflow-hidden">
              <table className="w-full">
                <thead className="bg-sage/10">
                  <tr>
                    <th className="text-left px-6 py-3 text-sm font-medium text-charcoal">Item</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-charcoal">Winner</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-charcoal">Amount</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-charcoal">Payment</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-charcoal">Fulfillment</th>
                    <th className="text-right px-6 py-3 text-sm font-medium text-charcoal">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sage/10">
                  {filteredWonItems.map((item) => (
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
                          <div className="font-medium text-charcoal">{item.title}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-charcoal">{item.winnerName || 'Unknown'}</div>
                        {item.winnerEmail && (
                          <div className="text-xs text-gray-500">{item.winnerEmail}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-charcoal">
                          ${item.winningBid?.toLocaleString() || '0'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${paymentStatusColors[item.paymentStatus || 'pending']}`}>
                          {(item.paymentStatus || 'pending').replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </span>
                        {item.paymentMethodUsed && (
                          <div className="text-xs text-gray-500 mt-1">{item.paymentMethodUsed}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${fulfillmentStatusColors[item.fulfillmentStatus || 'pending']}`}>
                          {(item.fulfillmentStatus || 'pending').replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </span>
                        {item.trackingNumber && (
                          <div className="text-xs text-gray-500 mt-1">
                            {item.trackingCarrier}: {item.trackingNumber}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setShowPaymentModal(item.id)
                              setPaymentModalData({
                                status: item.paymentStatus || 'pending',
                                methodUsed: item.paymentMethodUsed || '',
                                notes: item.paymentNotes || '',
                              })
                            }}
                            className="text-sage hover:underline text-sm"
                          >
                            Payment
                          </button>
                          <button
                            onClick={() => {
                              setShowFulfillmentModal(item.id)
                              setFulfillmentModalData({
                                status: item.fulfillmentStatus || 'pending',
                                type: item.fulfillmentType,
                                trackingNumber: item.trackingNumber || '',
                                trackingCarrier: item.trackingCarrier || '',
                                notes: item.fulfillmentNotes || '',
                              })
                            }}
                            className="text-indigo-600 hover:underline text-sm"
                          >
                            Fulfillment
                          </button>
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

      {/* Payment Status Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-charcoal mb-4">Update Payment Status</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Payment Status</label>
                <select
                  value={paymentModalData.status}
                  onChange={(e) => setPaymentModalData((prev) => ({ ...prev, status: e.target.value as ItemPaymentStatus }))}
                  className="w-full px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
                >
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="payment_issue">Payment Issue</option>
                  <option value="waived">Waived</option>
                  <option value="refunded">Refunded</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Payment Method Used</label>
                <input
                  type="text"
                  value={paymentModalData.methodUsed}
                  onChange={(e) => setPaymentModalData((prev) => ({ ...prev, methodUsed: e.target.value }))}
                  className="w-full px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
                  placeholder="e.g., Venmo, PayPal, Cash..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Notes (optional)</label>
                <textarea
                  rows={2}
                  value={paymentModalData.notes}
                  onChange={(e) => setPaymentModalData((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
                  placeholder="Any additional notes..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-4 mt-6">
              <button
                onClick={() => {
                  setShowPaymentModal(null)
                  setPaymentModalData({ status: 'paid', methodUsed: '', notes: '' })
                }}
                className="px-4 py-2 border border-sage/30 rounded-lg hover:bg-sage/10"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdatePaymentStatus}
                className="bg-sage text-white px-4 py-2 rounded-lg hover:bg-sage/90"
              >
                Update Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fulfillment Status Modal */}
      {showFulfillmentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-charcoal mb-4">Update Fulfillment Status</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Fulfillment Status</label>
                <select
                  value={fulfillmentModalData.status}
                  onChange={(e) => setFulfillmentModalData((prev) => ({ ...prev, status: e.target.value as ItemFulfillmentStatus }))}
                  className="w-full px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
                >
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="ready_for_pickup">Ready for Pickup</option>
                  <option value="shipped">Shipped</option>
                  <option value="out_for_delivery">Out for Delivery</option>
                  <option value="delivered">Delivered</option>
                  <option value="picked_up">Picked Up</option>
                  <option value="issue">Issue</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Fulfillment Type</label>
                <select
                  value={fulfillmentModalData.type || ''}
                  onChange={(e) => setFulfillmentModalData((prev) => ({ ...prev, type: e.target.value as 'shipping' | 'pickup' | 'digital' | undefined }))}
                  className="w-full px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
                >
                  <option value="">Select type...</option>
                  <option value="pickup">Pickup</option>
                  <option value="shipping">Shipping</option>
                  <option value="digital">Digital</option>
                </select>
              </div>
              {fulfillmentModalData.type === 'shipping' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1">Tracking Number</label>
                    <input
                      type="text"
                      value={fulfillmentModalData.trackingNumber}
                      onChange={(e) => setFulfillmentModalData((prev) => ({ ...prev, trackingNumber: e.target.value }))}
                      className="w-full px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
                      placeholder="Tracking number..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1">Carrier</label>
                    <input
                      type="text"
                      value={fulfillmentModalData.trackingCarrier}
                      onChange={(e) => setFulfillmentModalData((prev) => ({ ...prev, trackingCarrier: e.target.value }))}
                      className="w-full px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
                      placeholder="e.g., USPS, UPS, FedEx..."
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Notes (optional)</label>
                <textarea
                  rows={2}
                  value={fulfillmentModalData.notes}
                  onChange={(e) => setFulfillmentModalData((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
                  placeholder="Any additional notes..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-4 mt-6">
              <button
                onClick={() => {
                  setShowFulfillmentModal(null)
                  setFulfillmentModalData({ status: 'delivered', trackingNumber: '', trackingCarrier: '', notes: '' })
                }}
                className="px-4 py-2 border border-sage/30 rounded-lg hover:bg-sage/10"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateFulfillmentStatus}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
              >
                Update Fulfillment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Donor Reject Modal */}
      {showDonorRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-charcoal mb-4">Reject Donation</h2>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">Reason (optional)</label>
              <textarea
                rows={3}
                value={donorRejectReason}
                onChange={(e) => setDonorRejectReason(e.target.value)}
                className="w-full px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
                placeholder="Explain why this donation is being rejected..."
              />
            </div>
            <div className="flex justify-end gap-4 mt-6">
              <button
                onClick={() => {
                  setShowDonorRejectModal(null)
                  setDonorRejectReason('')
                }}
                className="px-4 py-2 border border-sage/30 rounded-lg hover:bg-sage/10"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectSubmission}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
              >
                Reject Donation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert to Auction Item Modal */}
      {showConvertModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-charcoal mb-4">Add to Auction</h2>
            <p className="text-sm text-gray-500 mb-4">
              Set the starting bid and optional buy-now price for this item.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Starting Bid *</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={convertModalData.startingBid}
                    onChange={(e) => setConvertModalData((prev) => ({ ...prev, startingBid: e.target.value }))}
                    className="w-full pl-8 pr-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
                    placeholder="10.00"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Buy Now Price (optional)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={convertModalData.buyNowPrice}
                    onChange={(e) => setConvertModalData((prev) => ({ ...prev, buyNowPrice: e.target.value }))}
                    className="w-full pl-8 pr-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
                    placeholder="50.00"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-4 mt-6">
              <button
                onClick={() => {
                  setShowConvertModal(null)
                  setConvertModalData({ startingBid: '', buyNowPrice: '' })
                }}
                className="px-4 py-2 border border-sage/30 rounded-lg hover:bg-sage/10"
              >
                Cancel
              </button>
              <button
                onClick={handleConvertSubmission}
                disabled={!convertModalData.startingBid || parseFloat(convertModalData.startingBid) <= 0}
                className="bg-sage text-white px-4 py-2 rounded-lg hover:bg-sage/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add to Auction
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Donation Settings Modal */}
      {showDonationSettingsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-charcoal mb-4">Donation Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Donation Link</label>
                <input
                  type="text"
                  readOnly
                  value={donationSettings?.code ? `${window.location.origin}/donate/${donationSettings.code}` : ''}
                  className="w-full px-4 py-2 border border-sage/30 rounded-lg bg-gray-50 font-mono text-sm"
                />
              </div>
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
                <strong>Note:</strong> More donation settings (instructions, required fields, etc.) can be configured in the event settings.
              </div>
            </div>
            <div className="flex justify-end gap-4 mt-6">
              <button
                onClick={() => setShowDonationSettingsModal(false)}
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
