import { useState, useEffect } from 'react'
import { useSearchParams, Navigate, Link } from 'react-router-dom'
import { apiClient } from '../services/api'
import { useAuthStore } from '../hooks/useAuthStore'

// Import sub-components
import AdminW9Review from '../components/admin/AdminW9Review'
import AdminFeedbackReview from '../components/admin/AdminFeedbackReview'
import AdminManageAdmins from '../components/admin/AdminManageAdmins'

type AdminTab = 'overview' | 'w9' | 'feedback' | 'admins'

interface DashboardStats {
  pendingW9: number
  totalFeedback: number
  pendingFeedback: number
  totalAdmins: number
}

export default function AdminDashboardPage() {
  const { user } = useAuthStore()
  const [searchParams, setSearchParams] = useSearchParams()

  // Admin check
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [adminCheckLoading, setAdminCheckLoading] = useState(true)

  // Stats for overview
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  // Get current tab from URL, default to overview
  const currentTab = (searchParams.get('tab') as AdminTab) || 'overview'

  const setTab = (tab: AdminTab) => {
    setSearchParams({ tab })
  }

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

  // Fetch stats when admin check passes
  useEffect(() => {
    if (isAdmin) {
      fetchStats()
    }
  }, [isAdmin])

  const fetchStats = async () => {
    setStatsLoading(true)
    try {
      const [taxStats, feedbackStats, adminsData] = await Promise.all([
        apiClient.getAdminTaxStats(),
        apiClient.getFeedbackStats(),
        apiClient.getPlatformAdmins(),
      ])

      setStats({
        pendingW9: taxStats.pending,
        totalFeedback: feedbackStats.total,
        pendingFeedback: feedbackStats.new_count + feedbackStats.under_review_count,
        totalAdmins: adminsData.admins.length,
      })
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    } finally {
      setStatsLoading(false)
    }
  }

  // Show loading while checking admin status
  if (adminCheckLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Checking permissions...</div>
      </div>
    )
  }

  // Redirect if not admin
  if (!isAdmin) {
    return <Navigate to="/" replace />
  }

  const tabs: { id: AdminTab; label: string; icon: JSX.Element; badge?: number }[] = [
    {
      id: 'overview',
      label: 'Overview',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
    },
    {
      id: 'w9',
      label: 'W-9 Review',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      badge: stats?.pendingW9,
    },
    {
      id: 'feedback',
      label: 'Feedback',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      ),
      badge: stats?.pendingFeedback,
    },
    {
      id: 'admins',
      label: 'Manage Admins',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
  ]

  return (
    <div className="min-h-screen bg-cream">
      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 bg-white shadow-lg min-h-screen sticky top-20">
          <div className="p-6">
            <h1 className="text-xl font-bold text-charcoal mb-1">Admin Dashboard</h1>
            <p className="text-sm text-gray-500">Platform management</p>
          </div>

          <nav className="px-4 pb-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 text-left transition-colors ${
                  currentTab === tab.id
                    ? 'bg-sage text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.icon}
                <span className="font-medium flex-1">{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    currentTab === tab.id ? 'bg-white/20 text-white' : 'bg-red-100 text-red-600'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Back to site link */}
          <div className="px-4 border-t border-gray-200 pt-4">
            <Link
              to="/"
              className="flex items-center gap-2 px-4 py-2 text-gray-500 hover:text-gray-700 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Site
            </Link>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-8">
          {currentTab === 'overview' && (
            <OverviewPanel stats={stats} statsLoading={statsLoading} onNavigate={setTab} />
          )}
          {currentTab === 'w9' && <AdminW9Review />}
          {currentTab === 'feedback' && <AdminFeedbackReview />}
          {currentTab === 'admins' && <AdminManageAdmins />}
        </div>
      </div>
    </div>
  )
}

// Overview Panel Component
function OverviewPanel({
  stats,
  statsLoading,
  onNavigate,
}: {
  stats: DashboardStats | null
  statsLoading: boolean
  onNavigate: (tab: AdminTab) => void
}) {
  if (statsLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48 mb-8"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    )
  }

  const statCards = [
    {
      label: 'Pending W-9s',
      value: stats?.pendingW9 || 0,
      color: 'bg-orange-100 text-orange-700',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      action: () => onNavigate('w9'),
      actionLabel: 'Review',
    },
    {
      label: 'Pending Feedback',
      value: stats?.pendingFeedback || 0,
      color: 'bg-blue-100 text-blue-700',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      ),
      action: () => onNavigate('feedback'),
      actionLabel: 'View All',
    },
    {
      label: 'Total Feedback',
      value: stats?.totalFeedback || 0,
      color: 'bg-purple-100 text-purple-700',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
      ),
      action: () => onNavigate('feedback'),
      actionLabel: 'Manage',
    },
    {
      label: 'Platform Admins',
      value: stats?.totalAdmins || 0,
      color: 'bg-green-100 text-green-700',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      action: () => onNavigate('admins'),
      actionLabel: 'Manage',
    },
  ]

  return (
    <div>
      <h2 className="text-2xl font-bold text-charcoal mb-6">Dashboard Overview</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((card, idx) => (
          <div key={idx} className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-start justify-between mb-4">
              <div className={`p-3 rounded-lg ${card.color}`}>
                {card.icon}
              </div>
              {card.value > 0 && (
                <button
                  onClick={card.action}
                  className="text-sm text-sage hover:text-sage/80 font-medium"
                >
                  {card.actionLabel}
                </button>
              )}
            </div>
            <p className="text-3xl font-bold text-charcoal mb-1">{card.value}</p>
            <p className="text-sm text-gray-500">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-charcoal mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => onNavigate('w9')}
            className="flex items-center gap-3 p-4 rounded-lg border-2 border-gray-200 hover:border-sage hover:bg-sage/5 transition-colors text-left"
          >
            <div className="p-2 bg-orange-100 rounded-lg">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-charcoal">Review W-9 Submissions</p>
              <p className="text-sm text-gray-500">Verify tax information</p>
            </div>
          </button>

          <button
            onClick={() => onNavigate('feedback')}
            className="flex items-center gap-3 p-4 rounded-lg border-2 border-gray-200 hover:border-sage hover:bg-sage/5 transition-colors text-left"
          >
            <div className="p-2 bg-blue-100 rounded-lg">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-charcoal">Respond to Feedback</p>
              <p className="text-sm text-gray-500">Address user concerns</p>
            </div>
          </button>

          <button
            onClick={() => onNavigate('admins')}
            className="flex items-center gap-3 p-4 rounded-lg border-2 border-gray-200 hover:border-sage hover:bg-sage/5 transition-colors text-left"
          >
            <div className="p-2 bg-green-100 rounded-lg">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-charcoal">Manage Administrators</p>
              <p className="text-sm text-gray-500">Add or remove admins</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
