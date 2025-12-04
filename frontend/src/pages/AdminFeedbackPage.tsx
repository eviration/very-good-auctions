import { useState, useEffect } from 'react'
import { apiClient } from '../services/api'
import type { Feedback, FeedbackStats, FeedbackStatus, FeedbackPriority, FeedbackType } from '../types'
import { useAuthStore } from '../hooks/useAuthStore'
import { Navigate } from 'react-router-dom'

const STATUS_OPTIONS: { value: FeedbackStatus; label: string; color: string }[] = [
  { value: 'new', label: 'New', color: 'bg-blue-100 text-blue-800' },
  { value: 'under_review', label: 'Under Review', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'planned', label: 'Planned', color: 'bg-purple-100 text-purple-800' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-orange-100 text-orange-800' },
  { value: 'completed', label: 'Completed', color: 'bg-green-100 text-green-800' },
  { value: 'wont_fix', label: "Won't Fix", color: 'bg-gray-100 text-gray-800' },
  { value: 'duplicate', label: 'Duplicate', color: 'bg-gray-100 text-gray-800' },
]

const PRIORITY_OPTIONS: { value: FeedbackPriority; label: string; color: string }[] = [
  { value: 'low', label: 'Low', color: 'bg-gray-100 text-gray-600' },
  { value: 'medium', label: 'Medium', color: 'bg-blue-100 text-blue-700' },
  { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-700' },
  { value: 'critical', label: 'Critical', color: 'bg-red-100 text-red-700' },
]

const TYPE_OPTIONS: { value: FeedbackType | 'all'; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: 'bug', label: 'Bug Report' },
  { value: 'feature', label: 'Feature Request' },
  { value: 'improvement', label: 'Improvement' },
  { value: 'question', label: 'Question' },
  { value: 'other', label: 'Other' },
]

export default function AdminFeedbackPage() {
  const { user } = useAuthStore()
  const [feedbackList, setFeedbackList] = useState<Feedback[]>([])
  const [stats, setStats] = useState<FeedbackStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Admin status check
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [adminCheckLoading, setAdminCheckLoading] = useState(true)

  // Filters
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<FeedbackType | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<FeedbackPriority | 'all'>('all')

  // Selected feedback for detail view
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null)
  const [responseText, setResponseText] = useState('')
  const [isInternalNote, setIsInternalNote] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Check admin access on mount
  useEffect(() => {
    async function checkAdmin() {
      if (!user) {
        setIsAdmin(false)
        setAdminCheckLoading(false)
        return
      }
      try {
        const result = await apiClient.checkPlatformAdminStatus()
        setIsAdmin(result.isPlatformAdmin)
      } catch {
        setIsAdmin(false)
      } finally {
        setAdminCheckLoading(false)
      }
    }
    checkAdmin()
  }, [user])

  useEffect(() => {
    if (isAdmin) {
      fetchData()
    }
  }, [statusFilter, typeFilter, priorityFilter, isAdmin])

  const fetchData = async () => {
    try {
      setLoading(true)
      const params: Record<string, string> = {}
      if (statusFilter !== 'all') params.status = statusFilter
      if (typeFilter !== 'all') params.type = typeFilter
      if (priorityFilter !== 'all') params.priority = priorityFilter

      const [feedbackResponse, statsData] = await Promise.all([
        apiClient.getAllFeedback(params),
        apiClient.getFeedbackStats(),
      ])
      setFeedbackList(feedbackResponse.data)
      setStats(statsData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feedback')
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (feedbackId: string, status: FeedbackStatus) => {
    try {
      await apiClient.updateFeedback(feedbackId, { status })
      // Update local state
      setFeedbackList(prev =>
        prev.map(f => f.id === feedbackId ? { ...f, status } : f)
      )
      if (selectedFeedback?.id === feedbackId) {
        setSelectedFeedback(prev => prev ? { ...prev, status } : null)
      }
      // Refresh stats
      const statsData = await apiClient.getFeedbackStats()
      setStats(statsData)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  const handlePriorityChange = async (feedbackId: string, priority: FeedbackPriority) => {
    try {
      await apiClient.updateFeedback(feedbackId, { priority })
      // Update local state
      setFeedbackList(prev =>
        prev.map(f => f.id === feedbackId ? { ...f, priority } : f)
      )
      if (selectedFeedback?.id === feedbackId) {
        setSelectedFeedback(prev => prev ? { ...prev, priority } : null)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update priority')
    }
  }

  const handleAddResponse = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFeedback || !responseText.trim()) return

    setSubmitting(true)
    try {
      if (isInternalNote) {
        await apiClient.addInternalNote(selectedFeedback.id, responseText)
      } else {
        await apiClient.addFeedbackResponse(selectedFeedback.id, responseText)
      }
      // Refresh the selected feedback
      const updated = await apiClient.getFeedback(selectedFeedback.id)
      setSelectedFeedback(updated)
      setResponseText('')
      setIsInternalNote(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add response')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSelectFeedback = async (feedback: Feedback) => {
    try {
      const fullFeedback = await apiClient.getFeedback(feedback.id)
      setSelectedFeedback(fullFeedback)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to load feedback details')
    }
  }

  const getStatusBadge = (status: FeedbackStatus) => {
    const option = STATUS_OPTIONS.find(o => o.value === status)
    return option ? (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${option.color}`}>
        {option.label}
      </span>
    ) : null
  }

  const getPriorityBadge = (priority: FeedbackPriority) => {
    const option = PRIORITY_OPTIONS.find(o => o.value === priority)
    return option ? (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${option.color}`}>
        {option.label}
      </span>
    ) : null
  }

  const getTypeBadge = (type: FeedbackType) => {
    const colors: Record<FeedbackType, string> = {
      bug: 'bg-red-100 text-red-700',
      feature: 'bg-green-100 text-green-700',
      improvement: 'bg-blue-100 text-blue-700',
      question: 'bg-purple-100 text-purple-700',
      other: 'bg-gray-100 text-gray-700',
    }
    const labels: Record<FeedbackType, string> = {
      bug: 'Bug',
      feature: 'Feature',
      improvement: 'Improvement',
      question: 'Question',
      other: 'Other',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[type]}`}>
        {labels[type]}
      </span>
    )
  }

  // Show loading while checking admin status
  if (adminCheckLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Checking permissions...</div>
        </div>
      </div>
    )
  }

  // Redirect if not admin
  if (!isAdmin) {
    return <Navigate to="/" replace />
  }

  if (loading && feedbackList.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-48 mb-8"></div>
          <div className="grid grid-cols-4 gap-4 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-charcoal mb-8">Feedback Management</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-charcoal">{stats.total}</div>
            <div className="text-sm text-gray-500">Total</div>
          </div>
          <div className="bg-blue-50 rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-blue-700">{stats.new_count}</div>
            <div className="text-sm text-gray-500">New</div>
          </div>
          <div className="bg-yellow-50 rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-yellow-700">{stats.under_review_count}</div>
            <div className="text-sm text-gray-500">Under Review</div>
          </div>
          <div className="bg-purple-50 rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-purple-700">{stats.planned_count}</div>
            <div className="text-sm text-gray-500">Planned</div>
          </div>
          <div className="bg-orange-50 rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-orange-700">{stats.in_progress_count}</div>
            <div className="text-sm text-gray-500">In Progress</div>
          </div>
          <div className="bg-green-50 rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-green-700">{stats.completed_count}</div>
            <div className="text-sm text-gray-500">Completed</div>
          </div>
        </div>
      )}

      {/* Type Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-red-50 rounded-lg shadow p-4">
            <div className="text-xl font-bold text-red-700">{stats.bug_count}</div>
            <div className="text-sm text-gray-500">Bugs</div>
          </div>
          <div className="bg-green-50 rounded-lg shadow p-4">
            <div className="text-xl font-bold text-green-700">{stats.feature_count}</div>
            <div className="text-sm text-gray-500">Features</div>
          </div>
          <div className="bg-blue-50 rounded-lg shadow p-4">
            <div className="text-xl font-bold text-blue-700">{stats.improvement_count}</div>
            <div className="text-sm text-gray-500">Improvements</div>
          </div>
          <div className="bg-orange-50 rounded-lg shadow p-4">
            <div className="text-xl font-bold text-orange-700">
              {stats.critical_count + stats.high_priority_count}
            </div>
            <div className="text-sm text-gray-500">High Priority</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as FeedbackStatus | 'all')}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="all">All Statuses</option>
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as FeedbackType | 'all')}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value as FeedbackPriority | 'all')}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="all">All Priorities</option>
              {PRIORITY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Content - Split View */}
      <div className="flex gap-6">
        {/* Feedback List */}
        <div className="flex-1">
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="divide-y divide-gray-200">
              {feedbackList.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No feedback found matching your filters.
                </div>
              ) : (
                feedbackList.map(feedback => (
                  <div
                    key={feedback.id}
                    onClick={() => handleSelectFeedback(feedback)}
                    className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                      selectedFeedback?.id === feedback.id ? 'bg-sage/10 border-l-4 border-sage' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-medium text-charcoal line-clamp-1">{feedback.title}</h3>
                      <div className="flex gap-2 ml-2 flex-shrink-0">
                        {getTypeBadge(feedback.feedback_type)}
                        {getPriorityBadge(feedback.priority)}
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2 mb-2">{feedback.description}</p>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <div className="flex items-center gap-2">
                        <span>{feedback.user_name}</span>
                        {feedback.organization_name && (
                          <span className="text-gray-400">({feedback.organization_name})</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(feedback.status)}
                        <span>{new Date(feedback.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    {(feedback.vote_count ?? 0) > 0 && (
                      <div className="mt-2 text-xs text-gray-500">
                        {feedback.vote_count} vote{(feedback.vote_count ?? 0) !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Detail Panel */}
        {selectedFeedback && (
          <div className="w-96 bg-white rounded-lg shadow p-6 h-fit sticky top-4">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-xl font-bold text-charcoal">{selectedFeedback.title}</h2>
              <button
                onClick={() => setSelectedFeedback(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                &times;
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {getTypeBadge(selectedFeedback.feedback_type)}
              {getPriorityBadge(selectedFeedback.priority)}
              {getStatusBadge(selectedFeedback.status)}
            </div>

            <div className="text-sm text-gray-600 mb-4">
              <div><strong>From:</strong> {selectedFeedback.user_name} ({selectedFeedback.user_email})</div>
              {selectedFeedback.organization_name && (
                <div><strong>Organization:</strong> {selectedFeedback.organization_name}</div>
              )}
              {selectedFeedback.event_name && (
                <div><strong>Event:</strong> {selectedFeedback.event_name}</div>
              )}
              <div><strong>Submitted:</strong> {new Date(selectedFeedback.created_at).toLocaleString()}</div>
              {(selectedFeedback.vote_count ?? 0) > 0 && (
                <div><strong>Votes:</strong> {selectedFeedback.vote_count}</div>
              )}
            </div>

            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedFeedback.description}</p>
            </div>

            {/* Status & Priority Controls */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={selectedFeedback.status}
                  onChange={e => handleStatusChange(selectedFeedback.id, e.target.value as FeedbackStatus)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {STATUS_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select
                  value={selectedFeedback.priority}
                  onChange={e => handlePriorityChange(selectedFeedback.id, e.target.value as FeedbackPriority)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {PRIORITY_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Responses */}
            {selectedFeedback.responses && selectedFeedback.responses.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Responses</h3>
                <div className="space-y-3 max-h-48 overflow-y-auto">
                  {selectedFeedback.responses.map(response => (
                    <div
                      key={response.id}
                      className={`p-3 rounded-lg text-sm ${
                        response.is_internal
                          ? 'bg-yellow-50 border border-yellow-200'
                          : response.is_admin
                          ? 'bg-sage/10 border border-sage/20'
                          : 'bg-gray-50 border border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">
                          {response.responder_name}
                          {response.is_admin && ' (Admin)'}
                          {response.is_internal && ' - Internal Note'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(response.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-gray-700 whitespace-pre-wrap">{response.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add Response */}
            <form onSubmit={handleAddResponse}>
              <div className="mb-2">
                <textarea
                  value={responseText}
                  onChange={e => setResponseText(e.target.value)}
                  placeholder="Write a response..."
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isInternalNote}
                    onChange={e => setIsInternalNote(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Internal note (not visible to user)
                </label>
                <button
                  type="submit"
                  disabled={submitting || !responseText.trim()}
                  className="px-4 py-2 bg-sage text-white rounded-lg text-sm font-medium hover:bg-sage/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Sending...' : 'Send'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
