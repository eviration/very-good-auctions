import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import { apiClient } from '../services/api'
import type { AuctionEvent, SubmitItemRequest } from '../types'
import { loginRequest } from '../auth/authConfig'
import { WizardStep, WizardInput, WizardTextarea, WizardOptionCard, WizardOptionGrid, WizardSuccess } from '../components/wizard'

const TOTAL_STEPS = 4

const CONDITIONS = [
  { value: 'new', label: 'Brand New', description: 'Never used, in original packaging' },
  { value: 'like-new', label: 'Like New', description: 'Used once or twice, looks perfect' },
  { value: 'excellent', label: 'Excellent', description: 'Light use, no visible wear' },
  { value: 'good', label: 'Good', description: 'Normal use, minor wear' },
  { value: 'fair', label: 'Fair', description: 'Noticeable wear, still functional' },
]

export default function SubmitItemPage() {
  const { slug } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { instance, accounts } = useMsal()
  const isAuthenticated = accounts.length > 0

  const [event, setEvent] = useState<AuctionEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [submittedItem, setSubmittedItem] = useState<{ title: string } | null>(null)

  const [accessCode, setAccessCode] = useState(searchParams.get('code') || '')
  const [accessVerified, setAccessVerified] = useState(false)
  const [verifyingAccess, setVerifyingAccess] = useState(false)

  // Form fields
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [condition, setCondition] = useState('')
  const [startingPrice, setStartingPrice] = useState('')
  const [buyNowPrice, setBuyNowPrice] = useState('')
  const [selectedImages, setSelectedImages] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])

  useEffect(() => {
    const fetchEvent = async () => {
      if (!slug) return

      try {
        setLoading(true)
        const eventData = await apiClient.getEvent(slug)
        setEvent(eventData)

        // Auto-verify if code is in URL
        if (accessCode && eventData.accessCode) {
          const result = await apiClient.verifyEventAccess(eventData.id, accessCode)
          if (result.valid) {
            setAccessVerified(true)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load event')
      } finally {
        setLoading(false)
      }
    }

    fetchEvent()
  }, [slug, accessCode])

  const handleVerifyAccess = async () => {
    if (!event || !accessCode) return

    setVerifyingAccess(true)
    try {
      const result = await apiClient.verifyEventAccess(event.id, accessCode)
      if (result.valid) {
        setAccessVerified(true)
      } else {
        setError('Invalid access code')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify access')
    } finally {
      setVerifyingAccess(false)
    }
  }

  const handleLogin = () => {
    instance.loginRedirect(loginRequest)
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const newImages = [...selectedImages, ...files].slice(0, 20)
    setSelectedImages(newImages)

    const newPreviews = newImages.map((file) => URL.createObjectURL(file))
    imagePreviews.forEach((url) => URL.revokeObjectURL(url))
    setImagePreviews(newPreviews)
  }

  const removeImage = (index: number) => {
    URL.revokeObjectURL(imagePreviews[index])
    setSelectedImages((prev) => prev.filter((_, i) => i !== index))
    setImagePreviews((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (!event) return

    setIsSubmitting(true)
    setError(null)

    try {
      const payload: SubmitItemRequest = {
        title,
        description: description || undefined,
        condition: condition || undefined,
        startingPrice: startingPrice ? parseFloat(startingPrice) : undefined,
        buyNowPrice: buyNowPrice ? parseFloat(buyNowPrice) : undefined,
        accessCode,
      }

      const item = await apiClient.submitEventItem(event.id, payload)

      // Upload images if any
      if (selectedImages.length > 0) {
        try {
          await Promise.all(
            selectedImages.map((file) =>
              apiClient.uploadEventItemImage(event.id, item.id, file)
            )
          )
        } catch (imgError) {
          console.error('Image upload failed:', imgError)
        }
      }

      setSubmittedItem({ title })
      setCurrentStep(TOTAL_STEPS + 1) // Success step
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit item')
      setIsSubmitting(false)
    }
  }

  const nextStep = () => setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS))
  const prevStep = () => setCurrentStep((s) => Math.max(s - 1, 1))

  // Validation
  const isStep1Valid = title.trim().length > 0
  const isStep2Valid = true // Condition is optional
  const isStep3Valid = true // Images are optional

  if (loading) {
    return (
      <div className="min-h-screen bg-clay-bg flex items-center justify-center">
        <div className="w-16 h-16 rounded-clay bg-clay-mint shadow-clay flex items-center justify-center animate-pulse">
          <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (error && !event) {
    return (
      <div className="min-h-screen bg-clay-bg flex items-center justify-center p-4">
        <div className="clay-card p-8 text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-clay-coral/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-clay-coral" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-black text-white mb-2">Oops!</h1>
          <p className="text-white/70">{error}</p>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-clay-bg flex items-center justify-center p-4">
        <div className="clay-card p-8 text-center max-w-md">
          <h1 className="font-display text-2xl font-black text-white mb-2">Event Not Found</h1>
          <p className="text-white/70">We couldn't find the auction you're looking for.</p>
        </div>
      </div>
    )
  }

  // Check submission deadline
  const deadlinePassed = event.submissionDeadline && new Date(event.submissionDeadline) < new Date()
  const eventEnded = new Date(event.endTime) < new Date()

  if (deadlinePassed || eventEnded) {
    return (
      <div className="min-h-screen bg-clay-bg flex items-center justify-center p-4">
        <div className="clay-card p-8 md:p-12 text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-clay-butter flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="font-display text-3xl font-black text-white mb-3">Submissions Closed</h1>
          <p className="text-white/70 text-lg mb-8">
            {eventEnded
              ? 'This auction has ended.'
              : 'The submission deadline for this event has passed.'}
          </p>
          <Link
            to={`/events/${slug}`}
            className="clay-button bg-clay-mint text-white font-bold px-6 py-3"
          >
            View Auction
          </Link>
        </div>
      </div>
    )
  }

  // Access code required
  if (event.accessCode && !accessVerified) {
    return (
      <div className="min-h-screen bg-clay-bg flex items-center justify-center p-4">
        <div className="clay-card p-8 md:p-12 text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-clay-lavender flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="font-display text-3xl font-black text-white mb-3">Enter Access Code</h1>
          <p className="text-white/70 text-lg mb-8">
            This auction requires an access code to submit items to <strong>{event.name}</strong>
          </p>

          {error && (
            <div className="mb-6 p-4 rounded-clay bg-clay-coral/20 border-2 border-clay-coral/50">
              <p className="text-clay-coral font-bold">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <input
              type="text"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
              placeholder="Enter code"
              className="clay-input w-full text-center text-xl font-mono uppercase py-4"
            />
            <button
              onClick={handleVerifyAccess}
              disabled={!accessCode || verifyingAccess}
              className="clay-button bg-clay-mint text-white font-bold w-full py-4 text-lg disabled:opacity-50"
            >
              {verifyingAccess ? 'Verifying...' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Not logged in
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-clay-bg flex items-center justify-center p-4">
        <div className="clay-card p-8 md:p-12 text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-clay-sky flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="font-display text-3xl font-black text-white mb-3">Sign In to Continue</h1>
          <p className="text-white/70 text-lg mb-8">
            You need to sign in to submit an item to <strong>{event.name}</strong>
          </p>
          <button
            onClick={handleLogin}
            className="clay-button bg-clay-mint text-white font-bold w-full py-4 text-lg"
          >
            Sign In
          </button>
        </div>
      </div>
    )
  }

  // Success screen
  if (submittedItem) {
    return (
      <WizardSuccess
        title="Item submitted!"
        message={`"${submittedItem.title}" has been submitted to ${event.name}. The organizer will review it before it appears in the auction.`}
      >
        <Link
          to={`/events/${slug}`}
          className="clay-button bg-clay-mint text-white font-bold px-8 py-4 text-lg inline-flex items-center gap-2"
        >
          View Auction
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
        <button
          onClick={() => {
            setCurrentStep(1)
            setTitle('')
            setDescription('')
            setCondition('')
            setStartingPrice('')
            setBuyNowPrice('')
            setSelectedImages([])
            setImagePreviews([])
            setSubmittedItem(null)
          }}
          className="block text-white/70 font-bold hover:text-white transition-colors mt-4 mx-auto"
        >
          Submit another item
        </button>
      </WizardSuccess>
    )
  }

  // Step 1: Item Details
  if (currentStep === 1) {
    return (
      <WizardStep
        stepNumber={1}
        totalSteps={TOTAL_STEPS}
        title="What are you donating?"
        subtitle={`Help raise funds for ${event.name}`}
        onNext={nextStep}
        showBack={false}
        isValid={isStep1Valid}
        encouragement={title ? `"${title}" sounds like a great item!` : undefined}
        icon={
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        }
      >
        <WizardInput
          label="What is the item called?"
          hint="Be descriptive so bidders know what they're getting"
          placeholder="e.g., Vintage Record Collection, Handmade Quilt"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          success={title.length > 0}
          successMessage="Great name!"
        />

        <WizardTextarea
          label="Tell us more about it (optional)"
          hint="Include details like brand, size, history, or why it's special"
          placeholder="This is a collection of 50 vinyl records from the 1960s and 70s, all in excellent condition..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </WizardStep>
    )
  }

  // Step 2: Condition
  if (currentStep === 2) {
    return (
      <WizardStep
        stepNumber={2}
        totalSteps={TOTAL_STEPS}
        title="What condition is it in?"
        subtitle="Help bidders know what to expect"
        onNext={nextStep}
        onBack={prevStep}
        isValid={isStep2Valid}
        showSkip={!condition}
        onSkip={nextStep}
        encouragement={condition ? "Thanks for being honest about the condition!" : undefined}
        icon={
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      >
        <WizardOptionGrid columns={1}>
          {CONDITIONS.map((c) => (
            <WizardOptionCard
              key={c.value}
              title={c.label}
              description={c.description}
              selected={condition === c.value}
              onClick={() => setCondition(c.value)}
            />
          ))}
        </WizardOptionGrid>
      </WizardStep>
    )
  }

  // Step 3: Photos
  if (currentStep === 3) {
    return (
      <WizardStep
        stepNumber={3}
        totalSteps={TOTAL_STEPS}
        title="Add some photos"
        subtitle="Good photos help items sell for more!"
        onNext={nextStep}
        onBack={prevStep}
        isValid={isStep3Valid}
        showSkip={selectedImages.length === 0}
        onSkip={nextStep}
        encouragement={selectedImages.length > 0 ? `${selectedImages.length} photo${selectedImages.length !== 1 ? 's' : ''} added - looking good!` : undefined}
        icon={
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        }
      >
        {imagePreviews.length > 0 ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {imagePreviews.map((preview, index) => (
                <div key={index} className="relative group aspect-square">
                  <img
                    src={preview}
                    alt={`Preview ${index + 1}`}
                    className="w-full h-full object-cover rounded-clay shadow-clay-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute top-2 right-2 w-8 h-8 bg-clay-coral text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-clay-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  {index === 0 && (
                    <div className="absolute bottom-2 left-2 px-2 py-1 bg-clay-mint rounded-clay-pill text-xs font-bold text-white shadow-clay-sm">
                      Primary
                    </div>
                  )}
                </div>
              ))}
            </div>

            {selectedImages.length < 20 && (
              <label className="block clay-card p-6 text-center cursor-pointer hover:shadow-clay-lg transition-shadow">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
                <span className="text-white font-bold">+ Add more photos</span>
                <span className="text-white/70 ml-2">({20 - selectedImages.length} remaining)</span>
              </label>
            )}
          </div>
        ) : (
          <label className="block clay-card p-12 text-center cursor-pointer hover:shadow-clay-lg transition-shadow">
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
            />
            <div className="w-16 h-16 rounded-full bg-clay-surface mx-auto mb-4 flex items-center justify-center">
              <svg className="w-8 h-8 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-white font-bold text-lg mb-1">Click to upload photos</p>
            <p className="text-white/70">PNG, JPG, GIF up to 10MB each (max 20 photos)</p>
          </label>
        )}
      </WizardStep>
    )
  }

  // Step 4: Pricing & Review
  if (currentStep === 4) {
    return (
      <WizardStep
        stepNumber={4}
        totalSteps={TOTAL_STEPS}
        title="Ready to submit?"
        subtitle="Suggest a starting price or let the organizer decide"
        onNext={handleSubmit}
        onBack={prevStep}
        nextLabel="Submit Item"
        isValid={!error}
        isLoading={isSubmitting}
        icon={
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        }
      >
        {error && (
          <div className="p-4 rounded-clay bg-clay-coral/20 border-2 border-clay-coral/50">
            <p className="text-clay-coral font-bold">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-white font-bold text-lg">Suggested starting price</label>
            <p className="text-white/70 text-sm">Optional - organizer may adjust</p>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 font-bold text-lg">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={startingPrice}
                onChange={(e) => setStartingPrice(e.target.value)}
                className="clay-input w-full text-lg py-4 pl-8"
                placeholder="0"
              />
            </div>
          </div>

          {event.buyNowEnabled && (
            <div className="space-y-2">
              <label className="text-white font-bold text-lg">Buy Now price</label>
              <p className="text-white/70 text-sm">Optional instant purchase price</p>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 font-bold text-lg">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={buyNowPrice}
                  onChange={(e) => setBuyNowPrice(e.target.value)}
                  className="clay-input w-full text-lg py-4 pl-8"
                  placeholder="0"
                />
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 space-y-4">
          <h3 className="font-bold text-white text-lg">Review your submission</h3>

          <div className="clay-card p-5">
            <h4 className="font-bold text-white/70 text-sm uppercase tracking-wider mb-2">Item</h4>
            <p className="font-bold text-white text-xl">{title}</p>
            {condition && (
              <p className="text-white/70 mt-1">
                Condition: {CONDITIONS.find((c) => c.value === condition)?.label || condition}
              </p>
            )}
          </div>

          {selectedImages.length > 0 && (
            <div className="clay-card p-5">
              <h4 className="font-bold text-white/70 text-sm uppercase tracking-wider mb-3">Photos</h4>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {imagePreviews.slice(0, 5).map((preview, index) => (
                  <img
                    key={index}
                    src={preview}
                    alt={`Preview ${index + 1}`}
                    className="w-16 h-16 object-cover rounded-clay shadow-clay-sm flex-shrink-0"
                  />
                ))}
                {selectedImages.length > 5 && (
                  <div className="w-16 h-16 rounded-clay bg-clay-surface flex items-center justify-center flex-shrink-0">
                    <span className="font-bold text-white/70">+{selectedImages.length - 5}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <p className="text-white/70 text-center text-sm">
            Your submission will be reviewed by the organizer before appearing in the auction.
          </p>
        </div>
      </WizardStep>
    )
  }

  return null
}
