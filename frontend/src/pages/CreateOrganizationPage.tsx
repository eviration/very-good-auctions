import { useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { apiClient } from '../services/api'
import type { OrganizationType, CreateOrganizationRequest } from '../types'

const ORG_TYPE_OPTIONS: { value: OrganizationType; label: string; description: string }[] = [
  { value: 'nonprofit', label: 'Nonprofit', description: 'Registered 501(c)(3) or equivalent' },
  { value: 'school', label: 'School', description: 'K-12, college, or university' },
  { value: 'religious', label: 'Religious', description: 'Church, temple, mosque, or other religious org' },
  { value: 'club', label: 'Club', description: 'Social club, sports team, or community group' },
  { value: 'company', label: 'Company', description: 'Business running charity auctions' },
  { value: 'other', label: 'Other', description: 'Other type of organization' },
]

export default function CreateOrganizationPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
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
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      if (!allowedTypes.includes(file.type)) {
        setError('Invalid file type. Please upload a JPG, PNG, GIF, or WebP image.')
        return
      }
      // Validate file size (5MB limit)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const org = await apiClient.createOrganization(formData)

      // Upload logo if one was selected
      if (logoFile) {
        try {
          await apiClient.uploadOrganizationLogo(org.id, logoFile)
        } catch (logoErr) {
          console.error('Failed to upload logo:', logoErr)
          // Continue anyway - org was created successfully
        }
      }

      navigate(`/organizations/${org.slug}/manage`)
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

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-8">
        <Link to="/organizations" className="text-sage hover:underline">
          &larr; Back to Organizations
        </Link>
        <h1 className="text-3xl font-bold text-charcoal mt-4">Create Organization</h1>
        <p className="text-gray-600 mt-1">
          Set up your organization to start running fundraiser auctions
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-6">
          <h2 className="text-lg font-semibold text-charcoal mb-4">Basic Information</h2>

          <div className="space-y-4">
            {/* Logo Upload */}
            <div>
              <label className="block text-sm font-medium text-charcoal mb-2">
                Organization Logo
              </label>
              <div className="flex items-start gap-4">
                <div className="w-24 h-24 rounded-lg border-2 border-dashed border-sage/30 flex items-center justify-center bg-sage/5 overflow-hidden">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <svg className="w-8 h-8 text-sage/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    className="inline-block px-4 py-2 border border-sage/30 rounded-lg text-sm font-medium text-charcoal hover:bg-sage/10 cursor-pointer transition-colors"
                  >
                    {logoPreview ? 'Change Logo' : 'Upload Logo'}
                  </label>
                  {logoPreview && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="ml-2 px-4 py-2 text-sm text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    JPG, PNG, GIF or WebP. Max 5MB.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">
                Organization Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => updateField('name', e.target.value)}
                className="w-full px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
                placeholder="e.g., Springfield Animal Shelter"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">
                Description
              </label>
              <textarea
                rows={4}
                value={formData.description || ''}
                onChange={(e) => updateField('description', e.target.value)}
                className="w-full px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
                placeholder="Tell people about your organization and mission..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-charcoal mb-2">
                Organization Type <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {ORG_TYPE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={`relative flex items-start p-4 border rounded-lg cursor-pointer transition-colors ${
                      formData.orgType === option.value
                        ? 'border-sage bg-sage/5'
                        : 'border-sage/30 hover:border-sage'
                    }`}
                  >
                    <input
                      type="radio"
                      name="orgType"
                      value={option.value}
                      checked={formData.orgType === option.value}
                      onChange={(e) => updateField('orgType', e.target.value as OrganizationType)}
                      className="sr-only"
                    />
                    <div>
                      <span className="font-medium text-charcoal">{option.label}</span>
                      <p className="text-sm text-gray-500">{option.description}</p>
                    </div>
                    {formData.orgType === option.value && (
                      <span className="absolute top-2 right-2 text-sage">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Contact Info */}
        <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-6">
          <h2 className="text-lg font-semibold text-charcoal mb-4">Contact Information</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">
                Contact Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                required
                value={formData.contactEmail}
                onChange={(e) => updateField('contactEmail', e.target.value)}
                className="w-full px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
                placeholder="contact@yourorg.org"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={formData.contactPhone || ''}
                onChange={(e) => updateField('contactPhone', e.target.value)}
                className="w-full px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
                placeholder="(555) 123-4567"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-charcoal mb-1">
                Website
              </label>
              <input
                type="url"
                value={formData.websiteUrl || ''}
                onChange={(e) => updateField('websiteUrl', e.target.value)}
                className="w-full px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
                placeholder="https://yourorg.org"
              />
            </div>
          </div>
        </div>

        {/* Tax Info (optional) */}
        <div className="bg-white rounded-lg shadow-sm border border-sage/20 p-6">
          <h2 className="text-lg font-semibold text-charcoal mb-4">Tax Information (Optional)</h2>
          <p className="text-sm text-gray-500 mb-4">
            Providing your EIN/Tax ID helps verify your nonprofit status
          </p>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">
              EIN / Tax ID
            </label>
            <input
              type="text"
              value={formData.taxId || ''}
              onChange={(e) => updateField('taxId', e.target.value)}
              className="w-full px-4 py-2 border border-sage/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage/50"
              placeholder="XX-XXXXXXX"
            />
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-4 pt-4 pb-8">
          <Link
            to="/organizations"
            className="px-6 py-3 border border-sage/30 rounded-lg hover:bg-sage/10 transition-colors text-charcoal"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="bg-sage text-white px-8 py-3 rounded-lg hover:bg-sage/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {loading ? 'Creating...' : 'Create Organization'}
          </button>
        </div>
      </form>
    </div>
  )
}
