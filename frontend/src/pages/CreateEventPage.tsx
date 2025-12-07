import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { apiClient } from '../services/api'
import type { Organization, CreateEventRequest, OrganizationType } from '../types'
import { WizardStep, WizardInput, WizardTextarea, WizardOptionCard, WizardOptionGrid, WizardSuccess } from '../components/wizard'
import ImageDropZone from '../components/ImageDropZone'

const TOTAL_STEPS = 5 // Reduced from 6 - removed tier selection step

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

  // Fetch organizations
  useEffect(() => {
    const fetchData = async () => {
      try {
        const orgs = await apiClient.getMyOrganizations().catch(() => [])
        setMyOrganizations(orgs)
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

  // State to track if we need Stripe setup after org creation
  const [needsStripeSetup, setNeedsStripeSetup] = useState<{ orgSlug: string; orgName: string } | null>(null)

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
        // New organizations need Stripe Connect setup before creating auctions
        setNeedsStripeSetup({ orgSlug: org.slug, orgName: org.name })
        setCurrentStep(TOTAL_STEPS + 1) // Go to success/Stripe setup step
        setIsSubmitting(false)
        return
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

  // Stripe setup required screen (when new org was created)
  if (needsStripeSetup) {
    return (
      <WizardSuccess
        title="Organization created!"
        message={`"${needsStripeSetup.orgName}" has been created. Before you can create auctions, you need to complete Stripe Connect setup to receive payments.`}
      >
        <Link
          to={`/organizations/${needsStripeSetup.orgSlug}/dashboard`}
          className="clay-button bg-clay-mint text-charcoal font-bold px-8 py-4 text-lg inline-flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Complete Stripe Setup
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
        <p className="text-charcoal-light mt-4 text-sm">
          After completing Stripe setup, you can return here to create your auction.
        </p>
        <Link
          to="/events/create"
          onClick={() => {
            setNeedsStripeSetup(null)
            setCurrentStep(1)
            setCreateNewOrg(false)
          }}
          className="block text-charcoal-light font-bold hover:text-charcoal transition-colors mt-2"
        >
          Start over
        </Link>
      </WizardSuccess>
    )
  }

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

          {myOrganizations.map((org) => {
            const isStripeVerified = org.stripeChargesEnabled && org.stripePayoutsEnabled
            return (
              <div key={org.id} className="relative">
                <WizardOptionCard
                  title={org.name}
                  description={
                    isStripeVerified
                      ? `${org.orgType.charAt(0).toUpperCase() + org.orgType.slice(1)} organization`
                      : 'Complete Stripe Connect setup to create auctions'
                  }
                  selected={selectedOrgId === org.id && !createNewOrg}
                  onClick={() => {
                    if (isStripeVerified) {
                      setSelectedOrgId(org.id)
                      setCreateNewOrg(false)
                    }
                  }}
                  badge={isStripeVerified ? undefined : 'Setup Required'}
                  badgeColor={isStripeVerified ? undefined : 'peach'}
                  disabled={!isStripeVerified}
                />
                {!isStripeVerified && (
                  <Link
                    to={`/organizations/${org.slug}/dashboard`}
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-sage hover:text-sage/80 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Complete Stripe Setup
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                )}
              </div>
            )
          })}

          <div>
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
            {createNewOrg && (
              <p className="mt-2 text-sm text-charcoal-light flex items-center gap-1">
                <svg className="w-4 h-4 text-clay-peach" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                You'll need to complete Stripe Connect setup after creating your organization to receive payments.
              </p>
            )}
          </div>
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

  // Step 5: Review & Create
  if (currentStep === 5) {
    // Determine which section has the error based on error message keywords
    const getErrorSection = (errorMsg: string | null): 'name' | 'org' | 'schedule' | 'settings' | null => {
      if (!errorMsg) return null
      const lowerError = errorMsg.toLowerCase()
      if (lowerError.includes('name')) return 'name'
      if (lowerError.includes('organization')) return 'org'
      if (lowerError.includes('deadline') || lowerError.includes('start') || lowerError.includes('end') || lowerError.includes('date') || lowerError.includes('time')) return 'schedule'
      if (lowerError.includes('bid') || lowerError.includes('increment') || lowerError.includes('auction type')) return 'settings'
      return null
    }

    const errorSection = getErrorSection(error)

    // Helper to determine step number for each section
    const sectionToStep: Record<string, number> = {
      name: 2,
      org: 1,
      schedule: 3,
      settings: 4,
    }

    // Clickable review card component
    const ReviewCard = ({
      section,
      title,
      children
    }: {
      section: 'name' | 'org' | 'schedule' | 'settings'
      title: string
      children: React.ReactNode
    }) => {
      const hasError = errorSection === section
      const stepNumber = sectionToStep[section]

      return (
        <button
          type="button"
          onClick={() => {
            setError(null) // Clear error when navigating away
            setCurrentStep(stepNumber)
          }}
          className={`w-full text-left clay-card p-5 transition-all group ${
            hasError
              ? 'ring-2 ring-clay-coral bg-clay-coral/10 hover:bg-clay-coral/20'
              : 'hover:shadow-clay-lg hover:scale-[1.01]'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className={`font-bold text-sm uppercase tracking-wider mb-2 ${
                hasError ? 'text-clay-coral' : 'text-charcoal-light'
              }`}>
                {title}
                {hasError && (
                  <span className="ml-2 inline-flex items-center">
                    <svg className="w-4 h-4 text-clay-coral" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </span>
                )}
              </h3>
              {children}
            </div>
            <div className={`ml-4 p-2 rounded-full transition-colors ${
              hasError
                ? 'bg-clay-coral/20 text-clay-coral'
                : 'bg-clay-surface text-charcoal-light group-hover:bg-clay-mint group-hover:text-charcoal'
            }`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>
          </div>
          {hasError && (
            <p className="mt-2 text-sm text-clay-coral font-medium flex items-center gap-1">
              <span>Click to fix this issue</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </p>
          )}
        </button>
      )
    }

    return (
      <WizardStep
        stepNumber={5}
        totalSteps={TOTAL_STEPS}
        title="Ready to launch?"
        subtitle="Review your auction details and create it"
        onNext={handleSubmit}
        onBack={prevStep}
        nextLabel="Create Auction"
        isValid={true}
        isLoading={isSubmitting}
        icon={
          <svg className="w-10 h-10 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        }
      >
        {error && (
          <div className="p-4 rounded-clay bg-clay-coral/20 border-2 border-clay-coral/50 mb-2">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-clay-coral flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-clay-coral font-bold">{error}</p>
                {errorSection && (
                  <p className="text-charcoal-light text-sm mt-1">
                    Click the highlighted section below to fix this.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <ReviewCard section="name" title="Event Name">
            <p className="font-bold text-charcoal text-xl">{eventName}</p>
          </ReviewCard>

          {(createNewOrg && newOrgName) || selectedOrgId ? (
            <ReviewCard section="org" title="Organization">
              <p className="font-bold text-charcoal text-xl">
                {createNewOrg ? newOrgName : myOrganizations.find((o) => o.id === selectedOrgId)?.name}
              </p>
            </ReviewCard>
          ) : null}

          <ReviewCard section="schedule" title="Schedule">
            <p className="text-charcoal">
              <span className="font-bold">{new Date(startDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span> at {startTime}
              <span className="text-charcoal-light"> to </span>
              <span className="font-bold">{new Date(endDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span> at {endTime}
            </p>
            {submissionDeadline && (
              <p className="text-charcoal-light text-sm mt-1">
                Submission deadline: {new Date(submissionDeadline).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            )}
          </ReviewCard>

          <ReviewCard section="settings" title="Auction Type">
            <p className="font-bold text-charcoal text-xl capitalize">{auctionType}</p>
            <p className="text-charcoal-light">
              {incrementType === 'fixed' ? `$${incrementValue}` : `${incrementValue}%`} bid increments
              {buyNowEnabled && ' • Buy Now enabled'}
            </p>
          </ReviewCard>

        </div>

        {/* Pricing info */}
        <div className="mt-6 p-4 rounded-clay bg-clay-mint/20 border-2 border-clay-mint/30">
          <p className="text-charcoal-light text-sm">
            <span className="font-bold text-charcoal">Free to create.</span>{' '}
            $1 per item sold (deducted from proceeds). No upfront costs.
          </p>
        </div>

        <p className="text-center text-charcoal-light text-sm mt-4">
          Click any section above to make changes
        </p>
      </WizardStep>
    )
  }

  return null
}
