import { useState, useEffect } from 'react'
import { apiClient } from '../../services/api'
import type { Feedback, FeedbackResponse, FeedbackStats, FeedbackStatus, FeedbackType, FeedbackPriority } from '../../types'

export default function AdminFeedbackReview() {
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [stats, setStats] = useState<FeedbackStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<FeedbackType | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<FeedbackPriority | 'all'>('all')

  // Selected feedback
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null)
  const [responses, setResponses] = useState<FeedbackResponse[]>([])

  // Response input
  const [responseText, setResponseText] = useState('')
  const [isInternalNote, setIsInternalNote] = useState(false)
  const [submittingResponse, setSubmittingResponse] = useState(false)

  // Status/priority update
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    fetchData()
  }, [statusFilter, typeFilter, priorityFilter])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [feedbackData, statsData] = await Promise.all([
        apiClient.getAllFeedback({
          status: statusFilter !== 'all' ? statusFilter : undefined,
          type: typeFilter !== 'all' ? typeFilter : undefined,
          priority: priorityFilter !== 'all' ? priorityFilter : undefined,
          limit: 50,
        }),
        apiClient.getFeedbackStats(),
      ])

      setFeedback(feedbackData.data)
      setStats(statsData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const fetchFeedbackDetails = async (id: string) => {
    try {
      const data = await apiClient.getFeedback(id)
      setSelectedFeedback(data)
      setResponses(data.responses || [])
    } catch (err) {
      console.error('Failed to fetch feedback details:', err)
    }
  }

  const handleStatusChange = async (newStatus: FeedbackStatus) => {
    if (!selectedFeedback) return
    setUpdating(true)
    try {
      await apiClient.updateFeedback(selectedFeedback.id, { status: newStatus })
      setSelectedFeedback({ ...selectedFeedback, status: newStatus })
      await fetchData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setUpdating(false)
    }
  }

  const handlePriorityChange = async (newPriority: FeedbackPriority) => {
    if (!selectedFeedback) return
    setUpdating(true)
    try {
      await apiClient.updateFeedback(selectedFeedback.id, { priority: newPriority })
      setSelectedFeedback({ ...selectedFeedback, priority: newPriority })
      await fetchData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update priority')
    } finally {
      setUpdating(false)
    }
  }

  const handleSubmitResponse = async () => {
    if (!selectedFeedback || !responseText.trim()) return
    setSubmittingResponse(true)
    try {
      if (isInternalNote) {
        await apiClient.addInternalNote(selectedFeedback.id, responseText)
      } else {
        await apiClient.addFeedbackResponse(selectedFeedback.id, responseText)
      }
      await fetchFeedbackDetails(selectedFeedback.id)
      setResponseText('')
      setIsInternalNote(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to submit response')
    } finally {
      setSubmittingResponse(false)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusBadge = (status: FeedbackStatus) => {
    const styles: Record<FeedbackStatus, string> = {
      new: 'bg-blue-100 text-blue-700',
      under_review: 'bg-yellow-100 text-yellow-700',
      planned: 'bg-purple-100 text-purple-700',
      in_progress: 'bg-orange-100 text-orange-700',
      completed: 'bg-green-100 text-green-700',
      wont_fix: 'bg-gray-100 text-gray-700',
      duplicate: 'bg-gray-100 text-gray-500',
    }
    const labels: Record<FeedbackStatus, string> = {
      new: 'New',
      under_review: 'Under Review',
      planned: 'Planned',
      in_progress: 'In Progress',
      completed: 'Completed',
      wont_fix: "Won't Fix",
      duplicate: 'Duplicate',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    )
  }

  const getTypeBadge = (type: FeedbackType) => {
    const styles: Record<FeedbackType, string> = {
      bug: 'bg-red-100 text-red-700',
      feature: 'bg-green-100 text-green-700',
      improvement: 'bg-blue-100 text-blue-700',
      question: 'bg-purple-100 text-purple-700',
      other: 'bg-gray-100 text-gray-700',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[type]}`}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </span>
    )
  }

  const getPriorityBadge = (priority: FeedbackPriority) => {
    const styles: Record<FeedbackPriority, string> = {
      low: 'bg-gray-100 text-gray-600',
      medium: 'bg-blue-100 text-blue-700',
      high: 'bg-orange-100 text-orange-700',
      critical: 'bg-red-100 text-red-700',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[priority]}`}>
        {priority.charAt(0).toUpperCase() + priority.slice(1)}
      </span>
    )
  }

  return (
    <div className="flex h-full">
      {/* Main list */}
      <div className={`${selectedFeedback ? 'w-1/2 border-r border-gray-200 pr-4' : 'w-full'}`}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-charcoal">Feedback</h2>
            <p className="text-gray-500">Manage user feedback and requests</p>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-lg p-3 shadow-sm text-center">
              <p className="text-xl font-bold text-charcoal">{stats.total}</p>
              <p className="text-xs text-gray-500">Total</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 shadow-sm text-center border border-blue-100">
              <p className="text-xl font-bold text-blue-700">{stats.new_count}</p>
              <p className="text-xs text-blue-600">New</p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-3 shadow-sm text-center border border-yellow-100">
              <p className="text-xl font-bold text-yellow-700">{stats.under_review_count}</p>
              <p className="text-xs text-yellow-600">Under Review</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3 shadow-sm text-center border border-green-100">
              <p className="text-xl font-bold text-green-700">{stats.completed_count}</p>
              <p className="text-xs text-green-600">Completed</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <div className="flex flex-wrap gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as FeedbackStatus | 'all')}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sage focus:border-sage"
            >
              <option value="all">All Statuses</option>
              <option value="new">New</option>
              <option value="under_review">Under Review</option>
              <option value="planned">Planned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="wont_fix">Won't Fix</option>
              <option value="duplicate">Duplicate</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as FeedbackType | 'all')}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sage focus:border-sage"
            >
              <option value="all">All Types</option>
              <option value="bug">Bug</option>
              <option value="feature">Feature</option>
              <option value="improvement">Improvement</option>
              <option value="question">Question</option>
              <option value="other">Other</option>
            </select>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as FeedbackPriority | 'all')}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sage focus:border-sage"
            >
              <option value="all">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
            Loading feedback...
          </div>
        ) : feedback.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
            No feedback found.
          </div>
        ) : (
          <div className="space-y-2">
            {feedback.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedFeedback(item)
                  fetchFeedbackDetails(item.id)
                }}
                className={`w-full text-left bg-white rounded-lg shadow-sm p-4 hover:shadow transition-shadow ${
                  selectedFeedback?.id === item.id ? 'ring-2 ring-sage' : ''
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-medium text-charcoal line-clamp-1">{item.title}</h4>
                  <div className="flex gap-2 ml-2 flex-shrink-0">
                    {getTypeBadge(item.feedback_type)}
                    {getStatusBadge(item.status)}
                  </div>
                </div>
                <p className="text-sm text-gray-500 line-clamp-2 mb-2">{item.description}</p>
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>{item.user_email || 'Anonymous'}</span>
                  <span>{formatDate(item.created_at)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedFeedback && (
        <div className="w-1/2 pl-4">
          <div className="bg-white rounded-lg shadow-sm h-full flex flex-col">
            {/* Header */}
            <div className="p-4 border-b flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  {getTypeBadge(selectedFeedback.feedback_type)}
                  {getPriorityBadge(selectedFeedback.priority)}
                </div>
                <h3 className="text-lg font-semibold text-charcoal">{selectedFeedback.title}</h3>
                <p className="text-sm text-gray-500">
                  {selectedFeedback.user_email || 'Anonymous'} - {formatDate(selectedFeedback.created_at)}
                </p>
              </div>
              <button
                onClick={() => setSelectedFeedback(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Controls */}
            <div className="p-4 border-b bg-gray-50">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                  <select
                    value={selectedFeedback.status}
                    onChange={(e) => handleStatusChange(e.target.value as FeedbackStatus)}
                    disabled={updating}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  >
                    <option value="new">New</option>
                    <option value="under_review">Under Review</option>
                    <option value="planned">Planned</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="wont_fix">Won't Fix</option>
                    <option value="duplicate">Duplicate</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
                  <select
                    value={selectedFeedback.priority}
                    onChange={(e) => handlePriorityChange(e.target.value as FeedbackPriority)}
                    disabled={updating}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="p-4 border-b">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Description</h4>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{selectedFeedback.description}</p>
            </div>

            {/* Responses */}
            <div className="flex-1 overflow-y-auto p-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3">
                Responses ({responses.length})
              </h4>
              {responses.length === 0 ? (
                <p className="text-sm text-gray-400">No responses yet.</p>
              ) : (
                <div className="space-y-3">
                  {responses.map((response) => (
                    <div
                      key={response.id}
                      className={`p-3 rounded-lg text-sm ${
                        response.is_internal
                          ? 'bg-yellow-50 border border-yellow-200'
                          : response.is_admin
                          ? 'bg-blue-50 border border-blue-200'
                          : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-700">
                          {response.is_admin ? 'Admin' : 'User'}
                          {response.is_internal && ' (Internal Note)'}
                        </span>
                        <span className="text-xs text-gray-400">{formatDate(response.created_at)}</span>
                      </div>
                      <p className="text-gray-600">{response.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Response input */}
            <div className="p-4 border-t bg-gray-50">
              <textarea
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                placeholder={isInternalNote ? 'Add internal note...' : 'Write a response...'}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-2"
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={isInternalNote}
                    onChange={(e) => setIsInternalNote(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Internal note (not visible to user)
                </label>
                <button
                  onClick={handleSubmitResponse}
                  disabled={!responseText.trim() || submittingResponse}
                  className="px-4 py-2 bg-sage text-white rounded-lg text-sm font-medium hover:bg-sage/90 disabled:opacity-50"
                >
                  {submittingResponse ? 'Sending...' : 'Send Response'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
