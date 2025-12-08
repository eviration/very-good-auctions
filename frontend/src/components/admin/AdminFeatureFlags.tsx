import { useState, useEffect } from 'react'
import { apiClient } from '../../services/api'

interface FeatureFlag {
  id: string
  flagKey: string
  flagValue: boolean
  description: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

interface AuditEntry {
  id: string
  flagKey: string
  oldValue: boolean | null
  newValue: boolean
  changedByUserId: string
  changedByEmail: string
  reason: string | null
  createdAt: string
}

// Human-readable labels for feature flags
const FLAG_LABELS: Record<string, { label: string; category: 'payments' | 'auctions' | 'platform' }> = {
  integrated_payments_enabled: { label: 'Integrated Payments (Stripe Connect)', category: 'payments' },
  self_managed_payments_enabled: { label: 'Self-Managed Payments', category: 'payments' },
  free_mode_enabled: { label: 'Free Mode (No Platform Fees)', category: 'platform' },
  silent_auctions_enabled: { label: 'Silent Auctions', category: 'auctions' },
  standard_auctions_enabled: { label: 'Standard Auctions', category: 'auctions' },
}

export default function AdminFeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'flags' | 'audit'>('flags')

  // Toggle confirmation modal
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [selectedFlag, setSelectedFlag] = useState<FeatureFlag | null>(null)
  const [toggleReason, setToggleReason] = useState('')
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [flagsData, auditData] = await Promise.all([
        apiClient.getFeatureFlags(),
        apiClient.getFeatureFlagAuditLog({ limit: 50 }),
      ])
      setFlags(flagsData.flags)
      setAuditLog(auditData.entries)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleClick = (flag: FeatureFlag) => {
    setSelectedFlag(flag)
    setToggleReason('')
    setShowConfirmModal(true)
  }

  const handleConfirmToggle = async () => {
    if (!selectedFlag) return

    setToggling(true)
    try {
      await apiClient.updateFeatureFlag(selectedFlag.flagKey, {
        value: !selectedFlag.flagValue,
        reason: toggleReason || undefined,
      })
      await fetchData()
      setShowConfirmModal(false)
      setSelectedFlag(null)
      setToggleReason('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update flag')
    } finally {
      setToggling(false)
    }
  }

  // Group flags by category
  const groupedFlags = flags.reduce((acc, flag) => {
    const category = FLAG_LABELS[flag.flagKey]?.category || 'platform'
    if (!acc[category]) acc[category] = []
    acc[category].push(flag)
    return acc
  }, {} as Record<string, FeatureFlag[]>)

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48 mb-6"></div>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">{error}</p>
        <button
          onClick={() => { setError(null); fetchData() }}
          className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-charcoal">Feature Flags</h2>
          <p className="text-gray-500 text-sm mt-1">
            Control platform features and payment modes
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('flags')}
          className={`px-4 py-2 font-medium text-sm border-b-2 -mb-px transition-colors ${
            activeTab === 'flags'
              ? 'border-sage text-sage'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Feature Flags
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

      {activeTab === 'flags' ? (
        <div className="space-y-8">
          {/* Payment Mode Section */}
          {groupedFlags.payments && groupedFlags.payments.length > 0 && (
            <FlagSection
              title="Payment Modes"
              description="Control which payment methods organizations can use"
              flags={groupedFlags.payments}
              onToggle={handleToggleClick}
            />
          )}

          {/* Auction Types Section */}
          {groupedFlags.auctions && groupedFlags.auctions.length > 0 && (
            <FlagSection
              title="Auction Types"
              description="Enable or disable auction types available to organizations"
              flags={groupedFlags.auctions}
              onToggle={handleToggleClick}
            />
          )}

          {/* Platform Settings Section */}
          {groupedFlags.platform && groupedFlags.platform.length > 0 && (
            <FlagSection
              title="Platform Settings"
              description="Global platform configuration"
              flags={groupedFlags.platform}
              onToggle={handleToggleClick}
            />
          )}
        </div>
      ) : (
        <AuditLogSection entries={auditLog} />
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && selectedFlag && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-charcoal mb-4">
              {selectedFlag.flagValue ? 'Disable' : 'Enable'} Feature
            </h3>

            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <p className="font-medium text-charcoal">
                {FLAG_LABELS[selectedFlag.flagKey]?.label || selectedFlag.flagKey}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {selectedFlag.description}
              </p>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                {selectedFlag.flagValue ? (
                  <span className="text-amber-600">
                    Disabling this will prevent users from accessing this feature.
                  </span>
                ) : (
                  <span className="text-green-600">
                    Enabling this will make this feature available to users.
                  </span>
                )}
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason (optional)
              </label>
              <textarea
                value={toggleReason}
                onChange={(e) => setToggleReason(e.target.value)}
                placeholder="Why are you making this change?"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sage focus:border-sage text-sm"
                rows={2}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={toggling}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmToggle}
                disabled={toggling}
                className={`flex-1 px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50 ${
                  selectedFlag.flagValue
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {toggling ? 'Updating...' : selectedFlag.flagValue ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Flag Section Component
function FlagSection({
  title,
  description,
  flags,
  onToggle,
}: {
  title: string
  description: string
  flags: FeatureFlag[]
  onToggle: (flag: FeatureFlag) => void
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-100">
        <h3 className="font-semibold text-charcoal">{title}</h3>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      <div className="divide-y divide-gray-100">
        {flags.map((flag) => (
          <div
            key={flag.id}
            className={`p-4 flex items-center justify-between ${
              !flag.flagValue ? 'bg-amber-50/50' : ''
            }`}
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-charcoal">
                  {FLAG_LABELS[flag.flagKey]?.label || flag.flagKey}
                </p>
                {!flag.flagValue && (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                    Disabled
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {flag.description}
              </p>
              {flag.updatedAt && flag.updatedBy && (
                <p className="text-xs text-gray-400 mt-1">
                  Last updated: {new Date(flag.updatedAt).toLocaleDateString()}
                </p>
              )}
            </div>
            <button
              onClick={() => onToggle(flag)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sage focus:ring-offset-2 ${
                flag.flagValue ? 'bg-sage' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  flag.flagValue ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// Audit Log Section
function AuditLogSection({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-8 text-center">
        <div className="p-3 bg-gray-100 rounded-full w-fit mx-auto mb-3">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-gray-500">No changes have been recorded yet</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                Feature
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                Change
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                Changed By
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                Reason
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entries.map((entry) => (
              <tr key={entry.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                  {new Date(entry.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm font-medium text-charcoal">
                  {FLAG_LABELS[entry.flagKey]?.label || entry.flagKey}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                    entry.newValue
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {entry.oldValue !== null && (
                      <>
                        <span className={entry.oldValue ? 'text-green-600' : 'text-gray-400'}>
                          {entry.oldValue ? 'ON' : 'OFF'}
                        </span>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </>
                    )}
                    <span>{entry.newValue ? 'ON' : 'OFF'}</span>
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {entry.changedByEmail}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                  {entry.reason || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
