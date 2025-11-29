import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../services/api'
import type { Organization, EventTier, PricingTiers, CreateEventRequest } from '../types'

const tierDescriptions: Record<EventTier, { name: string; description: string }> = {
  small: { name: 'Small', description: 'Perfect for small fundraisers and community events' },
  medium: { name: 'Medium', description: 'Great for school auctions and mid-sized organizations' },
  large: { name: 'Large', description: 'Ideal for large charity galas and major fundraising events' },
  unlimited: { name: 'Unlimited', description: 'No item limits for enterprise-level events' },
}

export default function CreateEventPage() {
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Organizations
  const [myOrganizations, setMyOrganizations] = useState<Organization[]>([])
  const [organizationId, setOrganizationId] = useState<string>('')

  // Pricing tiers
  const [pricingTiers, setPricingTiers] = useState<PricingTiers | null>(null)

  // Form fields
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('21:00')
  const [submissionDeadline, setSubmissionDeadline] = useState('')
  const [auctionType, setAuctionType] = useState<'standard' | 'silent'>('standard')
  const [incrementType, setIncrementType] = useState<'fixed' | 'percent'>('fixed')
  const [incrementValue, setIncrementValue] = useState('5')
  const [buyNowEnabled, setBuyNowEnabled] = useState(true)
  const [tier, setTier] = useState<EventTier>('small')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [orgs, tiers] = await Promise.all([
          apiClient.getMyOrganizations().catch(() => []),
          apiClient.getPricingTiers().catch(() => null),
        ])
        setMyOrganizations(orgs)
        setPricingTiers(tiers)
      } catch {
        // Ignore errors, use defaults
      }
    }
    fetchData()
  }, [])

  // Set default dates
  useEffect(() => {
    const now = new Date()
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

    setStartDate(nextWeek.toISOString().split('T')[0])
    setEndDate(twoWeeksOut.toISOString().split('T')[0])
    setSubmissionDeadline(nextWeek.toISOString().split('T')[0])
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const startDateTime = new Date(`${startDate}T${startTime}:00`).toISOString()
      const endDateTime = new Date(`${endDate}T${endTime}:00`).toISOString()
      const deadlineDateTime = submissionDeadline
        ? new Date(`${submissionDeadline}T23:59:59`).toISOString()
        : undefined

      const payload: CreateEventRequest = {
        name,
        description: description || undefined,
        organizationId: organizationId || undefined,
        startTime: startDateTime,
        endTime: endDateTime,
        submissionDeadline: deadlineDateTime,
        auctionType,
        incrementType,
        incrementValue: parseFloat(incrementValue),
        buyNowEnabled,
        tier,
      }

      const event = await apiClient.createEvent(payload)
      navigate(`/events/${event.slug}/manage`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event')
      setIsSubmitting(false)
    }
  }

  const selectedTierInfo = pricingTiers?.[tier]

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl font-bold text-charcoal mb-2">
        Create Auction Event
      </h1>
      <p className="text-gray-600 mb-8">
        Set up a multi-item auction event for your organization or personal fundraiser
      </p>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Organization Selection */}
        <div className="bg-white rounded-xl border border-sage/20 p-6">
          <h2 className="text-lg font-semibold text-charcoal mb-4">Event Owner</h2>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">
              Organization (Optional)
            </label>
            <select
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
            >
              <option value="">Personal event (no organization)</option>
              {myOrganizations.map((org) => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
            <p className="text-sm text-gray-500 mt-2">
              Link to an organization to run this as an official fundraiser
            </p>
          </div>
        </div>

        {/* Event Details */}
        <div className="bg-white rounded-xl border border-sage/20 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-charcoal mb-4">Event Details</h2>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">
              Event Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
              placeholder="e.g., Spring Fundraiser Auction 2024"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
              placeholder="Tell people what this auction is about..."
            />
          </div>
        </div>

        {/* Schedule */}
        <div className="bg-white rounded-xl border border-sage/20 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-charcoal mb-4">Schedule</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-2">
                Start Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-2">
                Start Time <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-2">
                End Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-2">
                End Time <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">
              Item Submission Deadline
            </label>
            <input
              type="date"
              value={submissionDeadline}
              onChange={(e) => setSubmissionDeadline(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
            />
            <p className="text-sm text-gray-500 mt-2">
              Last day people can submit items for this auction
            </p>
          </div>
        </div>

        {/* Auction Settings */}
        <div className="bg-white rounded-xl border border-sage/20 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-charcoal mb-4">Auction Settings</h2>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">
              Auction Type
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className={`relative flex items-center p-4 border-2 rounded-xl cursor-pointer transition-colors ${
                auctionType === 'standard' ? 'border-sage bg-sage/5' : 'border-gray-200 hover:border-sage/50'
              }`}>
                <input
                  type="radio"
                  name="auctionType"
                  value="standard"
                  checked={auctionType === 'standard'}
                  onChange={() => setAuctionType('standard')}
                  className="sr-only"
                />
                <div>
                  <div className="font-medium text-charcoal">Standard Auction</div>
                  <div className="text-sm text-gray-500">Bids are visible to everyone</div>
                </div>
              </label>
              <label className={`relative flex items-center p-4 border-2 rounded-xl cursor-pointer transition-colors ${
                auctionType === 'silent' ? 'border-sage bg-sage/5' : 'border-gray-200 hover:border-sage/50'
              }`}>
                <input
                  type="radio"
                  name="auctionType"
                  value="silent"
                  checked={auctionType === 'silent'}
                  onChange={() => setAuctionType('silent')}
                  className="sr-only"
                />
                <div>
                  <div className="font-medium text-charcoal">Silent Auction</div>
                  <div className="text-sm text-gray-500">Bids are hidden until end</div>
                </div>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-2">
                Bid Increment Type
              </label>
              <select
                value={incrementType}
                onChange={(e) => setIncrementType(e.target.value as 'fixed' | 'percent')}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
              >
                <option value="fixed">Fixed Amount ($)</option>
                <option value="percent">Percentage (%)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-2">
                Increment Value
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                  {incrementType === 'fixed' ? '$' : '%'}
                </span>
                <input
                  type="number"
                  min="1"
                  step={incrementType === 'fixed' ? '1' : '0.5'}
                  value={incrementValue}
                  onChange={(e) => setIncrementValue(e.target.value)}
                  className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
                />
              </div>
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={buyNowEnabled}
              onChange={(e) => setBuyNowEnabled(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-sage focus:ring-sage"
            />
            <div>
              <div className="font-medium text-charcoal">Enable Buy Now</div>
              <div className="text-sm text-gray-500">
                Allow items to have a "Buy Now" price for instant purchase
              </div>
            </div>
          </label>
        </div>

        {/* Pricing Tier */}
        <div className="bg-white rounded-xl border border-sage/20 p-6">
          <h2 className="text-lg font-semibold text-charcoal mb-4">Event Size</h2>

          <div className="grid grid-cols-2 gap-4">
            {(['small', 'medium', 'large', 'unlimited'] as const).map((t) => {
              const tierPricing = pricingTiers?.[t]
              return (
                <label
                  key={t}
                  className={`relative flex flex-col p-4 border-2 rounded-xl cursor-pointer transition-colors ${
                    tier === t ? 'border-sage bg-sage/5' : 'border-gray-200 hover:border-sage/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="tier"
                    value={t}
                    checked={tier === t}
                    onChange={() => setTier(t)}
                    className="sr-only"
                  />
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-charcoal">{tierDescriptions[t].name}</span>
                    {tierPricing && (
                      <span className="text-sage font-bold">${tierPricing.fee}</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">
                    {tierPricing
                      ? tierPricing.maxItems
                        ? `Up to ${tierPricing.maxItems} items`
                        : 'Unlimited items'
                      : tierDescriptions[t].description}
                  </div>
                </label>
              )
            })}
          </div>

          {selectedTierInfo && (
            <div className="mt-4 p-4 bg-sage/10 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-charcoal">Platform fee for this event:</span>
                <span className="text-2xl font-bold text-sage">${selectedTierInfo.fee}</span>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {selectedTierInfo.maxItems
                  ? `Supports up to ${selectedTierInfo.maxItems} items`
                  : 'No limit on items'}
              </p>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-4 bg-sage text-white font-semibold rounded-xl hover:bg-sage/90 disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? 'Creating Event...' : 'Create Event'}
        </button>
      </form>
    </div>
  )
}
