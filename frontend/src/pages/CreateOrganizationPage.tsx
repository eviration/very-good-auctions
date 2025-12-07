import { useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { apiClient } from '../services/api'
import type { OrganizationType, CreateOrganizationRequest } from '../types'
import { WizardStep, WizardInput, WizardTextarea, WizardOptionCard, WizardOptionGrid, WizardSuccess } from '../components/wizard'

const ORG_TYPE_OPTIONS: { value: OrganizationType; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: 'nonprofit',
    label: 'Nonprofit',
    description: 'Registered 501(c)(3) or equivalent',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    )
  },
  {
    value: 'school',
    label: 'School',
    description: 'K-12, college, or university',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
      </svg>
    )
  },
  {
    value: 'religious',
    label: 'Religious',
    description: 'Church, temple, mosque, or other',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    )
  },
  {
    value: 'club',
    label: 'Club',
    description: 'Social club, sports team, or group',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    )
  },
  {
    value: 'company',
    label: 'Company',
    description: 'Business running charity auctions',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    )
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Other type of organization',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  },
]

export default function CreateOrganizationPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [createdOrg, setCreatedOrg] = useState<{ id: string; slug: string; name: string } | null>(null)
  const [stripeLoading, setStripeLoading] = useState(false)
  const [stripeError, setStripeError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState<CreateOrganizationRequest>({
    name: '',
    description: '',
    orgType: 'nonprofit',
    contactEmail: '',
    contactPhone: '',
    websiteUrl: '',
    taxId: '',
  })

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      if (!allowedTypes.includes(file.type)) {
        setError('Invalid file type. Please upload a JPG, PNG, GIF, or WebP image.')
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        setError('File too large. Maximum size is 5MB.')
        return
      }
      setLogoFile(file)
      setLogoPreview(URL.createObjectURL(file))
      setError(null)
    }
  }

  const handleRemoveLogo = () => {
    setLogoFile(null)
    if (logoPreview) {
      URL.revokeObjectURL(logoPreview)
      setLogoPreview(null)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)

    try {
      const org = await apiClient.createOrganization(formData)

      if (logoFile) {
        try {
          await apiClient.uploadOrganizationLogo(org.id, logoFile)
        } catch (logoErr) {
          console.error('Failed to upload logo:', logoErr)
        }
      }

      setCreatedOrg({ id: org.id, slug: org.slug, name: org.name })
      setStep(6) // Success step
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization')
    } finally {
      setLoading(false)
    }
  }

  const updateField = <K extends keyof CreateOrganizationRequest>(
    field: K,
    value: CreateOrganizationRequest[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  // Validation for each step
  const isStep1Valid = formData.name.length >= 2
  const isStep2Valid = formData.orgType !== undefined
  const isStep3Valid = formData.contactEmail.includes('@')
  const isStep4Valid = true // Tax info is always skippable
  const isStep5Valid = true // Review is always valid

  // Dynamic encouragement messages
  const getStep1Encouragement = () => {
    if (formData.name.length >= 2) {
      return `"${formData.name}" - what a great name! This is going to be wonderful.`
    }
    return ''
  }

  const getStep2Encouragement = () => {
    const selectedType = ORG_TYPE_OPTIONS.find(o => o.value === formData.orgType)
    if (selectedType) {
      const messages: Record<OrganizationType, string> = {
        nonprofit: "Nonprofits are the heart of community giving. You're doing amazing work!",
        school: "Schools create lasting impact. Your students will love this!",
        religious: "Faith communities bring people together beautifully for good causes.",
        club: "Clubs and groups have such passionate supporters. This will be a hit!",
        company: "Companies giving back make a real difference. How wonderful!",
        other: "Every organization has a unique story to tell. We're excited to help!"
      }
      return messages[formData.orgType]
    }
    return ''
  }

  const getStep3Encouragement = () => {
    if (formData.contactEmail && formData.contactEmail.includes('@')) {
      return "Perfect! We'll keep you updated on everything important."
    }
    return ''
  }

  const handleStripeConnect = async () => {
    if (!createdOrg) return
    setStripeLoading(true)
    setStripeError(null)
    try {
      const { url } = await apiClient.startStripeConnect(createdOrg.id)
      // Redirect to Stripe onboarding
      window.location.href = url
    } catch (err) {
      setStripeError(err instanceof Error ? err.message : 'Failed to start Stripe setup')
      setStripeLoading(false)
    }
  }

  // Step 6: Set Up Payments (Stripe Connect)
  if (step === 6 && createdOrg) {
    return (
      <WizardStep
        stepNumber={6}
        totalSteps={6}
        title="Let's set up payments!"
        subtitle="Here's everything you need to know before connecting with Stripe"
        onNext={() => setStep(7)}
        onBack={() => setStep(5)}
        onSkip={() => setStep(7)}
        isValid={true}
        encouragement="Gather your info first, then breeze through in about 5 minutes!"
        icon={
          <svg className="w-8 h-8 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        }
      >
        {stripeError && (
          <div className="bg-clay-coral/20 border border-clay-coral text-charcoal px-4 py-3 rounded-clay mb-6">
            {stripeError}
          </div>
        )}

        {/* Friendly explanation card */}
        <div className="clay-card bg-clay-sky/30 p-5 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-clay-sky flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-charcoal mb-1">Why Stripe?</h3>
              <p className="text-charcoal-light text-sm">
                Stripe is the same secure payment system used by Amazon, Google, and millions of businesses.
                They handle all the security so you can focus on your fundraising!
              </p>
            </div>
          </div>
        </div>

        {/* Detailed checklist of what Stripe will ask */}
        <div className="clay-card p-5 mb-6">
          <h3 className="font-bold text-charcoal mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-clay-mint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            Gather this info before you start:
          </h3>

          <div className="space-y-4">
            {/* Organization Details */}
            <div className="border-b border-charcoal/10 pb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-clay-butter flex items-center justify-center text-xs font-bold text-charcoal">1</div>
                <h4 className="font-medium text-charcoal">Organization Details</h4>
              </div>
              <ul className="ml-8 text-sm text-charcoal-light space-y-1">
                <li>Legal business name (as registered)</li>
                <li>Business address</li>
                <li>Phone number</li>
                <li>EIN/Tax ID {formData.taxId && <span className="text-clay-mint font-medium">(you already provided this!)</span>}</li>
              </ul>
            </div>

            {/* Representative Info */}
            <div className="border-b border-charcoal/10 pb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-clay-butter flex items-center justify-center text-xs font-bold text-charcoal">2</div>
                <h4 className="font-medium text-charcoal">Your Personal Info (as the representative)</h4>
              </div>
              <ul className="ml-8 text-sm text-charcoal-light space-y-1">
                <li>Full legal name</li>
                <li>Date of birth</li>
                <li>Last 4 digits of SSN (for identity verification)</li>
                <li>Home address</li>
              </ul>
            </div>

            {/* Bank Account */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-clay-butter flex items-center justify-center text-xs font-bold text-charcoal">3</div>
                <h4 className="font-medium text-charcoal">Bank Account for Deposits</h4>
              </div>
              <ul className="ml-8 text-sm text-charcoal-light space-y-1">
                <li>Bank account number</li>
                <li>Routing number</li>
                <li className="text-charcoal-light/70 italic">Tip: Use a checkbook or your bank's online portal to find these</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Pro Tips */}
        <div className="clay-card bg-clay-mint/20 p-5 mb-6">
          <h3 className="font-bold text-charcoal mb-3 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Tips for a smooth setup:
          </h3>
          <ul className="text-sm text-charcoal-light space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-charcoal font-bold">•</span>
              <span><strong className="text-charcoal">For "Business Type":</strong> Select "Non-profit" or "Company" depending on your status</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-charcoal font-bold">•</span>
              <span><strong className="text-charcoal">For "Industry":</strong> Choose "Charities" or "Fundraising"</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-charcoal font-bold">•</span>
              <span><strong className="text-charcoal">Website URL:</strong> You can use your organization's website or social media page</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-charcoal font-bold">•</span>
              <span><strong className="text-charcoal">Product description:</strong> Something like "Online charity auctions and fundraising events"</span>
            </li>
          </ul>
        </div>

        {/* Main CTA button */}
        <button
          onClick={handleStripeConnect}
          disabled={stripeLoading}
          className="w-full clay-button bg-clay-mint text-charcoal font-bold text-lg py-4 flex items-center justify-center gap-3 hover:shadow-clay-lg transition-all disabled:opacity-50"
        >
          {stripeLoading ? (
            <>
              <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Connecting to Stripe...</span>
            </>
          ) : (
            <>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>I'm Ready - Set Up Payments</span>
            </>
          )}
        </button>

        {/* Security reassurance */}
        <div className="mt-5 p-4 bg-clay-surface rounded-clay border border-charcoal/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-clay-lavender flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p className="text-sm text-charcoal-light">
              <span className="font-medium text-charcoal">100% secure:</span> You'll be on Stripe's official website.
              We never see your banking details.
            </p>
          </div>
        </div>

        {/* Skip option */}
        <p className="mt-5 text-center text-charcoal-light text-sm">
          Not ready yet? You can skip this and set up payments later from your dashboard.
        </p>
      </WizardStep>
    )
  }

  // Step 7: Success
  if (step === 7 && createdOrg) {
    return (
      <WizardSuccess
        title="You Did It!"
        message={`${createdOrg.name} is all set up and ready to make a difference. We're so excited to help you raise funds for your cause!`}
        icon={
          <svg className="w-12 h-12 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        }
      >
        <Link
          to={`/organizations/${createdOrg.slug}/manage`}
          className="clay-button clay-button-primary w-full text-center"
        >
          Go to Your Organization Dashboard
        </Link>
        <Link
          to={`/events/create?org=${createdOrg.id}`}
          className="clay-button w-full text-center"
        >
          Create Your First Auction Event
        </Link>
      </WizardSuccess>
    )
  }

  // Step 1: Organization Name & Logo
  if (step === 1) {
    return (
      <WizardStep
        stepNumber={1}
        totalSteps={5}
        title="Let's get to know you!"
        subtitle="First things first - what's your organization called?"
        onNext={() => setStep(2)}
        onBack={() => navigate('/my-organizations')}
        isValid={isStep1Valid}
        encouragement={getStep1Encouragement()}
        icon={
          <svg className="w-8 h-8 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        }
      >
        {error && (
          <div className="bg-clay-coral/20 border border-clay-coral text-charcoal px-4 py-3 rounded-clay mb-6">
            {error}
          </div>
        )}

        <WizardInput
          label="Organization Name"
          hint="This is how people will find you"
          value={formData.name}
          onChange={(e) => updateField('name', e.target.value)}
          placeholder="e.g., Springfield Animal Shelter"
          success={formData.name.length >= 2}
          successMessage="That's a lovely name!"
          required
        />

        <div className="mt-6">
          <label className="block text-sm font-bold text-charcoal mb-2">
            Organization Logo (optional)
          </label>
          <p className="text-sm text-charcoal-light mb-3">
            A logo helps people recognize you - but you can always add this later!
          </p>
          <div className="flex items-start gap-4">
            <div className="w-24 h-24 rounded-clay border-2 border-dashed border-charcoal/20 flex items-center justify-center bg-clay-surface overflow-hidden shadow-clay">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <svg className="w-8 h-8 text-charcoal/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )}
            </div>
            <div className="flex-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleLogoChange}
                className="hidden"
                id="logo-upload"
              />
              <label
                htmlFor="logo-upload"
                className="inline-block clay-button cursor-pointer"
              >
                {logoPreview ? 'Change Logo' : 'Upload Logo'}
              </label>
              {logoPreview && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="ml-2 text-sm text-charcoal-light hover:text-charcoal"
                >
                  Remove
                </button>
              )}
              <p className="text-xs text-charcoal-light mt-2">
                JPG, PNG, GIF or WebP. Max 5MB.
              </p>
            </div>
          </div>
        </div>
      </WizardStep>
    )
  }

  // Step 2: Organization Type
  if (step === 2) {
    return (
      <WizardStep
        stepNumber={2}
        totalSteps={5}
        title="What type of organization are you?"
        subtitle="This helps us tailor the experience for you"
        onNext={() => setStep(3)}
        onBack={() => setStep(1)}
        isValid={isStep2Valid}
        encouragement={getStep2Encouragement()}
        icon={
          <svg className="w-8 h-8 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        }
      >
        <WizardOptionGrid columns={2}>
          {ORG_TYPE_OPTIONS.map((option) => (
            <WizardOptionCard
              key={option.value}
              title={option.label}
              description={option.description}
              icon={option.icon}
              selected={formData.orgType === option.value}
              onClick={() => updateField('orgType', option.value)}
            />
          ))}
        </WizardOptionGrid>
      </WizardStep>
    )
  }

  // Step 3: Contact Information
  if (step === 3) {
    return (
      <WizardStep
        stepNumber={3}
        totalSteps={5}
        title="How can people reach you?"
        subtitle="Your contact info so supporters and bidders can get in touch"
        onNext={() => setStep(4)}
        onBack={() => setStep(2)}
        isValid={isStep3Valid}
        encouragement={getStep3Encouragement()}
        icon={
          <svg className="w-8 h-8 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        }
      >
        {error && (
          <div className="bg-clay-coral/20 border border-clay-coral text-charcoal px-4 py-3 rounded-clay mb-6">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <WizardInput
            label="Contact Email"
            hint="This is where we'll send important updates"
            value={formData.contactEmail}
            onChange={(e) => updateField('contactEmail', e.target.value)}
            placeholder="contact@yourorg.org"
            type="email"
            success={formData.contactEmail.includes('@')}
            required
          />

          <WizardInput
            label="Phone Number"
            hint="Optional, but helpful for urgent matters"
            value={formData.contactPhone || ''}
            onChange={(e) => updateField('contactPhone', e.target.value)}
            placeholder="(555) 123-4567"
            type="tel"
          />

          <WizardInput
            label="Website"
            hint="If you have one - helps build trust with bidders"
            value={formData.websiteUrl || ''}
            onChange={(e) => updateField('websiteUrl', e.target.value)}
            placeholder="https://yourorg.org"
            type="url"
          />
        </div>
      </WizardStep>
    )
  }

  // Step 4: Tax Information - THE MOST IMPORTANT FRIENDLY STEP
  if (step === 4) {
    return (
      <WizardStep
        stepNumber={4}
        totalSteps={5}
        title="One quick thing about taxes..."
        subtitle="Don't worry - this is simpler than it sounds!"
        onNext={() => setStep(5)}
        onBack={() => setStep(3)}
        onSkip={() => setStep(5)}
        isValid={isStep4Valid}
        encouragement={formData.taxId ? "You're doing great! Having this on file makes everything official." : ''}
        icon={
          <svg className="w-8 h-8 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        }
      >
        {/* Reassuring intro card */}
        <div className="clay-card bg-clay-sky/30 p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-clay-sky flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-charcoal mb-1">Why do we ask for this?</h3>
              <p className="text-charcoal-light text-sm">
                Your EIN (Employer Identification Number) helps donors know their contributions are going to a legitimate organization.
                It's like a social security number for your organization - completely safe to share and helps build trust!
              </p>
            </div>
          </div>
        </div>

        {/* The actual input with lots of support */}
        <div className="space-y-4">
          <WizardInput
            label="EIN / Tax ID Number"
            hint="Usually formatted as XX-XXXXXXX (9 digits total)"
            value={formData.taxId || ''}
            onChange={(e) => updateField('taxId', e.target.value)}
            placeholder="XX-XXXXXXX"
            success={Boolean(formData.taxId && formData.taxId.length >= 9)}
            successMessage="Thank you for providing this! Your donors will appreciate it."
          />
        </div>

        {/* Helpful tips */}
        <div className="mt-6 space-y-3">
          <div className="flex items-start gap-3 text-sm">
            <div className="w-6 h-6 rounded-full bg-clay-mint flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-3.5 h-3.5 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-charcoal-light">
              <span className="font-medium text-charcoal">Not sure where to find it?</span> Check your IRS determination letter,
              annual tax filing (Form 990), or ask your bookkeeper or treasurer.
            </p>
          </div>

          <div className="flex items-start gap-3 text-sm">
            <div className="w-6 h-6 rounded-full bg-clay-mint flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-3.5 h-3.5 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-charcoal-light">
              <span className="font-medium text-charcoal">Don't have one yet?</span> That's totally okay!
              You can skip this for now and add it later from your organization settings.
            </p>
          </div>

          <div className="flex items-start gap-3 text-sm">
            <div className="w-6 h-6 rounded-full bg-clay-mint flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-3.5 h-3.5 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-charcoal-light">
              <span className="font-medium text-charcoal">Is this secure?</span> Absolutely! Your information is encrypted
              and we only use it to verify your organization and display on receipts.
            </p>
          </div>
        </div>

        {/* Extra reassurance */}
        <div className="mt-8 p-4 bg-clay-surface rounded-clay border border-charcoal/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-clay-lavender flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p className="text-sm text-charcoal-light">
              <span className="font-medium text-charcoal">Remember:</span> This step is completely optional.
              Many successful auctions run without it. You can always add this information later when you're ready.
            </p>
          </div>
        </div>
      </WizardStep>
    )
  }

  // Step 5: Review & Description
  if (step === 5) {
    return (
      <WizardStep
        stepNumber={5}
        totalSteps={5}
        title="Almost there! Let's review"
        subtitle="Add a description and make sure everything looks good"
        onNext={handleSubmit}
        onBack={() => setStep(4)}
        isValid={isStep5Valid}
        isLoading={loading}
        encouragement="You're just one click away from creating something amazing!"
        icon={
          <svg className="w-8 h-8 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      >
        {error && (
          <div className="bg-clay-coral/20 border border-clay-coral text-charcoal px-4 py-3 rounded-clay mb-6">
            {error}
          </div>
        )}

        {/* Description textarea */}
        <WizardTextarea
          label="Tell people about your organization"
          hint="Share your mission and what makes you special - this appears on your organization's page"
          value={formData.description || ''}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder="We're dedicated to helping... Our mission is... We believe in..."
          rows={4}
        />

        {/* Review summary */}
        <div className="mt-6 clay-card p-6 bg-clay-surface">
          <h3 className="font-bold text-charcoal mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Here's what you're creating:
          </h3>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="w-12 h-12 rounded-clay object-cover shadow-clay" />
              ) : (
                <div className="w-12 h-12 rounded-clay bg-clay-mint flex items-center justify-center shadow-clay">
                  <span className="text-lg font-bold text-charcoal">
                    {formData.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div>
                <p className="font-bold text-charcoal">{formData.name}</p>
                <p className="text-sm text-charcoal-light capitalize">{formData.orgType}</p>
              </div>
            </div>

            <div className="pt-3 border-t border-charcoal/10 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <svg className="w-4 h-4 text-charcoal-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="text-charcoal">{formData.contactEmail}</span>
              </div>

              {formData.contactPhone && (
                <div className="flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4 text-charcoal-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span className="text-charcoal">{formData.contactPhone}</span>
                </div>
              )}

              {formData.websiteUrl && (
                <div className="flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4 text-charcoal-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                  <span className="text-charcoal">{formData.websiteUrl}</span>
                </div>
              )}

              {formData.taxId && (
                <div className="flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4 text-charcoal-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-charcoal">EIN: {formData.taxId}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Final encouragement */}
        <div className="mt-6 text-center">
          <p className="text-charcoal-light text-sm">
            Ready to start making a difference? Click "Continue" to create your organization!
          </p>
        </div>
      </WizardStep>
    )
  }

  return null
}
