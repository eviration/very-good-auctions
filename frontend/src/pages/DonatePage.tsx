import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { apiClient } from '../services/api'
import { WizardStep, WizardInput, WizardTextarea, WizardOptionCard, WizardOptionGrid, WizardSuccess } from '../components/wizard'

const TOTAL_STEPS = 4

const CONDITIONS = [
  { value: 'new', label: 'Brand New', description: 'Never used, in original packaging' },
  { value: 'like_new', label: 'Like New', description: 'Used once or twice, looks perfect' },
  { value: 'good', label: 'Good', description: 'Normal use, minor wear' },
  { value: 'fair', label: 'Fair', description: 'Noticeable wear, still functional' },
  { value: 'for_parts', label: 'For Parts', description: 'Not fully functional, for parts only' },
]

interface DonationEventInfo {
  event: {
    id: string
    name: string
    description: string | null
    startsAt: string
    endsAt: string
  }
  organization: {
    name: string
    logoUrl: string | null
  }
  settings: {
    requiresContact: boolean
    requireValueEstimate: boolean
    maxImages: number
    instructions: string | null
  }
}

export default function DonatePage() {
  const { code } = useParams<{ code: string }>()

  const [eventInfo, setEventInfo] = useState<DonationEventInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [submittedItem, setSubmittedItem] = useState<{ name: string } | null>(null)

  // Form fields
  const [itemName, setItemName] = useState('')
  const [description, setDescription] = useState('')
  const [condition, setCondition] = useState('')
  const [estimatedValue, setEstimatedValue] = useState('')
  const [donorName, setDonorName] = useState('')
  const [donorEmail, setDonorEmail] = useState('')
  const [donorPhone, setDonorPhone] = useState('')
  const [donorNotes, setDonorNotes] = useState('')
  const [donorAnonymous, setDonorAnonymous] = useState(false)
  const [selectedImages, setSelectedImages] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [uploadedImageIds, setUploadedImageIds] = useState<string[]>([])
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)

  useEffect(() => {
    const fetchEventInfo = async () => {
      if (!code) return

      try {
        setLoading(true)
        const data = await apiClient.getDonationEventInfo(code)
        setEventInfo(data)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load event'
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    fetchEventInfo()
  }, [code])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const maxImages = eventInfo?.settings.maxImages || 5
    const newImages = [...selectedImages, ...files].slice(0, maxImages)
    setSelectedImages(newImages)

    const newPreviews = newImages.map((file) => URL.createObjectURL(file))
    imagePreviews.forEach((url) => URL.revokeObjectURL(url))
    setImagePreviews(newPreviews)
  }

  const removeImage = (index: number) => {
    URL.revokeObjectURL(imagePreviews[index])
    setSelectedImages((prev) => prev.filter((_, i) => i !== index))
    setImagePreviews((prev) => prev.filter((_, i) => i !== index))
    setUploadedImageIds((prev) => prev.filter((_, i) => i !== index))
  }

  const uploadImages = async (): Promise<string[]> => {
    if (!code || selectedImages.length === 0) return []

    const imageIds: string[] = []
    for (let i = 0; i < selectedImages.length; i++) {
      setUploadProgress(`Uploading image ${i + 1} of ${selectedImages.length}...`)
      try {
        const result = await apiClient.uploadDonationImage(code, selectedImages[i])
        imageIds.push(result.imageId)
      } catch (err) {
        console.error('Failed to upload image:', err)
      }
    }
    setUploadProgress(null)
    return imageIds
  }

  const handleSubmit = async () => {
    if (!code || !eventInfo) return

    setIsSubmitting(true)
    setError(null)

    try {
      // Upload images first
      const imageIds = await uploadImages()
      setUploadedImageIds(imageIds)

      // Submit the donation
      await apiClient.submitDonation(code, {
        name: itemName.trim(),
        description: description.trim() || undefined,
        estimatedValue: estimatedValue ? parseFloat(estimatedValue) : undefined,
        condition: condition || undefined,
        donorName: donorName.trim() || undefined,
        donorEmail: donorEmail.trim() || undefined,
        donorPhone: donorPhone.trim() || undefined,
        donorNotes: donorNotes.trim() || undefined,
        donorAnonymous,
        imageIds: imageIds.length > 0 ? imageIds : undefined,
      })

      setSubmittedItem({ name: itemName })
      setCurrentStep(TOTAL_STEPS + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit item')
    } finally {
      setIsSubmitting(false)
    }
  }

  const nextStep = () => setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS))
  const prevStep = () => setCurrentStep((s) => Math.max(s - 1, 1))

  // Validation
  const isStep1Valid = itemName.trim().length > 0
  const isStep2Valid = !eventInfo?.settings.requireValueEstimate || (estimatedValue !== '' && parseFloat(estimatedValue) > 0)
  const isStep3Valid = !eventInfo?.settings.requiresContact || (donorEmail.trim().length > 0)

  if (loading) {
    return (
      <div className="min-h-screen bg-clay-bg flex items-center justify-center">
        <div className="w-16 h-16 rounded-clay bg-clay-mint shadow-clay flex items-center justify-center animate-pulse">
          <div className="w-8 h-8 border-3 border-charcoal border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (error && !eventInfo) {
    return (
      <div className="min-h-screen bg-clay-bg flex items-center justify-center p-4">
        <div className="clay-card p-8 text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-clay-coral/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-clay-coral" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-black text-charcoal mb-2">
            {error.includes('not found') || error.includes('404') ? 'Link Not Found' : 'Oops!'}
          </h1>
          <p className="text-charcoal-light">
            {error.includes('expired') ? 'This donation link has expired.' :
             error.includes('ended') ? 'This event has ended and is no longer accepting donations.' :
             error.includes('not found') || error.includes('404') ? 'This donation link is invalid or has been removed.' :
             error}
          </p>
        </div>
      </div>
    )
  }

  if (!eventInfo) {
    return null
  }

  // Success screen
  if (submittedItem) {
    return (
      <WizardSuccess
        title="Thank you for your donation!"
        message={`"${submittedItem.name}" has been submitted to ${eventInfo.event.name}. The organizer will review it and you'll receive an email when it's approved.`}
      >
        <button
          onClick={() => {
            setCurrentStep(1)
            setItemName('')
            setDescription('')
            setCondition('')
            setEstimatedValue('')
            setDonorNotes('')
            setSelectedImages([])
            setImagePreviews([])
            setUploadedImageIds([])
            setSubmittedItem(null)
          }}
          className="clay-button bg-clay-mint text-charcoal font-bold px-8 py-4 text-lg"
        >
          Donate Another Item
        </button>
        <Link
          to="/"
          className="block text-charcoal-light font-bold hover:text-charcoal transition-colors mt-4 mx-auto"
        >
          Back to Home
        </Link>
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
        subtitle={`Donate to ${eventInfo.event.name} by ${eventInfo.organization.name}`}
        onNext={nextStep}
        showBack={false}
        isValid={isStep1Valid}
        encouragement={itemName ? `"${itemName}" sounds like a great item!` : undefined}
        icon={
          <svg className="w-10 h-10 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        }
      >
        {eventInfo.settings.instructions && (
          <div className="mb-6 p-4 rounded-clay bg-clay-sky/30 border-2 border-clay-sky">
            <p className="text-charcoal text-sm">{eventInfo.settings.instructions}</p>
          </div>
        )}

        <WizardInput
          label="What is the item called?"
          hint="Be descriptive so bidders know what they're getting"
          placeholder="e.g., Vintage Record Collection, Handmade Quilt"
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          required
          success={itemName.length > 0}
          successMessage="Great name!"
        />

        <WizardTextarea
          label="Tell us more about it (optional)"
          hint="Include details like brand, size, history, or why it's special"
          placeholder="This is a collection of 50 vinyl records from the 1960s and 70s, all in excellent condition..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="space-y-4">
          <label className="text-charcoal font-bold text-lg">What condition is it in?</label>
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
        </div>
      </WizardStep>
    )
  }

  // Step 2: Value & Photos
  if (currentStep === 2) {
    const maxImages = eventInfo.settings.maxImages || 5
    return (
      <WizardStep
        stepNumber={2}
        totalSteps={TOTAL_STEPS}
        title="Photos and Value"
        subtitle="Help the organizers understand your item"
        onNext={nextStep}
        onBack={prevStep}
        isValid={isStep2Valid}
        encouragement={selectedImages.length > 0 ? `${selectedImages.length} photo${selectedImages.length !== 1 ? 's' : ''} added!` : undefined}
        icon={
          <svg className="w-10 h-10 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        }
      >
        <div className="space-y-2 mb-6">
          <label className="text-charcoal font-bold text-lg">
            Estimated Value {eventInfo.settings.requireValueEstimate && <span className="text-clay-coral">*</span>}
          </label>
          <p className="text-charcoal-light text-sm">What do you think this item is worth?</p>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-light font-bold text-lg">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
              className="clay-input w-full text-lg py-4 pl-8"
              placeholder="0"
            />
          </div>
        </div>

        <div className="space-y-4">
          <label className="text-charcoal font-bold text-lg">Photos (optional)</label>
          <p className="text-charcoal-light text-sm">Add up to {maxImages} photos of your item</p>

          {imagePreviews.length > 0 ? (
            <div className="space-y-4">
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
                      <div className="absolute bottom-2 left-2 px-2 py-1 bg-clay-mint rounded-clay-pill text-xs font-bold text-charcoal shadow-clay-sm">
                        Primary
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {selectedImages.length < maxImages && (
                <label className="block clay-card p-6 text-center cursor-pointer hover:shadow-clay-lg transition-shadow">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                  <span className="text-charcoal font-bold">+ Add more photos</span>
                  <span className="text-charcoal-light ml-2">({maxImages - selectedImages.length} remaining)</span>
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
                <svg className="w-8 h-8 text-charcoal-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-charcoal font-bold text-lg mb-1">Click to upload photos</p>
              <p className="text-charcoal-light">PNG, JPG, GIF up to 10MB each (max {maxImages} photos)</p>
            </label>
          )}
        </div>
      </WizardStep>
    )
  }

  // Step 3: Donor Info
  if (currentStep === 3) {
    return (
      <WizardStep
        stepNumber={3}
        totalSteps={TOTAL_STEPS}
        title="Your Information"
        subtitle="So we can thank you and keep you updated"
        onNext={nextStep}
        onBack={prevStep}
        isValid={isStep3Valid}
        showSkip={!eventInfo.settings.requiresContact && !donorEmail}
        onSkip={nextStep}
        icon={
          <svg className="w-10 h-10 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        }
      >
        <WizardInput
          label="Your Name"
          hint="Optional - helps the organizer know who donated"
          placeholder="John Doe"
          value={donorName}
          onChange={(e) => setDonorName(e.target.value)}
        />

        <WizardInput
          label={`Email ${eventInfo.settings.requiresContact ? '*' : ''}`}
          hint="We'll send you updates about your donation"
          placeholder="john@example.com"
          type="email"
          value={donorEmail}
          onChange={(e) => setDonorEmail(e.target.value)}
          required={eventInfo.settings.requiresContact}
        />

        <WizardInput
          label="Phone (optional)"
          hint="In case the organizer needs to contact you"
          placeholder="(555) 123-4567"
          type="tel"
          value={donorPhone}
          onChange={(e) => setDonorPhone(e.target.value)}
        />

        <div className="mt-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={donorAnonymous}
              onChange={(e) => setDonorAnonymous(e.target.checked)}
              className="w-5 h-5 rounded border-2 border-charcoal-light text-clay-sage focus:ring-clay-sage"
            />
            <span className="text-charcoal">
              Keep my donation anonymous (your name won't be shown publicly)
            </span>
          </label>
        </div>
      </WizardStep>
    )
  }

  // Step 4: Review & Submit
  if (currentStep === 4) {
    return (
      <WizardStep
        stepNumber={4}
        totalSteps={TOTAL_STEPS}
        title="Review & Submit"
        subtitle="Make sure everything looks good"
        onNext={handleSubmit}
        onBack={prevStep}
        nextLabel={isSubmitting ? (uploadProgress || 'Submitting...') : 'Submit Donation'}
        isValid={!error}
        isLoading={isSubmitting}
        icon={
          <svg className="w-10 h-10 text-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        }
      >
        {error && (
          <div className="p-4 rounded-clay bg-clay-coral/20 border-2 border-clay-coral/50 mb-6">
            <p className="text-clay-coral font-bold">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <div className="clay-card p-5">
            <h4 className="font-bold text-charcoal-light text-sm uppercase tracking-wider mb-2">Item</h4>
            <p className="font-bold text-charcoal text-xl">{itemName}</p>
            {condition && (
              <p className="text-charcoal-light mt-1">
                Condition: {CONDITIONS.find((c) => c.value === condition)?.label || condition}
              </p>
            )}
            {estimatedValue && (
              <p className="text-charcoal-light mt-1">
                Estimated Value: ${parseFloat(estimatedValue).toFixed(2)}
              </p>
            )}
          </div>

          {selectedImages.length > 0 && (
            <div className="clay-card p-5">
              <h4 className="font-bold text-charcoal-light text-sm uppercase tracking-wider mb-3">Photos</h4>
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
                    <span className="font-bold text-charcoal-light">+{selectedImages.length - 5}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {(donorName || donorEmail) && (
            <div className="clay-card p-5">
              <h4 className="font-bold text-charcoal-light text-sm uppercase tracking-wider mb-2">Donor Information</h4>
              {donorName && <p className="text-charcoal">{donorName}</p>}
              {donorEmail && <p className="text-charcoal-light">{donorEmail}</p>}
              {donorAnonymous && (
                <p className="text-charcoal-light text-sm mt-2 italic">Donating anonymously</p>
              )}
            </div>
          )}

          <p className="text-charcoal-light text-center text-sm">
            Your donation will be reviewed by the organizer before appearing in the auction.
            {donorEmail && ' We\'ll send you an email when it\'s approved.'}
          </p>
        </div>
      </WizardStep>
    )
  }

  return null
}
