import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../services/api'
import type { Category, AuctionCondition, Organization } from '../types'

export default function CreateAuctionPage() {
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedImages, setSelectedImages] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])

  // Organization state
  const [myOrganizations, setMyOrganizations] = useState<Organization[]>([])
  const [organizationId, setOrganizationId] = useState<string>('')
  const [showCreateOrg, setShowCreateOrg] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [newOrgEmail, setNewOrgEmail] = useState('')
  const [creatingOrg, setCreatingOrg] = useState(false)

  // Form fields
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startingPrice, setStartingPrice] = useState('')
  const [duration, setDuration] = useState('7')
  const [categoryId, setCategoryId] = useState('')
  const [condition, setCondition] = useState<AuctionCondition>('good')
  const [shippingInfo, setShippingInfo] = useState('')

  // Fetch user's organizations
  useEffect(() => {
    apiClient.getMyOrganizations()
      .then(orgs => setMyOrganizations(orgs))
      .catch(() => setMyOrganizations([]))
  }, [])

  useEffect(() => {
    // Try to fetch categories from API, fall back to defaults
    apiClient.getCategories()
      .then(cats => {
        if (cats && cats.length > 0) {
          setCategories(cats)
        } else {
          // Use default categories if none exist in database
          setCategories([
            { id: 1, name: 'Electronics', slug: 'electronics' },
            { id: 2, name: 'Collectibles & Art', slug: 'collectibles-art' },
            { id: 3, name: 'Home & Garden', slug: 'home-garden' },
            { id: 4, name: 'Fashion & Accessories', slug: 'fashion-accessories' },
            { id: 5, name: 'Sports & Outdoors', slug: 'sports-outdoors' },
            { id: 6, name: 'Toys & Games', slug: 'toys-games' },
            { id: 7, name: 'Books & Media', slug: 'books-media' },
            { id: 8, name: 'Automotive', slug: 'automotive' },
            { id: 9, name: 'Jewelry & Watches', slug: 'jewelry-watches' },
            { id: 10, name: 'Antiques', slug: 'antiques' },
          ])
        }
      })
      .catch(() => {
        // Use default categories on error
        setCategories([
          { id: 1, name: 'Electronics', slug: 'electronics' },
          { id: 2, name: 'Collectibles & Art', slug: 'collectibles-art' },
          { id: 3, name: 'Home & Garden', slug: 'home-garden' },
          { id: 4, name: 'Fashion & Accessories', slug: 'fashion-accessories' },
          { id: 5, name: 'Sports & Outdoors', slug: 'sports-outdoors' },
          { id: 6, name: 'Toys & Games', slug: 'toys-games' },
          { id: 7, name: 'Books & Media', slug: 'books-media' },
          { id: 8, name: 'Automotive', slug: 'automotive' },
          { id: 9, name: 'Jewelry & Watches', slug: 'jewelry-watches' },
          { id: 10, name: 'Antiques', slug: 'antiques' },
        ])
      })
  }, [])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setSelectedImages(files)

    // Create preview URLs
    const previews = files.map(file => URL.createObjectURL(file))
    setImagePreviews(previews)
  }

  const removeImage = (index: number) => {
    const newImages = selectedImages.filter((_, i) => i !== index)
    const newPreviews = imagePreviews.filter((_, i) => i !== index)

    // Revoke the removed preview URL to free memory
    URL.revokeObjectURL(imagePreviews[index])

    setSelectedImages(newImages)
    setImagePreviews(newPreviews)
  }

  const handleCreateOrganization = async () => {
    if (!newOrgName.trim() || !newOrgEmail.trim()) {
      setError('Organization name and email are required')
      return
    }

    setCreatingOrg(true)
    setError(null)

    try {
      const org = await apiClient.createOrganization({
        name: newOrgName,
        contactEmail: newOrgEmail,
        orgType: 'nonprofit',
      })
      setMyOrganizations([...myOrganizations, org])
      setOrganizationId(org.id.toString())
      setShowCreateOrg(false)
      setNewOrgName('')
      setNewOrgEmail('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization')
    } finally {
      setCreatingOrg(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    if (!categoryId) {
      setError('Please select a category')
      setIsSubmitting(false)
      return
    }

    try {
      // Create the auction with fields the backend expects
      const auctionPayload = {
        title,
        description,
        categoryId: parseInt(categoryId),
        startingPrice: parseFloat(startingPrice),
        condition,
        durationDays: parseInt(duration),
        shippingInfo: shippingInfo || undefined,
        organizationId: organizationId ? parseInt(organizationId) : undefined,
      }

      console.log('Creating auction with payload:', auctionPayload)
      const auction = await apiClient.createAuction(auctionPayload as any)
      console.log('Auction created successfully:', auction)

      // Upload images if any (don't fail the whole operation if images fail)
      let imageUploadError: string | null = null
      if (selectedImages.length > 0) {
        try {
          console.log(`Uploading ${selectedImages.length} images to auction ${auction.id}`)
          const results = await Promise.all(
            selectedImages.map(async (file, index) => {
              console.log(`Uploading image ${index + 1}: ${file.name} (${file.size} bytes)`)
              try {
                const result = await apiClient.uploadAuctionImage(auction.id, file)
                console.log(`Image ${index + 1} uploaded successfully:`, result)
                return result
              } catch (err) {
                console.error(`Image ${index + 1} failed:`, err)
                throw err
              }
            })
          )
          console.log('All images uploaded successfully:', results)
        } catch (imgError) {
          console.error('Image upload failed (auction still created):', imgError)
          imageUploadError = imgError instanceof Error ? imgError.message : 'Image upload failed'
        }
      }

      // Navigate to the created auction (with warning if images failed)
      if (imageUploadError) {
        alert(`Auction created but image upload failed: ${imageUploadError}\n\nYou can try uploading images again from the auction page.`)
      }
      navigate(`/auctions/${auction.id}`)
    } catch (err) {
      console.error('Failed to create auction:', err)
      console.error('Error details:', JSON.stringify(err, null, 2))
      let errorMessage = 'Failed to create auction'
      if (err instanceof Error) {
        errorMessage = err.message
      } else if (typeof err === 'object' && err !== null) {
        errorMessage = JSON.stringify(err)
      }
      setError(errorMessage)
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl font-bold text-charcoal mb-8">
        Create New Auction
      </h1>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Organization Selection (Optional) */}
        <div className="bg-sage/5 border border-sage/20 rounded-xl p-4">
          <label className="block text-sm font-medium text-charcoal mb-2">
            Fundraiser Organization (Optional)
          </label>
          <p className="text-sm text-gray-500 mb-3">
            Link this auction to an organization to run it as a fundraiser
          </p>

          {!showCreateOrg ? (
            <div className="space-y-3">
              <select
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0 bg-white"
              >
                <option value="">Personal auction (no organization)</option>
                {myOrganizations.map((org) => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowCreateOrg(true)}
                className="text-sage text-sm font-medium hover:text-sage-dark"
              >
                + Create a new organization
              </button>
            </div>
          ) : (
            <div className="space-y-3 bg-white p-4 rounded-lg border border-gray-200">
              <h4 className="font-medium text-charcoal">Create New Organization</h4>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Organization Name</label>
                <input
                  type="text"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-sage focus:ring-0"
                  placeholder="e.g., Springfield Animal Shelter"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Contact Email</label>
                <input
                  type="email"
                  value={newOrgEmail}
                  onChange={(e) => setNewOrgEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-sage focus:ring-0"
                  placeholder="contact@organization.org"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCreateOrganization}
                  disabled={creatingOrg}
                  className="px-4 py-2 bg-sage text-white rounded-lg hover:bg-sage-dark disabled:opacity-50"
                >
                  {creatingOrg ? 'Creating...' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateOrg(false)
                    setNewOrgName('')
                    setNewOrgEmail('')
                  }}
                  className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-charcoal mb-2">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
            placeholder="What are you selling?"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-charcoal mb-2">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            required
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
            placeholder="Describe your item in detail..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">
              Category <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
            >
              <option value="">Select a category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">
              Condition <span className="text-red-500">*</span>
            </label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as AuctionCondition)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
            >
              <option value="new">New</option>
              <option value="like-new">Like New</option>
              <option value="excellent">Excellent</option>
              <option value="very-good">Very Good</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="poor">Poor</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">
              Starting Price <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                required
                min="1"
                step="0.01"
                value={startingPrice}
                onChange={(e) => setStartingPrice(e.target.value)}
                className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
                placeholder="0"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">
              Duration <span className="text-red-500">*</span>
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
            >
              <option value="3">3 days</option>
              <option value="5">5 days</option>
              <option value="7">7 days</option>
              <option value="10">10 days</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-charcoal mb-2">Shipping Information (optional)</label>
          <textarea
            rows={2}
            value={shippingInfo}
            onChange={(e) => setShippingInfo(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
            placeholder="Shipping details, costs, restrictions..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-charcoal mb-2">Images</label>

          {imagePreviews.length > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {imagePreviews.map((preview, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={preview}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-48 object-cover rounded-xl border-2 border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full
                                 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                  id="images"
                />
                <label htmlFor="images" className="cursor-pointer text-sage font-medium hover:text-sage-dark">
                  + Add more images
                </label>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
                id="images"
              />
              <label htmlFor="images" className="cursor-pointer">
                <svg className="w-12 h-12 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-gray-600">Click to upload images</p>
                <p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF up to 10MB</p>
              </label>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-4 bg-sage text-white font-semibold rounded-xl hover:bg-sage-dark 
                     disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? 'Creating...' : 'Create Auction'}
        </button>
      </form>
    </div>
  )
}
