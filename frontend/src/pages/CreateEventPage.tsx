import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../services/api'
import type { Organization, EventTier, PricingTiers, CreateEventRequest, OrganizationType } from '../types'

const tierDescriptions: Record<EventTier, { name: string; description: string; color: string }> = {
  small: { name: 'Small', description: 'Perfect for small fundraisers', color: 'bg-clay-mint' },
  medium: { name: 'Medium', description: 'Great for school auctions', color: 'bg-clay-sky' },
  large: { name: 'Large', description: 'Ideal for charity galas', color: 'bg-clay-lavender' },
  unlimited: { name: 'Unlimited', description: 'No item limits', color: 'bg-clay-peach' },
}

export default function CreateEventPage() {
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Organizations
  const [myOrganizations, setMyOrganizations] = useState<Organization[]>([])
  const [organizationId, setOrganizationId] = useState<string>('')
  const [showCreateOrg, setShowCreateOrg] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [newOrgType, setNewOrgType] = useState<OrganizationType>('nonprofit')
  const [newOrgEmail, setNewOrgEmail] = useState('')
  const [isCreatingOrg, setIsCreatingOrg] = useState(false)

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

  const handleCreateOrg = async () => {
    if (!newOrgName.trim() || !newOrgEmail.trim()) return

    setIsCreatingOrg(true)
    try {
      const org = await apiClient.createOrganization({
        name: newOrgName.trim(),
        orgType: newOrgType,
        contactEmail: newOrgEmail.trim(),
      })
      setMyOrganizations([...myOrganizations, org])
      setOrganizationId(org.id)
      setShowCreateOrg(false)
      setNewOrgName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization')
    } finally {
      setIsCreatingOrg(false)
    }
  }

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
    <div className="min-h-screen bg-clay-bg">
      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="clay-section mb-8">
          <h1 className="font-display text-4xl font-black text-charcoal mb-2">
            Create Auction Event
          </h1>
          <p className="text-charcoal-light font-medium">
            Set up a multi-item auction event for your organization or fundraiser
          </p>
        </div>

        {error && (
          <div className="clay-section mb-8 bg-clay-coral/20">
            <p className="text-clay-coral font-bold">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Organization Selection */}
          <div className="clay-card p-6">
            <h2 className="font-bold text-lg text-charcoal mb-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-clay bg-clay-lavender flex items-center justify-center">
                <svg className="w-4 h-4 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              Organization
            </h2>

            {!showCreateOrg ? (
              <>
                <select
                  value={organizationId}
                  onChange={(e) => setOrganizationId(e.target.value)}
                  className="clay-input w-full"
                >
                  <option value="">Personal event (no organization)</option>
                  {myOrganizations.map((org) => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
                <p className="text-sm text-charcoal-light mt-3">
                  Link to an organization to run this as an official fundraiser.{' '}
                  <button
                    type="button"
                    onClick={() => setShowCreateOrg(true)}
                    className="text-charcoal font-bold hover:underline"
                  >
                    Create new organization
                  </button>
                </p>
              </>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-charcoal mb-2">
                    Organization Name
                  </label>
                  <input
                    type="text"
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    className="clay-input w-full"
                    placeholder="e.g., Lincoln Elementary PTA"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-charcoal mb-2">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    value={newOrgEmail}
                    onChange={(e) => setNewOrgEmail(e.target.value)}
                    className="clay-input w-full"
                    placeholder="e.g., contact@myorganization.org"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-charcoal mb-2">
                    Organization Type
                  </label>
                  <select
                    value={newOrgType}
                    onChange={(e) => setNewOrgType(e.target.value as OrganizationType)}
                    className="clay-input w-full"
                  >
                    <option value="nonprofit">Nonprofit</option>
                    <option value="school">School</option>
                    <option value="religious">Religious</option>
                    <option value="club">Club</option>
                    <option value="company">Company</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateOrg(false)}
                    className="clay-button bg-clay-surface"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateOrg}
                    disabled={isCreatingOrg || !newOrgName.trim() || !newOrgEmail.trim()}
                    className="clay-button bg-clay-mint disabled:opacity-50"
                  >
                    {isCreatingOrg ? 'Creating...' : 'Create Organization'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Event Details */}
          <div className="clay-card p-6 space-y-5">
            <h2 className="font-bold text-lg text-charcoal mb-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-clay bg-clay-butter flex items-center justify-center">
                <svg className="w-4 h-4 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              Event Details
            </h2>

            <div>
              <label className="block text-sm font-bold text-charcoal mb-2">
                Event Name <span className="text-clay-coral">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="clay-input w-full"
                placeholder="e.g., Spring Fundraiser Auction 2024"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-charcoal mb-2">
                Description
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="clay-input w-full"
                placeholder="Tell people what this auction is about..."
              />
            </div>
          </div>

          {/* Schedule */}
          <div className="clay-card p-6 space-y-5">
            <h2 className="font-bold text-lg text-charcoal mb-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-clay bg-clay-sky flex items-center justify-center">
                <svg className="w-4 h-4 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              Schedule
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-charcoal mb-2">
                  Start Date <span className="text-clay-coral">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="clay-input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-charcoal mb-2">
                  Start Time <span className="text-clay-coral">*</span>
                </label>
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="clay-input w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-charcoal mb-2">
                  End Date <span className="text-clay-coral">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="clay-input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-charcoal mb-2">
                  End Time <span className="text-clay-coral">*</span>
                </label>
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="clay-input w-full"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-charcoal mb-2">
                Item Submission Deadline
              </label>
              <input
                type="date"
                value={submissionDeadline}
                onChange={(e) => setSubmissionDeadline(e.target.value)}
                className="clay-input w-full"
              />
              <p className="text-sm text-charcoal-light mt-2">
                Last day people can submit items for this auction
              </p>
            </div>
          </div>

          {/* Auction Settings */}
          <div className="clay-card p-6 space-y-5">
            <h2 className="font-bold text-lg text-charcoal mb-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-clay bg-clay-mint flex items-center justify-center">
                <svg className="w-4 h-4 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              Auction Settings
            </h2>

            <div>
              <label className="block text-sm font-bold text-charcoal mb-3">
                Auction Type
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className={`clay-card p-4 cursor-pointer transition-all ${
                  auctionType === 'standard' ? 'ring-3 ring-charcoal shadow-clay-lg scale-[1.02]' : 'hover:shadow-clay-lg'
                }`}>
                  <input
                    type="radio"
                    name="auctionType"
                    value="standard"
                    checked={auctionType === 'standard'}
                    onChange={() => setAuctionType('standard')}
                    className="sr-only"
                  />
                  <div className="font-bold text-charcoal">Standard Auction</div>
                  <div className="text-sm text-charcoal-light mt-1">Bids are visible to everyone</div>
                </label>
                <label className={`clay-card p-4 cursor-pointer transition-all ${
                  auctionType === 'silent' ? 'ring-3 ring-charcoal shadow-clay-lg scale-[1.02]' : 'hover:shadow-clay-lg'
                }`}>
                  <input
                    type="radio"
                    name="auctionType"
                    value="silent"
                    checked={auctionType === 'silent'}
                    onChange={() => setAuctionType('silent')}
                    className="sr-only"
                  />
                  <div className="font-bold text-charcoal">Silent Auction</div>
                  <div className="text-sm text-charcoal-light mt-1">Bids are hidden until end</div>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-charcoal mb-2">
                  Bid Increment Type
                </label>
                <select
                  value={incrementType}
                  onChange={(e) => setIncrementType(e.target.value as 'fixed' | 'percent')}
                  className="clay-input w-full"
                >
                  <option value="fixed">Fixed Amount ($)</option>
                  <option value="percent">Percentage (%)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-charcoal mb-2">
                  Increment Value
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-light font-bold">
                    {incrementType === 'fixed' ? '$' : '%'}
                  </span>
                  <input
                    type="number"
                    min="1"
                    step={incrementType === 'fixed' ? '1' : '0.5'}
                    value={incrementValue}
                    onChange={(e) => setIncrementValue(e.target.value)}
                    className="clay-input w-full pl-8"
                  />
                </div>
              </div>
            </div>

            <label className="clay-card p-4 flex items-center gap-4 cursor-pointer">
              <input
                type="checkbox"
                checked={buyNowEnabled}
                onChange={(e) => setBuyNowEnabled(e.target.checked)}
                className="w-6 h-6 rounded-lg border-2 border-charcoal-light text-charcoal focus:ring-charcoal"
              />
              <div>
                <div className="font-bold text-charcoal">Enable Buy Now</div>
                <div className="text-sm text-charcoal-light">
                  Allow items to have a "Buy Now" price for instant purchase
                </div>
              </div>
            </label>
          </div>

          {/* Pricing Tier */}
          <div className="clay-card p-6">
            <h2 className="font-bold text-lg text-charcoal mb-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-clay bg-clay-peach flex items-center justify-center">
                <svg className="w-4 h-4 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              Event Size
            </h2>

            <div className="grid grid-cols-2 gap-4">
              {(['small', 'medium', 'large', 'unlimited'] as const).map((t) => {
                const tierPricing = pricingTiers?.[t]
                const tierInfo = tierDescriptions[t]
                return (
                  <label
                    key={t}
                    className={`clay-card p-4 cursor-pointer transition-all ${
                      tier === t ? 'ring-3 ring-charcoal shadow-clay-lg scale-[1.02]' : 'hover:shadow-clay-lg'
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
                    <div className="flex items-center justify-between mb-2">
                      <span className={`clay-badge ${tierInfo.color} text-sm`}>{tierInfo.name}</span>
                      {tierPricing && (
                        <span className="font-black text-charcoal">${tierPricing.fee}</span>
                      )}
                    </div>
                    <div className="text-sm text-charcoal-light">
                      {tierPricing
                        ? tierPricing.maxItems
                          ? `Up to ${tierPricing.maxItems} items`
                          : 'Unlimited items'
                        : tierInfo.description}
                    </div>
                  </label>
                )
              })}
            </div>

            {selectedTierInfo && (
              <div className="mt-6 clay-section bg-clay-mint/30">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-charcoal">Platform fee for this event:</span>
                  <span className="font-display text-3xl font-black text-charcoal">${selectedTierInfo.fee}</span>
                </div>
                <p className="text-sm text-charcoal-light mt-2">
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
            className="w-full clay-button bg-clay-mint font-bold text-lg py-4 disabled:opacity-50"
          >
            {isSubmitting ? 'Creating Event...' : 'Create Event'}
          </button>
        </form>
      </div>
    </div>
  )
}
