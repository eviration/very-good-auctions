import { useState, useEffect } from 'react'
import { apiClient } from '../../services/api'

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

interface UatStats {
  testers: { invited: number; registered: number; active: number; inactive: number; total: number }
  feedback: { byStatus: Record<string, number>; byType: Record<string, number>; total: number }
}

export default function AdminUatManagement() {
  const [activeSection, setActiveSection] = useState<'overview' | 'testers' | 'feedback' | 'time'>('overview')

  // Testers state
  const [testers, setTesters] = useState<Tester[]>([])
  const [testerCounts, setTesterCounts] = useState({ invited: 0, registered: 0, active: 0, inactive: 0, total: 0 })
  const [inviteEmails, setInviteEmails] = useState('')
  const [inviteRole, setInviteRole] = useState<'tester' | 'power_tester' | 'admin'>('tester')
  const [inviteMessage, setInviteMessage] = useState('')
  const [isInviting, setIsInviting] = useState(false)

  // Feedback state
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [feedbackCounts, setFeedbackCounts] = useState<UatStats['feedback']>({ byStatus: {}, byType: {}, total: 0 })
  const [feedbackFilter, setFeedbackFilter] = useState<{ status?: string }>({})
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null)

  // Time state
  const [timeInfo, setTimeInfo] = useState<TimeInfo | null>(null)
  const [offsetInput, setOffsetInput] = useState('')
  const [isUpdatingTime, setIsUpdatingTime] = useState(false)

  // Loading states
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

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
      setError(err instanceof Error ? err.message : 'Failed to load UAT data')
    } finally {
      setLoading(false)
    }
  }

  const handleInviteTesters = async () => {
    setIsInviting(true)
    setError(null)
    try {
      const result = await apiClient.inviteUatTesters({
        emails: inviteEmails,
        role: inviteRole,
        message: inviteMessage || undefined,
      })
      if (result.success) {
        setInviteEmails('')
        setInviteMessage('')
        setSuccessMessage(`Successfully invited ${result.summary.invited} tester(s)`)
        loadData()
        setTimeout(() => setSuccessMessage(null), 3000)
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
      setSuccessMessage('Invitation resent successfully')
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend invitation')
    }
  }

  const handleRemoveTester = async (testerId: string) => {
    if (!confirm('Are you sure you want to remove this tester?')) return
    try {
      await apiClient.removeUatTester(testerId)
      setSuccessMessage('Tester removed successfully')
      loadData()
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove tester')
    }
  }

  const handleUpdateTesterRole = async (testerId: string, role: 'tester' | 'power_tester' | 'admin') => {
    try {
      await apiClient.updateUatTesterRole(testerId, role)
      setSuccessMessage('Role updated successfully')
      loadData()
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role')
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

  const handleSetTimeOffset = async () => {
    setIsUpdatingTime(true)
    try {
      await apiClient.setUatTimeOffset(offsetInput)
      setOffsetInput('')
      const timeData = await apiClient.getUatTime()
      setTimeInfo(timeData)
      setSuccessMessage('Time offset updated')
      setTimeout(() => setSuccessMessage(null), 3000)
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
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48 mb-6"></div>
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    )
  }

  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'testers', label: 'Testers', count: testerCounts.total },
    { id: 'feedback', label: 'Feedback', count: feedbackCounts.total },
    { id: 'time', label: 'Time Controls' },
  ]

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-charcoal">UAT Management</h2>
        <p className="text-gray-500 mt-1">Manage testers, feedback, and time controls for User Acceptance Testing</p>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-medium">Dismiss</button>
        </div>
      )}
      {successMessage && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {successMessage}
        </div>
      )}

      {/* Section Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id as typeof activeSection)}
            className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors ${
              activeSection === section.id
                ? 'bg-sage text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {section.label}
            {section.count !== undefined && (
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeSection === section.id ? 'bg-white/20' : 'bg-gray-200'
              }`}>
                {section.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Overview Section */}
      {activeSection === 'overview' && (
        <div className="space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-500 text-sm">Total Testers</span>
                <div className="p-2 bg-blue-100 rounded-lg">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl font-bold text-charcoal">{testerCounts.total}</p>
              <p className="text-xs text-gray-500 mt-1">{testerCounts.active} active</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-500 text-sm">Pending Invites</span>
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl font-bold text-charcoal">{testerCounts.invited}</p>
              <p className="text-xs text-gray-500 mt-1">awaiting response</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-500 text-sm">Total Feedback</span>
                <div className="p-2 bg-purple-100 rounded-lg">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl font-bold text-charcoal">{feedbackCounts.total}</p>
              <p className="text-xs text-gray-500 mt-1">{feedbackCounts.byStatus['new'] || 0} new</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-500 text-sm">Time Status</span>
                <div className={`p-2 rounded-lg ${timeInfo?.isFrozen ? 'bg-red-100' : 'bg-green-100'}`}>
                  <svg className={`w-5 h-5 ${timeInfo?.isFrozen ? 'text-red-600' : 'text-green-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-lg font-bold text-charcoal">{timeInfo?.isFrozen ? 'Frozen' : 'Running'}</p>
              <p className="text-xs text-gray-500 mt-1">{timeInfo?.offsetHuman || 'No offset'}</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <h3 className="text-lg font-semibold text-charcoal mb-4">Quick Actions</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => setActiveSection('testers')}
                className="flex items-center gap-3 p-4 rounded-lg border-2 border-gray-200 hover:border-sage hover:bg-sage/5 transition-colors text-left"
              >
                <div className="p-2 bg-blue-100 rounded-lg">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-charcoal">Invite Testers</p>
                  <p className="text-sm text-gray-500">Add new UAT participants</p>
                </div>
              </button>

              <button
                onClick={() => setActiveSection('feedback')}
                className="flex items-center gap-3 p-4 rounded-lg border-2 border-gray-200 hover:border-sage hover:bg-sage/5 transition-colors text-left"
              >
                <div className="p-2 bg-purple-100 rounded-lg">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-charcoal">Review Feedback</p>
                  <p className="text-sm text-gray-500">{feedbackCounts.byStatus['new'] || 0} items pending</p>
                </div>
              </button>

              <button
                onClick={() => setActiveSection('time')}
                className="flex items-center gap-3 p-4 rounded-lg border-2 border-gray-200 hover:border-sage hover:bg-sage/5 transition-colors text-left"
              >
                <div className="p-2 bg-green-100 rounded-lg">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-charcoal">Time Controls</p>
                  <p className="text-sm text-gray-500">Manipulate test time</p>
                </div>
              </button>
            </div>
          </div>

          {/* Recent Feedback */}
          {feedback.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-charcoal">Recent Feedback</h3>
                <button
                  onClick={() => setActiveSection('feedback')}
                  className="text-sm text-sage hover:text-sage/80 font-medium"
                >
                  View All
                </button>
              </div>
              <div className="space-y-3">
                {feedback.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getFeedbackTypeBadgeClass(item.feedback_type)}`}>
                        {item.feedback_type}
                      </span>
                      <span className="text-sm text-charcoal font-medium truncate max-w-xs">{item.title}</span>
                    </div>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeClass(item.status)}`}>
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Testers Section */}
      {activeSection === 'testers' && (
        <div className="space-y-6">
          {/* Invite Form */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <h3 className="text-lg font-semibold text-charcoal mb-4">Invite New Testers</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Addresses (one per line or comma-separated)
                </label>
                <textarea
                  value={inviteEmails}
                  onChange={(e) => setInviteEmails(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sage focus:border-sage"
                  placeholder="tester1@example.com&#10;tester2@example.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sage focus:border-sage"
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
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sage focus:border-sage"
                    placeholder="Welcome to our testing program!"
                  />
                </div>
              </div>
              <button
                onClick={handleInviteTesters}
                disabled={isInviting || !inviteEmails.trim()}
                className="bg-sage hover:bg-sage/90 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
              >
                {isInviting ? 'Sending...' : 'Send Invitations'}
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Invited', count: testerCounts.invited, color: 'yellow' },
              { label: 'Registered', count: testerCounts.registered, color: 'blue' },
              { label: 'Active', count: testerCounts.active, color: 'green' },
              { label: 'Inactive', count: testerCounts.inactive, color: 'gray' },
            ].map((stat) => (
              <div key={stat.label} className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
                <p className="text-sm text-gray-600">{stat.label}</p>
                <p className="text-2xl font-bold text-charcoal">{stat.count}</p>
              </div>
            ))}
          </div>

          {/* Testers Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Feedback</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joined</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {testers.map((tester) => (
                  <tr key={tester.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-charcoal">{tester.email}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{tester.name || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeClass(tester.status)}`}>
                        {tester.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={tester.role}
                        onChange={(e) => handleUpdateTesterRole(tester.id, e.target.value as 'tester' | 'power_tester' | 'admin')}
                        className="text-xs border rounded px-2 py-1"
                      >
                        <option value="tester">Tester</option>
                        <option value="power_tester">Power Tester</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{tester.feedback_count}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(tester.created_at)}</td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-2">
                        {tester.status === 'invited' && (
                          <button
                            onClick={() => handleResendInvite(tester.id)}
                            className="text-sage hover:text-sage/80 font-medium"
                          >
                            Resend
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveTester(tester.id)}
                          className="text-red-600 hover:text-red-800 font-medium"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {testers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      No testers yet. Invite some above!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Feedback Section */}
      {activeSection === 'feedback' && (
        <div className="space-y-6">
          {/* Status Filters */}
          <div className="grid grid-cols-6 gap-3">
            {['new', 'reviewed', 'in_progress', 'resolved', 'wont_fix', 'duplicate'].map((status) => (
              <button
                key={status}
                className={`bg-white rounded-xl shadow-sm p-4 border transition-all ${
                  feedbackFilter.status === status
                    ? 'border-sage ring-2 ring-sage/20'
                    : 'border-gray-100 hover:border-gray-300'
                }`}
                onClick={() => setFeedbackFilter(prev => ({
                  ...prev,
                  status: prev.status === status ? undefined : status
                }))}
              >
                <p className="text-sm text-gray-600 capitalize">{status.replace('_', ' ')}</p>
                <p className="text-2xl font-bold text-charcoal">{feedbackCounts.byStatus[status] || 0}</p>
              </button>
            ))}
          </div>

          {/* Feedback List */}
          <div className="flex gap-6">
            {/* List */}
            <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tester</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {feedback
                    .filter(f => !feedbackFilter.status || f.status === feedbackFilter.status)
                    .map((item) => (
                      <tr
                        key={item.id}
                        className={`cursor-pointer transition-colors ${
                          selectedFeedback?.id === item.id
                            ? 'bg-sage/10'
                            : 'hover:bg-gray-50'
                        }`}
                        onClick={() => setSelectedFeedback(item)}
                      >
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getFeedbackTypeBadgeClass(item.feedback_type)}`}>
                            {item.feedback_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-charcoal font-medium max-w-xs truncate">{item.title}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{item.tester_email || 'Unknown'}</td>
                        <td className="px-4 py-3">
                          <select
                            value={item.status}
                            onChange={(e) => {
                              e.stopPropagation()
                              handleUpdateFeedbackStatus(item.id, e.target.value)
                            }}
                            onClick={(e) => e.stopPropagation()}
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
                      </tr>
                    ))}
                  {feedback.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                        No feedback submitted yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Detail Panel */}
            {selectedFeedback && (
              <div className="w-96 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-semibold text-charcoal">{selectedFeedback.title}</h3>
                  <button
                    onClick={() => setSelectedFeedback(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getFeedbackTypeBadgeClass(selectedFeedback.feedback_type)}`}>
                      {selectedFeedback.feedback_type}
                    </span>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeClass(selectedFeedback.status)}`}>
                      {selectedFeedback.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-1">Description</p>
                    <p className="text-sm text-charcoal">{selectedFeedback.description}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-1">Submitted By</p>
                    <p className="text-sm text-charcoal">{selectedFeedback.tester_email || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-1">Submitted At</p>
                    <p className="text-sm text-charcoal">{formatDate(selectedFeedback.submitted_at)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Time Controls Section */}
      {activeSection === 'time' && timeInfo && (
        <div className="space-y-6">
          {/* Current Time Status */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <h3 className="text-lg font-semibold text-charcoal mb-4">Current Time Status</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-gray-500 mb-1">Real Time</p>
                <p className="text-lg font-mono text-charcoal">{formatDate(timeInfo.realTime)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Effective Time (UAT)</p>
                <p className="text-lg font-mono text-sage font-bold">{formatDate(timeInfo.effectiveTime)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Offset</p>
                <p className="text-lg font-medium text-charcoal">{timeInfo.offsetHuman}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Status</p>
                {timeInfo.isFrozen ? (
                  <p className="text-lg font-medium text-red-600">Frozen</p>
                ) : (
                  <p className="text-lg font-medium text-green-600">Running</p>
                )}
              </div>
            </div>
          </div>

          {/* Time Controls */}
          <div className="grid grid-cols-2 gap-6">
            {/* Set Offset */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <h3 className="text-md font-semibold text-charcoal mb-4">Set Time Offset</h3>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={offsetInput}
                  onChange={(e) => setOffsetInput(e.target.value)}
                  placeholder="e.g., +2h, -1d, +30m"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sage focus:border-sage"
                />
                <button
                  onClick={handleSetTimeOffset}
                  disabled={isUpdatingTime || !offsetInput}
                  className="bg-sage hover:bg-sage/90 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
                >
                  Set
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Format: +/-[number][s/m/h/d/w] (seconds, minutes, hours, days, weeks)
              </p>
            </div>

            {/* Quick Advance */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <h3 className="text-md font-semibold text-charcoal mb-4">Quick Advance</h3>
              <div className="grid grid-cols-3 gap-2">
                {['+1h', '+6h', '+12h', '+1d', '+3d', '+1w'].map((duration) => (
                  <button
                    key={duration}
                    onClick={() => handleAdvanceTime(duration)}
                    disabled={isUpdatingTime}
                    className="border border-gray-300 hover:border-sage hover:bg-sage/5 text-charcoal px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                  >
                    {duration}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Freeze/Reset */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <h3 className="text-md font-semibold text-charcoal mb-4">Freeze/Reset Controls</h3>
            <div className="flex gap-4">
              {timeInfo.isFrozen ? (
                <button
                  onClick={handleUnfreezeTime}
                  disabled={isUpdatingTime}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
                >
                  Unfreeze Time
                </button>
              ) : (
                <button
                  onClick={handleFreezeTime}
                  disabled={isUpdatingTime}
                  className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
                >
                  Freeze Time
                </button>
              )}
              <button
                onClick={handleResetTime}
                disabled={isUpdatingTime}
                className="border border-gray-300 hover:border-sage hover:bg-sage/5 text-charcoal px-6 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
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
