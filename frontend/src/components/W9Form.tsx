import { useState } from 'react'

interface W9FormData {
  legalName: string
  businessName: string
  taxClassification: string
  tinType: 'ssn' | 'ein'
  tin: string
  address: {
    line1: string
    line2: string
    city: string
    state: string
    postalCode: string
  }
  certify: boolean
  signatureName: string
}

const TAX_CLASSIFICATIONS = [
  { value: 'individual', label: 'Individual/Sole Proprietor' },
  { value: 'c_corp', label: 'C Corporation' },
  { value: 's_corp', label: 'S Corporation' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'trust_estate', label: 'Trust/Estate' },
  { value: 'llc_c', label: 'LLC (taxed as C Corp)' },
  { value: 'llc_s', label: 'LLC (taxed as S Corp)' },
  { value: 'llc_p', label: 'LLC (taxed as Partnership)' },
  { value: 'nonprofit', label: 'Nonprofit Organization' },
]

const US_STATES = [
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'DE', label: 'Delaware' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' },
  { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' },
  { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' },
  { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' },
  { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' },
  { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' },
  { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
  { value: 'DC', label: 'District of Columbia' },
]

interface W9FormProps {
  onSubmit: (data: W9FormData) => Promise<void>
  onCancel: () => void
}

export default function W9Form({ onSubmit, onCancel }: W9FormProps) {
  const [formData, setFormData] = useState<W9FormData>({
    legalName: '',
    businessName: '',
    taxClassification: 'individual',
    tinType: 'ssn',
    tin: '',
    address: { line1: '', line2: '', city: '', state: '', postalCode: '' },
    certify: false,
    signatureName: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const formatTIN = (value: string, type: 'ssn' | 'ein') => {
    const digits = value.replace(/\D/g, '')
    if (type === 'ssn') {
      if (digits.length <= 3) return digits
      if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`
      return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 9)}`
    } else {
      if (digits.length <= 2) return digits
      return `${digits.slice(0, 2)}-${digits.slice(2, 9)}`
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate
    const newErrors: Record<string, string> = {}
    if (!formData.legalName.trim()) newErrors.legalName = 'Legal name is required'
    if (!formData.tin) newErrors.tin = 'Tax ID is required'
    if (formData.tin.replace(/\D/g, '').length !== 9) {
      newErrors.tin = 'Tax ID must be 9 digits'
    }
    if (!formData.address.line1.trim()) newErrors.address = 'Street address is required'
    if (!formData.address.city.trim()) newErrors.city = 'City is required'
    if (!formData.address.state) newErrors.state = 'State is required'
    if (!formData.address.postalCode.trim()) newErrors.postalCode = 'ZIP code is required'
    if (!/^\d{5}(-\d{4})?$/.test(formData.address.postalCode)) {
      newErrors.postalCode = 'Invalid ZIP code format'
    }
    if (!formData.certify) newErrors.certify = 'You must certify the information'
    if (!formData.signatureName.trim()) newErrors.signature = 'Signature is required'

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setSubmitting(true)
    try {
      await onSubmit(formData)
    } catch (error) {
      setErrors({ submit: (error as Error).message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <h3 className="font-semibold text-amber-800">IRS Form W-9 Substitute</h3>
        <p className="text-sm text-amber-700 mt-1">
          This information is required by the IRS for tax reporting purposes.
          Your tax ID is encrypted and stored securely.
        </p>
      </div>

      {/* Legal Name */}
      <div>
        <label className="block text-sm font-medium text-charcoal mb-2">
          Legal Name (as shown on your tax return) *
        </label>
        <input
          type="text"
          value={formData.legalName}
          onChange={(e) => setFormData({ ...formData, legalName: e.target.value })}
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
          placeholder="Enter your full legal name"
        />
        {errors.legalName && <p className="text-red-600 text-sm mt-1">{errors.legalName}</p>}
      </div>

      {/* Business Name */}
      <div>
        <label className="block text-sm font-medium text-charcoal mb-2">
          Business Name (if different from above)
        </label>
        <input
          type="text"
          value={formData.businessName}
          onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
          placeholder="DBA or trade name (optional)"
        />
      </div>

      {/* Tax Classification */}
      <div>
        <label className="block text-sm font-medium text-charcoal mb-2">
          Federal Tax Classification *
        </label>
        <select
          value={formData.taxClassification}
          onChange={(e) => setFormData({ ...formData, taxClassification: e.target.value })}
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
        >
          {TAX_CLASSIFICATIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* TIN Type and Number */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-charcoal mb-2">Tax ID Type *</label>
          <select
            value={formData.tinType}
            onChange={(e) => setFormData({
              ...formData,
              tinType: e.target.value as 'ssn' | 'ein',
              tin: ''
            })}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
          >
            <option value="ssn">Social Security Number (SSN)</option>
            <option value="ein">Employer Identification Number (EIN)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-charcoal mb-2">
            {formData.tinType === 'ssn' ? 'SSN' : 'EIN'} *
          </label>
          <input
            type="text"
            value={formData.tin}
            onChange={(e) => setFormData({
              ...formData,
              tin: formatTIN(e.target.value, formData.tinType)
            })}
            placeholder={formData.tinType === 'ssn' ? '___-__-____' : '__-_______'}
            maxLength={formData.tinType === 'ssn' ? 11 : 10}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0 font-mono"
          />
          {errors.tin && <p className="text-red-600 text-sm mt-1">{errors.tin}</p>}
        </div>
      </div>

      {/* Address */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-charcoal">Address *</label>
        <input
          type="text"
          placeholder="Street address"
          value={formData.address.line1}
          onChange={(e) => setFormData({
            ...formData,
            address: { ...formData.address, line1: e.target.value }
          })}
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
        />
        {errors.address && <p className="text-red-600 text-sm mt-1">{errors.address}</p>}
        <input
          type="text"
          placeholder="Apt, suite, etc. (optional)"
          value={formData.address.line2}
          onChange={(e) => setFormData({
            ...formData,
            address: { ...formData.address, line2: e.target.value }
          })}
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <input
              type="text"
              placeholder="City"
              value={formData.address.city}
              onChange={(e) => setFormData({
                ...formData,
                address: { ...formData.address, city: e.target.value }
              })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
            />
            {errors.city && <p className="text-red-600 text-sm mt-1">{errors.city}</p>}
          </div>
          <div>
            <select
              value={formData.address.state}
              onChange={(e) => setFormData({
                ...formData,
                address: { ...formData.address, state: e.target.value }
              })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
            >
              <option value="">Select State</option>
              {US_STATES.map((state) => (
                <option key={state.value} value={state.value}>{state.label}</option>
              ))}
            </select>
            {errors.state && <p className="text-red-600 text-sm mt-1">{errors.state}</p>}
          </div>
          <div>
            <input
              type="text"
              placeholder="ZIP Code"
              value={formData.address.postalCode}
              onChange={(e) => setFormData({
                ...formData,
                address: { ...formData.address, postalCode: e.target.value }
              })}
              maxLength={10}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0"
            />
            {errors.postalCode && <p className="text-red-600 text-sm mt-1">{errors.postalCode}</p>}
          </div>
        </div>
      </div>

      {/* Certification */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <h4 className="font-medium text-charcoal mb-2">Certification</h4>
        <p className="text-sm text-gray-600 mb-3">
          Under penalties of perjury, I certify that:
        </p>
        <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1 mb-4">
          <li>The number shown on this form is my correct taxpayer identification number</li>
          <li>I am not subject to backup withholding because: (a) I am exempt from backup withholding, or (b) I have not been notified by the IRS that I am subject to backup withholding</li>
          <li>I am a U.S. citizen or other U.S. person</li>
          <li>The FATCA code(s) entered (if any) are correct</li>
        </ol>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.certify}
            onChange={(e) => setFormData({ ...formData, certify: e.target.checked })}
            className="mt-1 h-5 w-5 text-sage border-gray-300 rounded focus:ring-sage"
          />
          <span className="text-sm text-charcoal">
            I certify under penalties of perjury that the above statements are true and correct *
          </span>
        </label>
        {errors.certify && <p className="text-red-600 text-sm mt-2">{errors.certify}</p>}
      </div>

      {/* Signature */}
      <div>
        <label className="block text-sm font-medium text-charcoal mb-2">
          Electronic Signature (type your full legal name) *
        </label>
        <input
          type="text"
          value={formData.signatureName}
          onChange={(e) => setFormData({ ...formData, signatureName: e.target.value })}
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-sage focus:ring-0 italic"
          placeholder="Type your full legal name"
        />
        {errors.signature && <p className="text-red-600 text-sm mt-1">{errors.signature}</p>}
        <p className="text-xs text-gray-500 mt-1">
          By typing your name, you are electronically signing this form.
          Date: {new Date().toLocaleDateString()}
        </p>
      </div>

      {errors.submit && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">
          {errors.submit}
        </div>
      )}

      <div className="flex gap-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-4 border-2 border-gray-200 text-charcoal font-semibold rounded-xl hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 py-4 bg-sage text-white font-semibold rounded-xl hover:bg-sage-dark transition-colors disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : 'Submit W-9'}
        </button>
      </div>
    </form>
  )
}
