import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiClient } from '../services/api'
import { useAuth } from '../auth/useAuth'
import type { Feedback, FeedbackType, FeedbackStatus } from '../types'

const FEEDBACK_TYPES: { value: FeedbackType; label: string; description: string }[] = [
  { value: 'feature', label: 'Feature Request', description: 'Suggest a new feature or capability' },
  { value: 'improvement', label: 'Improvement', description: 'Enhance an existing feature' },
  { value: 'bug', label: 'Bug Report', description: 'Report something that is broken' },
  { value: 'question', label: 'Question', description: 'Ask about how something works' },
  { value: 'other', label: 'Other', description: 'General feedback or comments' },
]

const STATUS_LABELS: Record<FeedbackStatus, { label: string; color: string }> = {
  new: { label: 'New', color: 'bg-blue-100 text-blue-800' },
  under_review: { label: 'Under Review', color: 'bg-yellow-100 text-yellow-800' },
  planned: { label: 'Planned', color: 'bg-purple-100 text-purple-800' },
  in_progress: { label: 'In Progress', color: 'bg-orange-100 text-orange-800' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800' },
  wont_fix: { label: "Won't Fix", color: 'bg-gray-100 text-gray-800' },
  duplicate: { label: 'Duplicate', color: 'bg-gray-100 text-gray-800' },
}

export default function FeedbackPage() {
  const { isAuthenticated } = useAuth()
  const [searchParams] = useSearchParams()

  const [activeTab, setActiveTab] = useState<'submit' | 'my'>('submit')
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('feature')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // My feedback state
  const [myFeedback, setMyFeedback] = useState<Feedback[]>([])
  const [loadingFeedback, setLoadingFeedback] = useState(false)

  // Selected feedback for detail view
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null)
  const [newResponse, setNewResponse] = useState('')
  const [submittingResponse, setSubmittingResponse] = useState(false)

  // Get context from URL params
  const organizationId = searchParams.get('organizationId') || undefined
  const eventId = searchParams.get('eventId') || undefined
  const contextName = searchParams.get('contextName') || undefined

  useEffect(() => {
    if (activeTab === 'my' && isAuthenticated) {
      loadMyFeedback()
    }
  }, [activeTab, isAuthenticated])

  const loadMyFeedback = async () => {
    setLoadingFeedback(true)
    try {
      const result = await apiClient.getMyFeedback({ limit: 50 })
      setMyFeedback(result.data)
    } catch (err) {
      console.error('Failed to load feedback:', err)
    } finally {
      setLoadingFeedback(false)
    }
  }

  const loadFeedbackDetail = async (id: string) => {
    try {
      const feedback = await apiClient.getFeedback(id)
      setSelectedFeedback(feedback)
    } catch (err) {
      console.error('Failed to load feedback detail:', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !description.trim()) return

    setIsSubmitting(true)
    setError(null)

    try {
      await apiClient.submitFeedback({
        feedbackType,
        title: title.trim(),
        description: description.trim(),
        organizationId,
        eventId,
      })
      setSubmitSuccess(true)
      setTitle('')
      setDescription('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit feedback')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddResponse = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFeedback || !newResponse.trim()) return

    setSubmittingResponse(true)
    try {
      await apiClient.addFeedbackResponse(selectedFeedback.id, newResponse.trim())
      setNewResponse('')
      // Reload the feedback to get the new response
      await loadFeedbackDetail(selectedFeedback.id)
    } catch (err) {
      console.error('Failed to add response:', err)
    } finally {
      setSubmittingResponse(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-clay-bg flex items-center justify-center">
        <div className="clay-card p-8 text-center max-w-md">
          <h2 className="text-xl font-bold text-white mb-4">Sign in Required</h2>
          <p className="text-white/70 mb-6">
            Please sign in to submit feedback or view your submissions.
          </p>
          <Link to="/" className="clay-button bg-sage text-white font-bold">
            Go Home
          </Link>
        </div>
      </div>
    )
  }

  // Detail view
  if (selectedFeedback) {
    return (
      <div className="min-h-screen bg-clay-bg">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <button
            onClick={() => setSelectedFeedback(null)}
            className="flex items-center gap-2 text-white/70 hover:text-white mb-6"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to My Feedback
          </button>

          <div className="clay-card p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${STATUS_LABELS[selectedFeedback.status].color}`}>
                  {STATUS_LABELS[selectedFeedback.status].label}
                </span>
                <span className="ml-2 text-sm text-white/70 capitalize">
                  {selectedFeedback.feedback_type.replace('_', ' ')}
                </span>
              </div>
              <span className="text-sm text-white/70">
                {new Date(selectedFeedback.created_at).toLocaleDateString()}
              </span>
            </div>

            <h1 className="text-2xl font-bold text-white mb-4">{selectedFeedback.title}</h1>
            <p className="text-white/70 whitespace-pre-wrap mb-6">{selectedFeedback.description}</p>

            {selectedFeedback.resolution_notes && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-green-800 mb-2">Resolution</h3>
                <p className="text-green-700">{selectedFeedback.resolution_notes}</p>
              </div>
            )}

            {/* Responses */}
            <div className="border-t pt-6">
              <h3 className="font-semibold text-white mb-4">
                Responses ({selectedFeedback.responses?.length || 0})
              </h3>

              {selectedFeedback.responses?.map((response) => (
                <div
                  key={response.id}
                  className={`mb-4 p-4 rounded-lg ${
                    response.is_admin ? 'bg-sage/10 border border-sage/20' : 'bg-clay-surface'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-white">
                      {response.responder_name}
                      {response.is_admin && (
                        <span className="ml-2 text-xs bg-sage text-white px-2 py-0.5 rounded">
                          Team
                        </span>
                      )}
                    </span>
                    <span className="text-sm text-white/70">
                      {new Date(response.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-white/70 whitespace-pre-wrap">{response.message}</p>
                </div>
              ))}

              {/* Add response form */}
              <form onSubmit={handleAddResponse} className="mt-4">
                <textarea
                  value={newResponse}
                  onChange={(e) => setNewResponse(e.target.value)}
                  placeholder="Add a response..."
                  className="clay-input w-full h-24 resize-none"
                />
                <div className="flex justify-end mt-2">
                  <button
                    type="submit"
                    disabled={submittingResponse || !newResponse.trim()}
                    className="clay-button bg-sage text-white font-bold disabled:opacity-50"
                  >
                    {submittingResponse ? 'Sending...' : 'Send Response'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-clay-bg">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Feedback & Feature Requests</h1>
          <p className="text-white/70">
            Help us improve! Submit bug reports, feature requests, or general feedback.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('submit')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'submit'
                ? 'bg-sage text-white'
                : 'bg-clay-surface text-white/70 hover:bg-clay-mint'
            }`}
          >
            Submit Feedback
          </button>
          <button
            onClick={() => setActiveTab('my')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'my'
                ? 'bg-sage text-white'
                : 'bg-clay-surface text-white/70 hover:bg-clay-mint'
            }`}
          >
            My Submissions
          </button>
        </div>

        {activeTab === 'submit' ? (
          submitSuccess ? (
            <div className="clay-card p-8 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Thank you for your feedback!</h2>
              <p className="text-white/70 mb-6">
                We appreciate you taking the time to help us improve. We'll review your submission and may follow up if we have questions.
              </p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => setSubmitSuccess(false)}
                  className="clay-button bg-sage text-white font-bold"
                >
                  Submit Another
                </button>
                <button
                  onClick={() => {
                    setSubmitSuccess(false)
                    setActiveTab('my')
                    loadMyFeedback()
                  }}
                  className="clay-button bg-clay-surface text-white font-bold"
                >
                  View My Submissions
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="clay-card p-6">
              {contextName && (
                <div className="bg-clay-mint/50 rounded-lg p-3 mb-6">
                  <p className="text-sm text-white">
                    <span className="font-medium">Context:</span> {contextName}
                  </p>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
                  {error}
                </div>
              )}

              {/* Feedback Type */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-white mb-3">
                  What type of feedback is this?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {FEEDBACK_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setFeedbackType(type.value)}
                      className={`text-left p-3 rounded-lg border-2 transition-all ${
                        feedbackType === type.value
                          ? 'border-sage bg-sage/5'
                          : 'border-transparent bg-clay-surface hover:bg-clay-mint/50'
                      }`}
                    >
                      <span className="font-medium text-white block">{type.label}</span>
                      <span className="text-sm text-white/70">{type.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-white mb-2">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Brief summary of your feedback"
                  className="clay-input w-full"
                  required
                  minLength={5}
                  maxLength={255}
                />
                <p className="text-xs text-white/70 mt-1">{title.length}/255 characters</p>
              </div>

              {/* Description */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-white mb-2">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    feedbackType === 'bug'
                      ? 'Please describe the issue, what you expected to happen, and steps to reproduce...'
                      : feedbackType === 'feature'
                        ? 'Describe the feature you would like and how it would help you...'
                        : 'Please provide as much detail as possible...'
                  }
                  className="clay-input w-full h-40 resize-none"
                  required
                  minLength={20}
                  maxLength={5000}
                />
                <p className="text-xs text-white/70 mt-1">{description.length}/5000 characters (minimum 20)</p>
              </div>

              {/* Submit */}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting || title.length < 5 || description.length < 20}
                  className="clay-button bg-sage text-white font-bold px-8 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
                </button>
              </div>
            </form>
          )
        ) : (
          <div className="clay-card p-6">
            {loadingFeedback ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sage mx-auto"></div>
                <p className="text-white/70 mt-4">Loading your feedback...</p>
              </div>
            ) : myFeedback.length === 0 ? (
              <div className="text-center py-8">
                <svg className="w-16 h-16 text-white/70/30 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-white/70 mb-4">You haven't submitted any feedback yet.</p>
                <button
                  onClick={() => setActiveTab('submit')}
                  className="clay-button bg-sage text-white font-bold"
                >
                  Submit Your First Feedback
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {myFeedback.map((feedback) => (
                  <button
                    key={feedback.id}
                    onClick={() => loadFeedbackDetail(feedback.id)}
                    className="w-full text-left p-4 bg-clay-surface hover:bg-clay-mint/50 rounded-lg transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_LABELS[feedback.status].color}`}>
                          {STATUS_LABELS[feedback.status].label}
                        </span>
                        <span className="text-xs text-white/70 capitalize">
                          {feedback.feedback_type.replace('_', ' ')}
                        </span>
                      </div>
                      <span className="text-xs text-white/70">
                        {new Date(feedback.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <h3 className="font-medium text-white mb-1">{feedback.title}</h3>
                    <p className="text-sm text-white/70 line-clamp-2">{feedback.description}</p>
                    {(feedback.response_count ?? 0) > 0 && (
                      <p className="text-xs text-sage mt-2">
                        {feedback.response_count} response{(feedback.response_count ?? 0) !== 1 ? 's' : ''}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
