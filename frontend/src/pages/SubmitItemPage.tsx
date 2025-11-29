import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import { apiClient } from '../services/api'
import type { AuctionEvent, SubmitItemRequest } from '../types'
import { loginRequest } from '../auth/authConfig'

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
          // Don't fail the whole submission
        }
      }

      navigate(`/events/${slug}/submit/success`, {
        state: { itemTitle: title },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit item')
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage"></div>
        </div>
      </div>
    )
  }

  if (error && !event) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          Event not found
        </div>
      </div>
    )
  }

  // Check submission deadline
  const deadlinePassed = event.submissionDeadline && new Date(event.submissionDeadline) < new Date()
  const eventEnded = new Date(event.endTime) < new Date()

  if (deadlinePassed || eventEnded) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <svg
          className="w-16 h-16 text-gray-400 mx-auto mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h1 className="text-2xl font-bold text-charcoal mb-2">Submissions Closed</h1>
        <p className="text-gray-600 mb-6">
          {eventEnded
            ? 'This auction has ended.'
            : 'The submission deadline for this event has passed.'}
        </p>
        <a
          href={`/events/${slug}`}
          className="inline-block px-6 py-3 bg-sage text-white font-semibold rounded-xl hover:bg-sage/90"
        >
          View Auction
        </a>
      </div>
    )
  }

  // Access code required
  if (event.accessCode && !accessVerified) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="bg-white rounded-xl border border-sage/20 p-8 text-center">
          <svg
            className="w-16 h-16 text-sage mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <h1 className="text-2xl font-bold text-charcoal mb-2">Submit an Item</h1>
          <p className="text-gray-600 mb-6">
            Enter the access code to submit an item to <strong>{event.name}</strong>
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <input
              type="text"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
              placeholder="Enter access code"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0 text-center font-mono text-lg uppercase"
            />
            <button
              onClick={handleVerifyAccess}
              disabled={!accessCode || verifyingAccess}
              className="w-full py-3 bg-sage text-white font-semibold rounded-xl hover:bg-sage/90 disabled:opacity-50"
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
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="bg-white rounded-xl border border-sage/20 p-8 text-center">
          <svg
            className="w-16 h-16 text-sage mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
          <h1 className="text-2xl font-bold text-charcoal mb-2">Sign In Required</h1>
          <p className="text-gray-600 mb-6">
            Please sign in to submit an item to <strong>{event.name}</strong>
          </p>
          <button
            onClick={handleLogin}
            className="w-full py-3 bg-sage text-white font-semibold rounded-xl hover:bg-sage/90"
          >
            Sign In to Continue
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-8">
        <a href={`/events/${slug}`} className="text-sage hover:underline">
          &larr; Back to {event.name}
        </a>
        <h1 className="font-display text-3xl font-bold text-charcoal mt-2">
          Submit an Item
        </h1>
        <p className="text-gray-600 mt-1">
          Donate an item to <strong>{event.name}</strong>
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl border border-sage/20 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-charcoal">Item Details</h2>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">
              Item Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
              placeholder="e.g., Vintage Record Collection"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">
              Description
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
              placeholder="Describe your item in detail..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">
              Condition
            </label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
            >
              <option value="">Select condition</option>
              <option value="new">New</option>
              <option value="like-new">Like New</option>
              <option value="excellent">Excellent</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
            </select>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-sage/20 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-charcoal">Pricing (Optional)</h2>
          <p className="text-sm text-gray-500">
            Suggest a starting price or leave blank for the organizer to decide
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-2">
                Suggested Starting Price
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={startingPrice}
                  onChange={(e) => setStartingPrice(e.target.value)}
                  className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
                  placeholder="0"
                />
              </div>
            </div>
            {event.buyNowEnabled && (
              <div>
                <label className="block text-sm font-medium text-charcoal mb-2">
                  Buy Now Price
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={buyNowPrice}
                    onChange={(e) => setBuyNowPrice(e.target.value)}
                    className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
                    placeholder="0"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-sage/20 p-6">
          <h2 className="text-lg font-semibold text-charcoal mb-4">Photos</h2>
          <p className="text-sm text-gray-500 mb-4">
            Add up to 20 photos of your item. Good photos help items sell for more!
          </p>

          {imagePreviews.length > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                {imagePreviews.map((preview, index) => (
                  <div key={index} className="relative group aspect-square">
                    <img
                      src={preview}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-full object-cover rounded-xl border-2 border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full
                                 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    {index === 0 && (
                      <div className="absolute bottom-2 left-2 bg-sage text-white text-xs px-2 py-1 rounded">
                        Primary
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {selectedImages.length < 20 && (
                <label className="block border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-sage/50">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                  <span className="text-sage font-medium">+ Add more photos</span>
                  <span className="text-gray-500 text-sm ml-2">
                    ({20 - selectedImages.length} remaining)
                  </span>
                </label>
              )}
            </div>
          ) : (
            <label className="block border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-sage/50">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
              />
              <svg
                className="w-12 h-12 text-gray-400 mx-auto mb-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <p className="text-gray-600">Click to upload photos</p>
              <p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF up to 10MB each</p>
            </label>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-4 bg-sage text-white font-semibold rounded-xl hover:bg-sage/90 disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Item'}
        </button>

        <p className="text-sm text-gray-500 text-center">
          Your submission will be reviewed by the event organizer before appearing in the auction.
        </p>
      </form>
    </div>
  )
}
