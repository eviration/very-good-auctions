import { Router, Request, Response, NextFunction } from 'express'
import {
  getCurrentAgreement,
  getAgreementVersion,
  acceptAgreement,
  getUserAcceptances,
  hasAcceptedCurrentAgreement,
  getPendingAgreements,
  AgreementType,
} from '../services/agreements.js'
import {
  submitW9,
  getUserTaxInfo,
  getTaxStatus,
  requiresW9ForPayout,
  TaxClassification,
  TINType,
} from '../services/taxForms.js'
const router = Router()

// =============================================================================
// Agreement Routes
// =============================================================================

/**
 * GET /api/agreements/current/:type
 * Get the current version of an agreement type
 */
router.get(
  '/agreements/current/:type',
  async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const agreementType = req.params.type as AgreementType

      // Validate agreement type
      const validTypes = [
        'terms_of_service',
        'privacy_policy',
        'seller_agreement',
        'organization_agreement',
        'bidder_agreement',
      ]
      if (!validTypes.includes(agreementType)) {
        res.status(400).json({ error: 'Invalid agreement type' })
        return
      }

      const agreement = await getCurrentAgreement(agreementType)

      if (!agreement) {
        res.status(404).json({ error: 'Agreement not found' })
        return
      }

      res.json({
        id: agreement.id,
        type: agreement.agreementType,
        version: agreement.version,
        title: agreement.title,
        content: agreement.content,
        contentHash: agreement.contentHash,
        effectiveDate: agreement.effectiveDate,
      })
    } catch (error) {
      console.error('Error getting current agreement:', error)
      res.status(500).json({ error: 'Failed to get agreement' })
    }
  }
)

/**
 * GET /api/agreements/:type/:version
 * Get a specific version of an agreement
 */
router.get(
  '/agreements/:type/:version',
  async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const agreementType = req.params.type as AgreementType
      const version = req.params.version

      const agreement = await getAgreementVersion(agreementType, version)

      if (!agreement) {
        res.status(404).json({ error: 'Agreement version not found' })
        return
      }

      res.json({
        id: agreement.id,
        type: agreement.agreementType,
        version: agreement.version,
        title: agreement.title,
        content: agreement.content,
        contentHash: agreement.contentHash,
        effectiveDate: agreement.effectiveDate,
        isCurrent: agreement.isCurrent,
      })
    } catch (error) {
      console.error('Error getting agreement version:', error)
      res.status(500).json({ error: 'Failed to get agreement' })
    }
  }
)

/**
 * POST /api/agreements/accept
 * Accept an agreement
 */
router.post('/agreements/accept', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const userId = req.user?.id

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const { agreementType, agreementVersion, agreementHash, organizationId } = req.body

    if (!agreementType || !agreementVersion || !agreementHash) {
      res.status(400).json({ error: 'Missing required fields' })
      return
    }

    // Verify the agreement exists and hash matches
    const agreement = await getAgreementVersion(agreementType, agreementVersion)
    if (!agreement) {
      res.status(404).json({ error: 'Agreement not found' })
      return
    }

    if (agreement.contentHash !== agreementHash) {
      res.status(400).json({ error: 'Agreement hash mismatch' })
      return
    }

    const acceptance = await acceptAgreement({
      userId,
      agreementType,
      agreementVersion,
      agreementHash,
      organizationId,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    })

    res.json({
      success: true,
      acceptanceId: acceptance.id,
      acceptedAt: acceptance.acceptedAt,
    })
  } catch (error) {
    console.error('Error accepting agreement:', error)
    res.status(500).json({ error: 'Failed to accept agreement' })
  }
})

/**
 * GET /api/my/agreements
 * Get user's accepted agreements
 */
router.get('/my/agreements', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const userId = req.user?.id

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const acceptances = await getUserAcceptances(userId)

    res.json({
      acceptances: acceptances.map((a) => ({
        id: a.id,
        type: a.agreementType,
        version: a.agreementVersion,
        acceptedAt: a.acceptedAt,
        organizationId: a.organizationId,
      })),
    })
  } catch (error) {
    console.error('Error getting user agreements:', error)
    res.status(500).json({ error: 'Failed to get agreements' })
  }
})

/**
 * GET /api/my/agreements/pending
 * Get agreements user needs to accept
 */
router.get('/my/agreements/pending', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const userId = req.user?.id

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    // Get required agreement types based on user type
    // For now, require ToS and Privacy for all users
    const requiredTypes: AgreementType[] = ['terms_of_service', 'privacy_policy']

    const pending = await getPendingAgreements(userId, requiredTypes)

    res.json({
      pending: pending.map((a) => ({
        id: a.id,
        type: a.agreementType,
        version: a.version,
        title: a.title,
        content: a.content,
        contentHash: a.contentHash,
      })),
    })
  } catch (error) {
    console.error('Error getting pending agreements:', error)
    res.status(500).json({ error: 'Failed to get pending agreements' })
  }
})

/**
 * GET /api/my/agreements/check/:type
 * Check if user has accepted current version of agreement
 */
router.get(
  '/my/agreements/check/:type',
  async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const userId = req.user?.id

      if (!userId) {
        res.status(401).json({ error: 'Authentication required' })
        return
      }

      const agreementType = req.params.type as AgreementType
      const hasAccepted = await hasAcceptedCurrentAgreement(userId, agreementType)

      res.json({ hasAccepted })
    } catch (error) {
      console.error('Error checking agreement:', error)
      res.status(500).json({ error: 'Failed to check agreement' })
    }
  }
)

// =============================================================================
// Tax Information Routes
// =============================================================================

/**
 * POST /api/tax/w9
 * Submit W-9 form
 */
router.post('/tax/w9', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const userId = req.user?.id

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const {
      legalName,
      businessName,
      taxClassification,
      tinType,
      tin,
      address,
      isUsPerson,
      isExemptPayee,
      exemptPayeeCode,
      signatureName,
      organizationId,
    } = req.body

    // Validate required fields
    if (!legalName || !taxClassification || !tinType || !tin || !address || !signatureName) {
      res.status(400).json({ error: 'Missing required fields' })
      return
    }

    // Validate address fields
    if (!address.line1 || !address.city || !address.state || !address.postalCode) {
      res.status(400).json({ error: 'Missing required address fields' })
      return
    }

    const result = await submitW9({
      userId: organizationId ? undefined : userId,
      organizationId,
      legalName,
      businessName,
      taxClassification: taxClassification as TaxClassification,
      tinType: tinType as TINType,
      tin,
      address: {
        line1: address.line1,
        line2: address.line2,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        country: address.country || 'USA',
      },
      isUsPerson: isUsPerson ?? true,
      isExemptPayee,
      exemptPayeeCode,
      signatureName,
      signatureIp: req.ip,
    })

    res.json({
      success: true,
      taxInfoId: result.taxInfoId,
      lastFour: result.lastFour,
      message: 'W-9 submitted successfully. Pending verification.',
    })
  } catch (error) {
    console.error('Error submitting W-9:', error)
    res.status(400).json({ error: (error as Error).message || 'Failed to submit W-9' })
  }
})

/**
 * GET /api/tax/status
 * Get user's tax status
 */
router.get('/tax/status', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const userId = req.user?.id

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const status = await getTaxStatus(userId)

    res.json({
      status: status.status,
      submittedAt: status.submittedAt,
      tinLastFour: status.tinLastFour,
      tinType: status.tinType,
      requiresUpdate: status.requiresUpdate,
    })
  } catch (error) {
    console.error('Error getting tax status:', error)
    res.status(500).json({ error: 'Failed to get tax status' })
  }
})

/**
 * GET /api/tax/info
 * Get user's tax information (without encrypted TIN)
 */
router.get('/tax/info', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const userId = req.user?.id

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const taxInfo = await getUserTaxInfo(userId)

    if (!taxInfo) {
      res.json({ submitted: false })
      return
    }

    res.json({
      submitted: true,
      taxInfo: {
        id: taxInfo.id,
        taxFormType: taxInfo.taxFormType,
        legalName: taxInfo.legalName,
        businessName: taxInfo.businessName,
        taxClassification: taxInfo.taxClassification,
        tinType: taxInfo.tinType,
        tinLastFour: taxInfo.tinLastFour,
        address: taxInfo.address,
        status: taxInfo.status,
        signatureDate: taxInfo.signatureDate,
        verifiedAt: taxInfo.verifiedAt,
      },
    })
  } catch (error) {
    console.error('Error getting tax info:', error)
    res.status(500).json({ error: 'Failed to get tax information' })
  }
})

/**
 * GET /api/tax/requirements
 * Check if W-9 is required for payout
 */
router.get('/tax/requirements', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const userId = req.user?.id

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const requirements = await requiresW9ForPayout(userId)

    res.json({
      w9Required: requirements.required,
      reason: requirements.reason,
      currentYearEarnings: requirements.currentEarnings,
      threshold: 600,
    })
  } catch (error) {
    console.error('Error checking tax requirements:', error)
    res.status(500).json({ error: 'Failed to check tax requirements' })
  }
})

export { router as complianceRoutes }
