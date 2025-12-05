import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { apiClient } from '../services/api'
import type { Organization, EventTier, PricingTiers, CreateEventRequest, OrganizationType } from '../types'
import { WizardStep, WizardInput, WizardTextarea, WizardOptionCard, WizardOptionGrid, WizardSuccess } from '../components/wizard'
import ImageDropZone from '../components/ImageDropZone'

const TOTAL_STEPS = 6

// Organization type options with friendly descriptions
const ORG_TYPES: { value: OrganizationType; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: 'nonprofit',
    label: 'Nonprofit',
    description: 'Registered 501(c)(3) charity or foundation',
    icon: <svg className="w-6 h-6 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>,
  },
  {
    value: 'school',
    label: 'School',
    description: 'K-12, college, PTA, or booster club',
    icon: <svg className="w-6 h-6 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" /></svg>,
  },
  {
    value: 'religious',
    label: 'Religious',
    description: 'Church, synagogue, mosque, or temple',
    icon: <svg className="w-6 h-6 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
  },
  {
    value: 'club',
    label: 'Club or Team',
    description: 'Sports team, social club, or community group',
    icon: <svg className="w-6 h-6 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  },
  {
    value: 'company',
    label: 'Business',
    description: 'Company running a charitable auction',
    icon: <svg className="w-6 h-6 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Any other type of organization',
    icon: <svg className="w-6 h-6 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" /></svg>,
  },
]

// Tier descriptions
const tierInfo: Record<EventTier, { name: string; description: string; color: 'mint' | 'sky' | 'lavender' | 'peach' }> = {
  small: { name: 'Small', description: 'Perfect for intimate fundraisers', color: 'mint' },
  medium: { name: 'Medium', description: 'Great for school auctions', color: 'sky' },
  large: { name: 'Large', description: 'Ideal for charity galas', color: 'lavender' },
  unlimited: { name: 'Unlimited', description: 'No limits on items', color: 'peach' },
}

export default function CreateEventPage() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdEvent, setCreatedEvent] = useState<{ slug: string; name: string } | null>(null)

  // Organization data
  const [myOrganizations, setMyOrganizations] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)
  const [createNewOrg, setCreateNewOrg] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [newOrgType, setNewOrgType] = useState<OrganizationType>('nonprofit')
  const [newOrgEmail, setNewOrgEmail] = useState('')

  // Pricing tiers
  const [pricingTiers, setPricingTiers] = useState<PricingTiers | null>(null)

  // Event details
  const [eventName, setEventName] = useState('')
  const [eventDescription, setEventDescription] = useState('')
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null)
  const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null)

  // Schedule
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('21:00')
  const [submissionDeadline, setSubmissionDeadline] = useState('')

  // Auction settings
  const [auctionType, setAuctionType] = useState<'standard' | 'silent'>('standard')
  const [incrementType, setIncrementType] = useState<'fixed' | 'percent'>('fixed')
  const [incrementValue, setIncrementValue] = useState('5')
  const [buyNowEnabled, setBuyNowEnabled] = useState(true)

  // Tier selection
  const [tier, setTier] = useState<EventTier>('small')

  // Fetch organizations and pricing
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
        // Ignore errors
      }
    }
    fetchData()
  }, [])

  // Set default dates
  useEffect(() => {
    const now = new Date()
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    const dayBeforeStart = new Date(nextWeek.getTime() - 24 * 60 * 60 * 1000)

    setStartDate(nextWeek.toISOString().split('T')[0])
    setEndDate(twoWeeksOut.toISOString().split('T')[0])
    setSubmissionDeadline(dayBeforeStart.toISOString().split('T')[0])
  }, [])

  const handleCoverImageSelect = (file: File) => {
    setCoverImageFile(file)
    if (coverImagePreview) {
      URL.revokeObjectURL(coverImagePreview)
    }
    setCoverImagePreview(URL.createObjectURL(file))
    setError(null)
  }

  const handleRemoveCoverImage = () => {
    setCoverImageFile(null)
    if (coverImagePreview) {
      URL.revokeObjectURL(coverImagePreview)
      setCoverImagePreview(null)
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setError(null)

    try {
      // Create organization if needed
      let organizationId = selectedOrgId

      if (createNewOrg && newOrgName.trim()) {
        const org = await apiClient.createOrganization({
          name: newOrgName.trim(),
          orgType: newOrgType,
          contactEmail: newOrgEmail.trim(),
        })
        organizationId = org.id
      }

      // Create event
      const startDateTime = new Date(`${startDate}T${startTime}:00`).toISOString()
      const endDateTime = new Date(`${endDate}T${endTime}:00`).toISOString()
      const deadlineDateTime = submissionDeadline
        ? new Date(`${submissionDeadline}T23:59:59`).toISOString()
        : undefined

      const payload: CreateEventRequest = {
        name: eventName,
        description: eventDescription || undefined,
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

      // Upload cover image if selected
      if (coverImageFile) {
        try {
          await apiClient.uploadEventCoverImage(event.id, coverImageFile)
        } catch {
          // Continue anyway
        }
      }

      setCreatedEvent({ slug: event.slug, name: event.name })
      setCurrentStep(TOTAL_STEPS + 1) // Success step
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create auction')
      setIsSubmitting(false)
    }
  }

  const nextStep = () => setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS))
  const prevStep = () => setCurrentStep((s) => Math.max(s - 1, 1))

  // Validation
  const isStep1Valid = createNewOrg
    ? newOrgName.trim().length > 0 && newOrgEmail.trim().length > 0
    : true // Can skip org
  const isStep2Valid = eventName.trim().length > 0
  const isStep3Valid = Boolean(startDate && endDate && new Date(endDate) > new Date(startDate))
  const isStep4Valid = true // Auction settings have defaults
  const isStep5Valid = true // Tier has default

  // Success screen
  if (createdEvent) {
    return (
      <WizardSuccess
        title="Your auction is ready!"
        message={`"${createdEvent.name}" has been created successfully. You can now start adding items and inviting participants.`}
      >
        <Link
          to={`/events/${createdEvent.slug}/manage`}
          className="clay-button bg-clay-mint text-charcoal font-bold px-8 py-4 text-lg inline-flex items-center gap-2"
        >
          Set Up Your Auction
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
        <Link
          to={`/events/${createdEvent.slug}`}
          className="block text-charcoal-light font-bold hover:text-charcoal transition-colors mt-4"
        >
          Preview auction page
        </Link>
      </WizardSuccess>
    )
  }

  // Step 1: Organization
  if (currentStep === 1) {
    return (
      <WizardStep
        stepNumber={1}
        totalSteps={TOTAL_STEPS}
        title="Who's hosting this auction?"
        subtitle="Connect your auction to an organization, or run it personally"
        onNext={nextStep}
        showBack={false}
        isValid={isStep1Valid}
        encouragement={createNewOrg && newOrgName ? `Great! "${newOrgName}" will be the host.` : selectedOrgId ? "Perfect! You've selected your organization." : undefined}
        icon={
          <svg className="w-10 h-10 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        }
      >
        <WizardOptionGrid columns={1}>
          <WizardOptionCard
            title="Personal Auction"
            description="Run this auction under your own name"
            selected={!createNewOrg && !selectedOrgId}
            onClick={() => {
              setCreateNewOrg(false)
              setSelectedOrgId(null)
            }}
          />

          {myOrganizations.map((org) => (
            <WizardOptionCard
              key={org.id}
              title={org.name}
              description={`${org.orgType.charAt(0).toUpperCase() + org.orgType.slice(1)} organization`}
              selected={selectedOrgId === org.id && !createNewOrg}
              onClick={() => {
                setSelectedOrgId(org.id)
                setCreateNewOrg(false)
              }}
            />
          ))}

          <WizardOptionCard
            title="Create New Organization"
            description="Set up a new organization for this auction"
            selected={createNewOrg}
            onClick={() => {
              setCreateNewOrg(true)
              setSelectedOrgId(null)
            }}
            badge="New"
            badgeColor="mint"
          />
        </WizardOptionGrid>

        {createNewOrg && (
          <div className="mt-8 p-6 rounded-clay bg-clay-surface space-y-6">
            <WizardInput
              label="What's your organization called?"
              placeholder="e.g., Springfield Elementary PTA"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              required
            />

            <WizardInput
              label="Contact email for the organization"
              type="email"
              placeholder="contact@yourorg.org"
              value={newOrgEmail}
              onChange={(e) => setNewOrgEmail(e.target.value)}
              required
            />

            <div className="space-y-3">
              <label className="text-charcoal font-bold text-lg">What type of organization?</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {ORG_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setNewOrgType(type.value)}
                    className={`clay-card p-4 text-left transition-all ${
                      newOrgType === type.value
                        ? 'ring-2 ring-charcoal shadow-clay-lg scale-[1.02]'
                        : 'hover:shadow-clay-lg'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {type.icon}
                      <span className="font-bold text-charcoal">{type.label}</span>
                    </div>
                    <p className="text-sm text-charcoal-light">{type.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </WizardStep>
    )
  }

  // Step 2: Event Details
  if (currentStep === 2) {
    return (
      <WizardStep
        stepNumber={2}
        totalSteps={TOTAL_STEPS}
        title="Tell us about your auction"
        subtitle="Give your auction a name that will excite bidders"
        onNext={nextStep}
        onBack={prevStep}
        isValid={isStep2Valid}
        encouragement={eventName ? "Love the name! Your auction is going to be amazing." : undefined}
        icon={
          <svg className="w-10 h-10 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        }
      >
        <WizardInput
          label="What should we call your auction?"
          hint="Choose something memorable that tells people what it's for"
          placeholder="e.g., Spring Fundraiser Auction 2024"
          value={eventName}
          onChange={(e) => setEventName(e.target.value)}
          required
          success={eventName.length > 0}
          successMessage="Great name!"
        />

        <WizardTextarea
          label="Add a description (optional)"
          hint="Tell bidders what your auction is raising money for"
          placeholder="Help us raise funds for new playground equipment! All proceeds go directly to..."
          value={eventDescription}
          onChange={(e) => setEventDescription(e.target.value)}
        />

        <div className="space-y-2">
          <label className="text-charcoal font-bold text-lg">Cover image (optional)</label>
          <p className="text-charcoal-light text-sm">A great image makes your auction stand out</p>
          <ImageDropZone
            previewUrl={coverImagePreview}
            onFileSelect={handleCoverImageSelect}
            onRemove={coverImagePreview ? handleRemoveCoverImage : undefined}
            aspectRatio="landscape"
            maxSizeMB={10}
            hint="Drag & drop or click to upload (1200x600px recommended)"
          />
        </div>
      </WizardStep>
    )
  }

  // Step 3: Schedule
  if (currentStep === 3) {
    return (
      <WizardStep
        stepNumber={3}
        totalSteps={TOTAL_STEPS}
        title="When should the auction run?"
        subtitle="Pick dates that give people time to browse and bid"
        onNext={nextStep}
        onBack={prevStep}
        isValid={isStep3Valid}
        encouragement={isStep3Valid ? "Perfect timing! Your auction will run for a great duration." : undefined}
        icon={
          <svg className="w-10 h-10 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <WizardInput
            label="Start date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
          <WizardInput
            label="Start time"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <WizardInput
            label="End date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
          />
          <WizardInput
            label="End time"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
          />
        </div>

        <WizardInput
          label="Item submission deadline (optional)"
          hint="Last day donors can submit items for the auction"
          type="date"
          value={submissionDeadline}
          onChange={(e) => setSubmissionDeadline(e.target.value)}
        />

        {!isStep3Valid && startDate && endDate && (
          <p className="text-clay-coral font-medium">The end date must be after the start date</p>
        )}
      </WizardStep>
    )
  }

  // Step 4: Auction Settings
  if (currentStep === 4) {
    return (
      <WizardStep
        stepNumber={4}
        totalSteps={TOTAL_STEPS}
        title="How should bidding work?"
        subtitle="Choose the style that's right for your event"
        onNext={nextStep}
        onBack={prevStep}
        isValid={isStep4Valid}
        encouragement="These settings look great for your auction!"
        icon={
          <svg className="w-10 h-10 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        }
      >
        <div className="space-y-3">
          <label className="text-charcoal font-bold text-lg">Auction style</label>
          <WizardOptionGrid columns={2}>
            <WizardOptionCard
              title="Standard Auction"
              description="Bids are visible to everyone - creates excitement!"
              selected={auctionType === 'standard'}
              onClick={() => setAuctionType('standard')}
              badge="Popular"
              badgeColor="mint"
            />
            <WizardOptionCard
              title="Silent Auction"
              description="Bids stay hidden until the auction ends"
              selected={auctionType === 'silent'}
              onClick={() => setAuctionType('silent')}
            />
          </WizardOptionGrid>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-charcoal font-bold text-lg">Bid increment type</label>
            <select
              value={incrementType}
              onChange={(e) => setIncrementType(e.target.value as 'fixed' | 'percent')}
              className="clay-input w-full text-lg py-4"
            >
              <option value="fixed">Fixed amount ($)</option>
              <option value="percent">Percentage (%)</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-charcoal font-bold text-lg">Increment value</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-light font-bold text-lg">
                {incrementType === 'fixed' ? '$' : ''}
              </span>
              <input
                type="number"
                min="1"
                step={incrementType === 'fixed' ? '1' : '0.5'}
                value={incrementValue}
                onChange={(e) => setIncrementValue(e.target.value)}
                className={`clay-input w-full text-lg py-4 ${incrementType === 'fixed' ? 'pl-8' : ''}`}
              />
              {incrementType === 'percent' && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-charcoal-light font-bold text-lg">%</span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-charcoal font-bold text-lg">Additional options</label>
          <button
            type="button"
            onClick={() => setBuyNowEnabled(!buyNowEnabled)}
            className={`w-full clay-card p-5 text-left transition-all flex items-center gap-4 ${
              buyNowEnabled ? 'ring-2 ring-charcoal shadow-clay-lg' : ''
            }`}
          >
            <div className={`w-6 h-6 rounded-md flex items-center justify-center ${
              buyNowEnabled ? 'bg-charcoal' : 'bg-clay-surface border-2 border-charcoal/20'
            }`}>
              {buyNowEnabled && (
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <div>
              <span className="font-bold text-charcoal text-lg">Enable "Buy Now" option</span>
              <p className="text-charcoal-light">Allow instant purchases at a set price</p>
            </div>
          </button>
        </div>
      </WizardStep>
    )
  }

  // Step 5: Event Size (Tier)
  if (currentStep === 5) {
    const selectedTierPricing = pricingTiers?.[tier]

    return (
      <WizardStep
        stepNumber={5}
        totalSteps={TOTAL_STEPS}
        title="How big is your auction?"
        subtitle="Pick a plan based on how many items you expect"
        onNext={nextStep}
        onBack={prevStep}
        isValid={isStep5Valid}
        encouragement={`The ${tierInfo[tier].name} plan is a great choice!`}
        icon={
          <svg className="w-10 h-10 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        }
      >
        <WizardOptionGrid columns={2}>
          {(['small', 'medium', 'large', 'unlimited'] as const).map((t) => {
            const info = tierInfo[t]
            const pricing = pricingTiers?.[t]
            return (
              <WizardOptionCard
                key={t}
                title={info.name}
                description={pricing ? (pricing.maxItems ? `Up to ${pricing.maxItems} items` : 'Unlimited items') : info.description}
                selected={tier === t}
                onClick={() => setTier(t)}
                badge={pricing ? `$${pricing.fee}` : undefined}
                badgeColor={info.color}
              />
            )
          })}
        </WizardOptionGrid>

        {selectedTierPricing && (
          <div className="mt-6 p-6 rounded-clay bg-clay-mint/30 border-2 border-clay-mint/50">
            <div className="flex items-center justify-between">
              <span className="font-bold text-charcoal text-lg">Platform fee:</span>
              <span className="font-display text-4xl font-black text-charcoal">${selectedTierPricing.fee}</span>
            </div>
            <p className="text-charcoal-light mt-2">
              {selectedTierPricing.maxItems
                ? `Supports up to ${selectedTierPricing.maxItems} auction items`
                : 'No limit on the number of items'}
            </p>
          </div>
        )}
      </WizardStep>
    )
  }

  // Step 6: Review & Create
  if (currentStep === 6) {
    return (
      <WizardStep
        stepNumber={6}
        totalSteps={TOTAL_STEPS}
        title="Ready to launch?"
        subtitle="Review your auction details and create it"
        onNext={handleSubmit}
        onBack={prevStep}
        nextLabel="Create Auction"
        isValid={!error}
        isLoading={isSubmitting}
        icon={
          <svg className="w-10 h-10 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        }
      >
        {error && (
          <div className="p-4 rounded-clay bg-clay-coral/20 border-2 border-clay-coral/50">
            <p className="text-clay-coral font-bold">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <div className="clay-card p-5">
            <h3 className="font-bold text-charcoal-light text-sm uppercase tracking-wider mb-2">Event Name</h3>
            <p className="font-bold text-charcoal text-xl">{eventName}</p>
          </div>

          {(createNewOrg && newOrgName) || selectedOrgId ? (
            <div className="clay-card p-5">
              <h3 className="font-bold text-charcoal-light text-sm uppercase tracking-wider mb-2">Organization</h3>
              <p className="font-bold text-charcoal text-xl">
                {createNewOrg ? newOrgName : myOrganizations.find((o) => o.id === selectedOrgId)?.name}
              </p>
            </div>
          ) : null}

          <div className="clay-card p-5">
            <h3 className="font-bold text-charcoal-light text-sm uppercase tracking-wider mb-2">Schedule</h3>
            <p className="text-charcoal">
              <span className="font-bold">{new Date(startDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span> at {startTime}
              <span className="text-charcoal-light"> to </span>
              <span className="font-bold">{new Date(endDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span> at {endTime}
            </p>
          </div>

          <div className="clay-card p-5">
            <h3 className="font-bold text-charcoal-light text-sm uppercase tracking-wider mb-2">Auction Type</h3>
            <p className="font-bold text-charcoal text-xl capitalize">{auctionType}</p>
            <p className="text-charcoal-light">
              {incrementType === 'fixed' ? `$${incrementValue}` : `${incrementValue}%`} bid increments
              {buyNowEnabled && ' • Buy Now enabled'}
            </p>
          </div>

          <div className="clay-card p-5">
            <h3 className="font-bold text-charcoal-light text-sm uppercase tracking-wider mb-2">Plan</h3>
            <div className="flex items-center justify-between">
              <p className="font-bold text-charcoal text-xl">{tierInfo[tier].name}</p>
              {pricingTiers?.[tier] && (
                <span className={`clay-badge bg-clay-${tierInfo[tier].color} font-black text-lg px-4 py-1`}>
                  ${pricingTiers[tier].fee}
                </span>
              )}
            </div>
          </div>
        </div>
      </WizardStep>
    )
  }

  return null
}
