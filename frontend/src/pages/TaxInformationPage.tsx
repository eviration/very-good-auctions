import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { apiClient } from '../services/api'
import W9Form from '../components/W9Form'

interface TaxStatus {
  status: 'not_submitted' | 'pending' | 'verified' | 'expired'
  submittedAt?: string
  tinLastFour?: string
  tinType?: 'ssn' | 'ein'
  requiresUpdate: boolean
}

interface TaxInfo {
  id: string
  taxFormType: string
  legalName: string
  businessName?: string
  taxClassification: string
  tinType: 'ssn' | 'ein'
  tinLastFour: string
  address: {
    line1?: string
    line2?: string
    city?: string
    state?: string
    postalCode?: string
    country: string
  }
  status: string
  signatureDate: string
  verifiedAt?: string
}

interface TaxRequirements {
  w9Required: boolean
  reason?: string
  currentYearEarnings: number
  threshold: number
}

const TAX_CLASSIFICATION_LABELS: Record<string, string> = {
  individual: 'Individual/Sole Proprietor',
  sole_proprietor: 'Individual/Sole Proprietor',
  c_corp: 'C Corporation',
  s_corp: 'S Corporation',
  partnership: 'Partnership',
  trust_estate: 'Trust/Estate',
  llc_c: 'LLC (taxed as C Corp)',
  llc_s: 'LLC (taxed as S Corp)',
  llc_p: 'LLC (taxed as Partnership)',
  nonprofit: 'Nonprofit Organization',
}

export default function TaxInformationPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()

  const [taxStatus, setTaxStatus] = useState<TaxStatus | null>(null)
  const [taxInfo, setTaxInfo] = useState<TaxInfo | null>(null)
  const [requirements, setRequirements] = useState<TaxRequirements | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showW9Form, setShowW9Form] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login')
    }
  }, [isAuthenticated, isLoading, navigate])

  useEffect(() => {
    if (isAuthenticated) {
      loadTaxData()
    }
  }, [isAuthenticated])

  const loadTaxData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [statusRes, infoRes, reqRes] = await Promise.all([
        apiClient.getTaxStatus(),
        apiClient.getTaxInfo(),
        apiClient.getTaxRequirements(),
      ])
      setTaxStatus(statusRes)
      setTaxInfo(infoRes.taxInfo || null)
      setRequirements(reqRes)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleW9Submit = async (data: {
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
  }) => {
    await apiClient.submitW9({
      legalName: data.legalName,
      businessName: data.businessName || undefined,
      taxClassification: data.taxClassification,
      tinType: data.tinType,
      tin: data.tin,
      address: {
        line1: data.address.line1,
        line2: data.address.line2 || undefined,
        city: data.address.city,
        state: data.address.state,
        postalCode: data.address.postalCode,
      },
      certify: data.certify,
      signatureName: data.signatureName,
    })
    setShowW9Form(false)
    setSubmitSuccess(true)
    await loadTaxData()
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'verified':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
            Verified
          </span>
        )
      case 'pending':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
            Pending Review
          </span>
        )
      case 'expired':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
            Expired
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
            Not Submitted
          </span>
        )
    }
  }

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-warm-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sage"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <button
          onClick={() => navigate('/profile')}
          className="text-sage hover:text-sage-dark flex items-center gap-1"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Profile
        </button>
      </div>

      <h1 className="text-3xl font-bold text-charcoal mb-2">Tax Information</h1>
      <p className="text-gray-600 mb-8">
        Manage your tax documentation for IRS reporting requirements.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-6">
          {error}
        </div>
      )}

      {submitSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl p-4 mb-6">
          Your W-9 has been submitted successfully and is pending review.
        </div>
      )}

      {/* Requirements Alert */}
      {requirements?.w9Required && taxStatus?.status !== 'verified' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="font-semibold text-amber-800">W-9 Required</h3>
              <p className="text-sm text-amber-700 mt-1">{requirements.reason}</p>
            </div>
          </div>
        </div>
      )}

      {showW9Form ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-semibold text-charcoal mb-6">Submit W-9 Form</h2>
          <W9Form onSubmit={handleW9Submit} onCancel={() => setShowW9Form(false)} />
        </div>
      ) : (
        <>
          {/* Current Status */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-charcoal">W-9 Status</h2>
              {getStatusBadge(taxStatus?.status || 'not_submitted')}
            </div>

            {taxInfo ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Legal Name</p>
                    <p className="font-medium text-charcoal">{taxInfo.legalName}</p>
                  </div>
                  {taxInfo.businessName && (
                    <div>
                      <p className="text-sm text-gray-500">Business Name</p>
                      <p className="font-medium text-charcoal">{taxInfo.businessName}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-gray-500">Tax Classification</p>
                    <p className="font-medium text-charcoal">
                      {TAX_CLASSIFICATION_LABELS[taxInfo.taxClassification] || taxInfo.taxClassification}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Tax ID ({taxInfo.tinType.toUpperCase()})</p>
                    <p className="font-medium text-charcoal font-mono">
                      {taxInfo.tinType === 'ssn' ? `***-**-${taxInfo.tinLastFour}` : `**-***${taxInfo.tinLastFour}`}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-sm text-gray-500">Address</p>
                    <p className="font-medium text-charcoal">
                      {taxInfo.address.line1}
                      {taxInfo.address.line2 && <>, {taxInfo.address.line2}</>}
                      <br />
                      {taxInfo.address.city}, {taxInfo.address.state} {taxInfo.address.postalCode}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Submitted</p>
                    <p className="font-medium text-charcoal">
                      {new Date(taxInfo.signatureDate).toLocaleDateString()}
                    </p>
                  </div>
                  {taxInfo.verifiedAt && (
                    <div>
                      <p className="text-sm text-gray-500">Verified</p>
                      <p className="font-medium text-charcoal">
                        {new Date(taxInfo.verifiedAt).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>

                {(taxStatus?.status === 'expired' || taxStatus?.requiresUpdate) && (
                  <button
                    onClick={() => setShowW9Form(true)}
                    className="w-full mt-4 py-3 bg-sage text-white font-semibold rounded-xl hover:bg-sage-dark transition-colors"
                  >
                    Update W-9
                  </button>
                )}
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-gray-600 mb-4">
                  No tax information on file. Submit a W-9 form to enable payouts.
                </p>
                <button
                  onClick={() => setShowW9Form(true)}
                  className="px-6 py-3 bg-sage text-white font-semibold rounded-xl hover:bg-sage-dark transition-colors"
                >
                  Submit W-9 Form
                </button>
              </div>
            )}
          </div>

          {/* Earnings Summary */}
          {requirements && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-xl font-semibold text-charcoal mb-4">Earnings Summary</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Current Year Earnings</p>
                  <p className="text-2xl font-bold text-charcoal">
                    ${requirements.currentYearEarnings.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">1099-K Threshold</p>
                  <p className="text-2xl font-bold text-charcoal">${requirements.threshold}</p>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-4">
                The IRS requires a W-9 and issues a 1099-K for sellers who earn ${requirements.threshold} or more in a calendar year.
              </p>
            </div>
          )}

          {/* Info Section */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h3 className="font-semibold text-blue-800 mb-2">About Tax Reporting</h3>
            <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
              <li>We're required to collect W-9 information from sellers earning $600+ annually</li>
              <li>Your Social Security Number or EIN is encrypted and stored securely</li>
              <li>We'll issue 1099-K forms by January 31st each year if applicable</li>
              <li>Contact support if you have questions about tax reporting</li>
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
