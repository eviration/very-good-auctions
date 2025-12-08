import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../services/api'
import { useAuth } from '../auth/useAuth'

interface Tester {
  id: string
  email: string
  name: string | null
  status: string
  role: string
  session_name: string | null
  feedback_count: number
  created_at: string
}

interface Feedback {
  id: string
  tester_email: string | null
  tester_name: string | null
  feedback_type: string
  title: string
  description: string
  status: string
  priority: string | null
  submitted_at: string
  session_name: string | null
}

interface TimeInfo {
  realTime: string
  effectiveTime: string
  isFrozen: boolean
  frozenAt: string | null
  offsetSeconds: number
  offsetHuman: string
}

export function UatAdminPage() {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'testers' | 'feedback' | 'time'>('testers')

  // Testers state
  const [testers, setTesters] = useState<Tester[]>([])
  const [testerCounts, setTesterCounts] = useState({ invited: 0, registered: 0, active: 0, inactive: 0, total: 0 })
  const [inviteEmails, setInviteEmails] = useState('')
  const [inviteRole, setInviteRole] = useState<'tester' | 'power_tester' | 'admin'>('tester')
  const [inviteMessage, setInviteMessage] = useState('')
  const [isInviting, setIsInviting] = useState(false)

  // Feedback state
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [feedbackCounts, setFeedbackCounts] = useState<{ byStatus: Record<string, number>; byType: Record<string, number>; total: number }>({ byStatus: {}, byType: {}, total: 0 })
  const [feedbackFilter, setFeedbackFilter] = useState<{ status?: string; type?: string }>({})

  // Time state
  const [timeInfo, setTimeInfo] = useState<TimeInfo | null>(null)
  const [offsetInput, setOffsetInput] = useState('')
  const [isUpdatingTime, setIsUpdatingTime] = useState(false)

  // Loading states
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    loadData()
  }, [isAuthenticated])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [testersData, feedbackData, timeData] = await Promise.all([
        apiClient.getUatTesters(),
        apiClient.getAllUatFeedback(),
        apiClient.getUatTime(),
      ])
      setTesters(testersData.testers)
      setTesterCounts(testersData.counts)
      setFeedback(feedbackData.feedback)
      setFeedbackCounts(feedbackData.counts)
      setTimeInfo(timeData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleInviteTesters = async () => {
    setIsInviting(true)
    try {
      const result = await apiClient.inviteUatTesters({
        emails: inviteEmails,
        role: inviteRole,
        message: inviteMessage || undefined,
      })
      if (result.success) {
        setInviteEmails('')
        setInviteMessage('')
        loadData()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite testers')
    } finally {
      setIsInviting(false)
    }
  }

  const handleResendInvite = async (testerId: string) => {
    try {
      await apiClient.resendUatInvitation(testerId)
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend invitation')
    }
  }

  const handleRemoveTester = async (testerId: string) => {
    if (!confirm('Are you sure you want to remove this tester?')) return
    try {
      await apiClient.removeUatTester(testerId)
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove tester')
    }
  }

  const handleSetTimeOffset = async () => {
    setIsUpdatingTime(true)
    try {
      await apiClient.setUatTimeOffset(offsetInput)
      setOffsetInput('')
      const timeData = await apiClient.getUatTime()
      setTimeInfo(timeData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set time offset')
    } finally {
      setIsUpdatingTime(false)
    }
  }

  const handleFreezeTime = async () => {
    setIsUpdatingTime(true)
    try {
      await apiClient.freezeUatTime()
      const timeData = await apiClient.getUatTime()
      setTimeInfo(timeData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to freeze time')
    } finally {
      setIsUpdatingTime(false)
    }
  }

  const handleUnfreezeTime = async () => {
    setIsUpdatingTime(true)
    try {
      await apiClient.unfreezeUatTime()
      const timeData = await apiClient.getUatTime()
      setTimeInfo(timeData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unfreeze time')
    } finally {
      setIsUpdatingTime(false)
    }
  }

  const handleResetTime = async () => {
    setIsUpdatingTime(true)
    try {
      await apiClient.resetUatTime()
      const timeData = await apiClient.getUatTime()
      setTimeInfo(timeData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset time')
    } finally {
      setIsUpdatingTime(false)
    }
  }

  const handleAdvanceTime = async (duration: string) => {
    setIsUpdatingTime(true)
    try {
      await apiClient.advanceUatTime(duration)
      const timeData = await apiClient.getUatTime()
      setTimeInfo(timeData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to advance time')
    } finally {
      setIsUpdatingTime(false)
    }
  }

  const handleUpdateFeedbackStatus = async (feedbackId: string, status: string) => {
    try {
      await apiClient.updateUatFeedback(feedbackId, { status })
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update feedback')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const getStatusBadgeClass = (status: string) => {
    const classes: Record<string, string> = {
      invited: 'bg-yellow-100 text-yellow-800',
      registered: 'bg-blue-100 text-blue-800',
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      new: 'bg-blue-100 text-blue-800',
      reviewed: 'bg-purple-100 text-purple-800',
      in_progress: 'bg-yellow-100 text-yellow-800',
      resolved: 'bg-green-100 text-green-800',
      wont_fix: 'bg-gray-100 text-gray-800',
      duplicate: 'bg-gray-100 text-gray-800',
    }
    return classes[status] || 'bg-gray-100 text-gray-800'
  }

  const getFeedbackTypeBadgeClass = (type: string) => {
    const classes: Record<string, string> = {
      bug: 'bg-red-100 text-red-800',
      suggestion: 'bg-blue-100 text-blue-800',
      question: 'bg-purple-100 text-purple-800',
      praise: 'bg-green-100 text-green-800',
      other: 'bg-gray-100 text-gray-800',
    }
    return classes[type] || 'bg-gray-100 text-gray-800'
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">Loading...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">UAT Admin Dashboard</h1>
        <p className="text-gray-600 mt-2">Manage testers, feedback, and time controls for User Acceptance Testing</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
          <button onClick={() => setError(null)} className="ml-4 text-red-500 hover:text-red-700">Dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-4">
          {[
            { id: 'testers', label: 'Testers', count: testerCounts.total },
            { id: 'feedback', label: 'Feedback', count: feedbackCounts.total },
            { id: 'time', label: 'Time Controls' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Testers Tab */}
      {activeTab === 'testers' && (
        <div className="space-y-6">
          {/* Invite Testers */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Invite Testers</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Addresses (one per line or comma-separated)
                </label>
                <textarea
                  value={inviteEmails}
                  onChange={(e) => setInviteEmails(e.target.value)}
                  rows={3}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  placeholder="tester1@example.com&#10;tester2@example.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="tester">Tester</option>
                    <option value="power_tester">Power Tester</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Custom Message (optional)</label>
                  <input
                    type="text"
                    value={inviteMessage}
                    onChange={(e) => setInviteMessage(e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    placeholder="Welcome message..."
                  />
                </div>
              </div>
              <button
                onClick={handleInviteTesters}
                disabled={isInviting || !inviteEmails.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium disabled:opacity-50"
              >
                {isInviting ? 'Inviting...' : 'Send Invitations'}
              </button>
            </div>
          </div>

          {/* Tester Stats */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Invited', count: testerCounts.invited, color: 'yellow' },
              { label: 'Registered', count: testerCounts.registered, color: 'blue' },
              { label: 'Active', count: testerCounts.active, color: 'green' },
              { label: 'Inactive', count: testerCounts.inactive, color: 'gray' },
            ].map((stat) => (
              <div key={stat.label} className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-sm text-gray-600">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.count}</p>
              </div>
            ))}
          </div>

          {/* Testers List */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Feedback</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {testers.map((tester) => (
                  <tr key={tester.id}>
                    <td className="px-4 py-3 text-sm text-gray-900">{tester.email}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{tester.name || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeClass(tester.status)}`}>
                        {tester.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{tester.role}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{tester.feedback_count}</td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-2">
                        {tester.status === 'invited' && (
                          <button
                            onClick={() => handleResendInvite(tester.id)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            Resend
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveTester(tester.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {testers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No testers yet. Invite some above!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Feedback Tab */}
      {activeTab === 'feedback' && (
        <div className="space-y-6">
          {/* Feedback Stats */}
          <div className="grid grid-cols-6 gap-4">
            {['new', 'reviewed', 'in_progress', 'resolved', 'wont_fix', 'duplicate'].map((status) => (
              <div
                key={status}
                className={`bg-white rounded-lg border border-gray-200 p-4 cursor-pointer ${feedbackFilter.status === status ? 'ring-2 ring-blue-500' : ''}`}
                onClick={() => setFeedbackFilter(prev => ({ ...prev, status: prev.status === status ? undefined : status }))}
              >
                <p className="text-sm text-gray-600 capitalize">{status.replace('_', ' ')}</p>
                <p className="text-2xl font-bold text-gray-900">{feedbackCounts.byStatus[status] || 0}</p>
              </div>
            ))}
          </div>

          {/* Feedback List */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tester</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Submitted</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {feedback
                  .filter(f => !feedbackFilter.status || f.status === feedbackFilter.status)
                  .filter(f => !feedbackFilter.type || f.feedback_type === feedbackFilter.type)
                  .map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getFeedbackTypeBadgeClass(item.feedback_type)}`}>
                          {item.feedback_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">{item.title}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{item.tester_email || 'Unknown'}</td>
                      <td className="px-4 py-3">
                        <select
                          value={item.status}
                          onChange={(e) => handleUpdateFeedbackStatus(item.id, e.target.value)}
                          className="text-xs border rounded px-2 py-1"
                        >
                          <option value="new">New</option>
                          <option value="reviewed">Reviewed</option>
                          <option value="in_progress">In Progress</option>
                          <option value="resolved">Resolved</option>
                          <option value="wont_fix">Won't Fix</option>
                          <option value="duplicate">Duplicate</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(item.submitted_at)}</td>
                      <td className="px-4 py-3 text-sm">
                        <button className="text-blue-600 hover:text-blue-800">View</button>
                      </td>
                    </tr>
                  ))}
                {feedback.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No feedback submitted yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Time Controls Tab */}
      {activeTab === 'time' && timeInfo && (
        <div className="space-y-6">
          {/* Current Time Info */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Current Time Status</h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-600">Real Time</p>
                <p className="text-xl font-mono text-gray-900">{formatDate(timeInfo.realTime)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Effective Time (UAT)</p>
                <p className="text-xl font-mono text-blue-600">{formatDate(timeInfo.effectiveTime)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Offset</p>
                <p className="text-lg font-medium text-gray-900">{timeInfo.offsetHuman}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <p className="text-lg font-medium">
                  {timeInfo.isFrozen ? (
                    <span className="text-red-600">Frozen at {timeInfo.frozenAt && formatDate(timeInfo.frozenAt)}</span>
                  ) : (
                    <span className="text-green-600">Running</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Time Controls */}
          <div className="grid grid-cols-2 gap-6">
            {/* Set Offset */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-md font-semibold text-gray-900 mb-4">Set Time Offset</h3>
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={offsetInput}
                  onChange={(e) => setOffsetInput(e.target.value)}
                  placeholder="e.g., +2h, -1d, +30m"
                  className="flex-1 border rounded-md px-3 py-2 text-sm"
                />
                <button
                  onClick={handleSetTimeOffset}
                  disabled={isUpdatingTime || !offsetInput}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium disabled:opacity-50"
                >
                  Set
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Format: +/-[number][s/m/h/d/w] (seconds, minutes, hours, days, weeks)
              </p>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-md font-semibold text-gray-900 mb-4">Quick Advance</h3>
              <div className="grid grid-cols-3 gap-2">
                {['+1h', '+6h', '+12h', '+1d', '+3d', '+1w'].map((duration) => (
                  <button
                    key={duration}
                    onClick={() => handleAdvanceTime(duration)}
                    disabled={isUpdatingTime}
                    className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-50"
                  >
                    {duration}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Freeze/Reset Controls */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-md font-semibold text-gray-900 mb-4">Freeze/Reset Controls</h3>
            <div className="flex gap-4">
              {timeInfo.isFrozen ? (
                <button
                  onClick={handleUnfreezeTime}
                  disabled={isUpdatingTime}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-medium disabled:opacity-50"
                >
                  Unfreeze Time
                </button>
              ) : (
                <button
                  onClick={handleFreezeTime}
                  disabled={isUpdatingTime}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md font-medium disabled:opacity-50"
                >
                  Freeze Time
                </button>
              )}
              <button
                onClick={handleResetTime}
                disabled={isUpdatingTime}
                className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-md font-medium disabled:opacity-50"
              >
                Reset to Real Time
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
