import { query as dbQuery } from '../config/database.js'
import { v4 as uuidv4 } from 'uuid'
import {
  encryptTIN,
  decryptTIN,
  getTINLastFour,
  validateSSN,
  validateEIN,
  formatMaskedSSN,
  formatMaskedEIN,
} from './encryption.js'
import { logComplianceEvent, logTINAccess } from './complianceAudit.js'

/**
 * Tax classification options
 */
export type TaxClassification =
  | 'individual'
  | 'sole_proprietor'
  | 'c_corp'
  | 's_corp'
  | 'partnership'
  | 'trust_estate'
  | 'llc_c'
  | 'llc_s'
  | 'llc_p'
  | 'nonprofit'
  | 'other'

/**
 * Tax form types
 */
export type TaxFormType = 'w9' | 'w8ben' | 'w8bene'

/**
 * TIN types
 */
export type TINType = 'ssn' | 'ein'

/**
 * Tax information status
 */
export type TaxInfoStatus = 'pending' | 'verified' | 'invalid' | 'expired'

/**
 * Tax information record (without encrypted TIN)
 */
export interface TaxInformation {
  id: string
  userId?: string
  organizationId?: string
  taxFormType: TaxFormType
  legalName: string
  businessName?: string
  taxClassification?: TaxClassification
  tinType?: TINType
  tinLastFour?: string
  address: {
    line1?: string
    line2?: string
    city?: string
    state?: string
    postalCode?: string
    country: string
  }
  isUsPerson?: boolean
  isExemptPayee: boolean
  exemptPayeeCode?: string
  signatureName: string
  signatureDate: Date
  status: TaxInfoStatus
  verifiedAt?: Date
  verifiedBy?: string
  createdAt: Date
  expiresAt?: Date
}

/**
 * W-9 submission parameters
 */
export interface W9SubmissionParams {
  userId?: string
  organizationId?: string
  legalName: string
  businessName?: string
  taxClassification: TaxClassification
  tinType: TINType
  tin: string
  address: {
    line1: string
    line2?: string
    city: string
    state: string
    postalCode: string
    country?: string
  }
  isUsPerson: boolean
  isExemptPayee?: boolean
  exemptPayeeCode?: string
  signatureName: string
  signatureIp?: string
}

/**
 * Submit a W-9 form
 */
export async function submitW9(params: W9SubmissionParams): Promise<{
  success: boolean
  taxInfoId: string
  lastFour: string
}> {
  // Validate TIN format
  const cleanTIN = params.tin.replace(/\D/g, '')

  if (params.tinType === 'ssn') {
    if (!validateSSN(cleanTIN)) {
      throw new Error('Invalid SSN format')
    }
  } else if (params.tinType === 'ein') {
    if (!validateEIN(cleanTIN)) {
      throw new Error('Invalid EIN format')
    }
  }

  // Encrypt the TIN
  const encryptedTIN = encryptTIN(cleanTIN)
  const lastFour = getTINLastFour(cleanTIN)

  const id = uuidv4()

  // Insert tax information
  await dbQuery(
    `INSERT INTO tax_information (
      id, user_id, organization_id, tax_form_type, legal_name, business_name,
      tax_classification, tin_type, tin_encrypted, tin_last_four,
      address_line1, address_line2, city, state, postal_code, country,
      is_us_person, is_exempt_payee, exempt_payee_code,
      signature_name, signature_date, signature_ip, status, created_at
    ) VALUES (
      @id, @userId, @orgId, 'w9', @legalName, @businessName,
      @taxClassification, @tinType, @tinEncrypted, @lastFour,
      @addressLine1, @addressLine2, @city, @state, @postalCode, @country,
      @isUsPerson, @isExemptPayee, @exemptPayeeCode,
      @signatureName, GETUTCDATE(), @signatureIp, 'pending', GETUTCDATE()
    )`,
    {
      id,
      userId: params.userId || null,
      orgId: params.organizationId || null,
      legalName: params.legalName,
      businessName: params.businessName || null,
      taxClassification: params.taxClassification,
      tinType: params.tinType,
      tinEncrypted: encryptedTIN,
      lastFour,
      addressLine1: params.address.line1,
      addressLine2: params.address.line2 || null,
      city: params.address.city,
      state: params.address.state,
      postalCode: params.address.postalCode,
      country: params.address.country || 'USA',
      isUsPerson: params.isUsPerson,
      isExemptPayee: params.isExemptPayee || false,
      exemptPayeeCode: params.exemptPayeeCode || null,
      signatureName: params.signatureName,
      signatureIp: params.signatureIp || null,
    }
  )

  // Update user/org tax status
  if (params.userId) {
    await dbQuery(
      `UPDATE users SET tax_info_status = 'pending', tax_info_submitted_at = GETUTCDATE() WHERE id = @userId`,
      { userId: params.userId }
    )
  }

  if (params.organizationId) {
    await dbQuery(
      `UPDATE organizations SET tax_info_status = 'pending', tax_info_submitted_at = GETUTCDATE() WHERE id = @orgId`,
      { orgId: params.organizationId }
    )
  }

  // Log for audit
  await logComplianceEvent({
    eventType: 'tax_info_submitted',
    userId: params.userId,
    organizationId: params.organizationId,
    details: {
      formType: 'w9',
      tinType: params.tinType,
      tinLastFour: lastFour,
      taxClassification: params.taxClassification,
    },
    ipAddress: params.signatureIp,
  })

  return { success: true, taxInfoId: id, lastFour }
}

/**
 * Get tax information for a user (without encrypted TIN)
 */
export async function getUserTaxInfo(userId: string): Promise<TaxInformation | null> {
  const result = await dbQuery(
    `SELECT id, user_id, organization_id, tax_form_type, legal_name, business_name,
            tax_classification, tin_type, tin_last_four,
            address_line1, address_line2, city, state, postal_code, country,
            is_us_person, is_exempt_payee, exempt_payee_code,
            signature_name, signature_date, status, verified_at, verified_by,
            created_at, expires_at
     FROM tax_information
     WHERE user_id = @userId
     ORDER BY created_at DESC`,
    { userId }
  )

  if (result.recordset.length === 0) {
    return null
  }

  return mapTaxInfoRow(result.recordset[0])
}

/**
 * Get tax information for an organization (without encrypted TIN)
 */
export async function getOrganizationTaxInfo(
  organizationId: string
): Promise<TaxInformation | null> {
  const result = await dbQuery(
    `SELECT id, user_id, organization_id, tax_form_type, legal_name, business_name,
            tax_classification, tin_type, tin_last_four,
            address_line1, address_line2, city, state, postal_code, country,
            is_us_person, is_exempt_payee, exempt_payee_code,
            signature_name, signature_date, status, verified_at, verified_by,
            created_at, expires_at
     FROM tax_information
     WHERE organization_id = @orgId
     ORDER BY created_at DESC`,
    { orgId: organizationId }
  )

  if (result.recordset.length === 0) {
    return null
  }

  return mapTaxInfoRow(result.recordset[0])
}

/**
 * Map database row to TaxInformation object
 */
function mapTaxInfoRow(row: Record<string, unknown>): TaxInformation {
  return {
    id: row.id as string,
    userId: row.user_id as string | undefined,
    organizationId: row.organization_id as string | undefined,
    taxFormType: row.tax_form_type as TaxFormType,
    legalName: row.legal_name as string,
    businessName: row.business_name as string | undefined,
    taxClassification: row.tax_classification as TaxClassification | undefined,
    tinType: row.tin_type as TINType | undefined,
    tinLastFour: row.tin_last_four as string | undefined,
    address: {
      line1: row.address_line1 as string | undefined,
      line2: row.address_line2 as string | undefined,
      city: row.city as string | undefined,
      state: row.state as string | undefined,
      postalCode: row.postal_code as string | undefined,
      country: (row.country as string) || 'USA',
    },
    isUsPerson: row.is_us_person as boolean | undefined,
    isExemptPayee: (row.is_exempt_payee as boolean) || false,
    exemptPayeeCode: row.exempt_payee_code as string | undefined,
    signatureName: row.signature_name as string,
    signatureDate: row.signature_date as Date,
    status: row.status as TaxInfoStatus,
    verifiedAt: row.verified_at as Date | undefined,
    verifiedBy: row.verified_by as string | undefined,
    createdAt: row.created_at as Date,
    expiresAt: row.expires_at as Date | undefined,
  }
}

/**
 * Verify a W-9 submission (admin action)
 */
export async function verifyTaxInfo(
  taxInfoId: string,
  verifiedBy: string,
  status: 'verified' | 'invalid',
  notes?: string
): Promise<void> {
  // Get the tax info first to identify user/org
  const result = await dbQuery(
    `SELECT user_id, organization_id FROM tax_information WHERE id = @id`,
    { id: taxInfoId }
  )

  if (result.recordset.length === 0) {
    throw new Error('Tax information not found')
  }

  const { user_id: userId, organization_id: orgId } = result.recordset[0]

  // Update the tax info status
  await dbQuery(
    `UPDATE tax_information
     SET status = @status, verified_at = GETUTCDATE(), verified_by = @verifiedBy
     WHERE id = @id`,
    { id: taxInfoId, status, verifiedBy }
  )

  // Update user/org status
  if (userId) {
    await dbQuery(`UPDATE users SET tax_info_status = @status WHERE id = @userId`, {
      userId,
      status,
    })
  }

  if (orgId) {
    await dbQuery(`UPDATE organizations SET tax_info_status = @status WHERE id = @orgId`, {
      orgId,
      status,
    })
  }

  // Log the event
  await logComplianceEvent({
    eventType: status === 'verified' ? 'tax_info_verified' : 'tax_info_rejected',
    userId,
    organizationId: orgId,
    details: { taxInfoId, verifiedBy, notes },
  })
}

/**
 * Check if a user needs to submit W-9 before payout
 * IRS threshold is $600
 */
export async function requiresW9ForPayout(userId: string): Promise<{
  required: boolean
  reason?: string
  currentEarnings: number
}> {
  // Check current year's completed payouts/earnings for this user
  // This would typically be from individual_payouts or platform_fees tables
  // For now, we'll check completed payments where this user is a seller

  const currentYear = new Date().getFullYear()

  // Get total earnings for the year from auction wins where user was seller
  const earningsResult = await dbQuery(
    `SELECT COALESCE(SUM(pf.seller_amount), 0) as total_earnings
     FROM platform_fees pf
     INNER JOIN event_items ei ON pf.item_id = ei.id
     INNER JOIN auctions a ON ei.auction_id = a.id
     WHERE a.seller_id = @userId
       AND pf.status = 'completed'
       AND YEAR(pf.created_at) = @year`,
    { userId, year: currentYear }
  )

  const totalEarnings = earningsResult.recordset[0]?.total_earnings || 0

  // IRS threshold
  const threshold = 600

  if (totalEarnings >= threshold) {
    // Check if verified W-9 is on file
    const taxInfo = await dbQuery(
      `SELECT status FROM tax_information
       WHERE user_id = @userId AND tax_form_type = 'w9' AND status = 'verified'`,
      { userId }
    )

    if (taxInfo.recordset.length === 0) {
      return {
        required: true,
        reason: `W-9 required for payouts. Your earnings ($${totalEarnings.toFixed(2)}) have exceeded the $600 IRS reporting threshold.`,
        currentEarnings: totalEarnings,
      }
    }
  }

  return {
    required: false,
    currentEarnings: totalEarnings,
  }
}

/**
 * Get pending W-9 submissions for admin review
 */
export async function getPendingTaxInfoSubmissions(params: {
  limit?: number
  offset?: number
}): Promise<{ submissions: TaxInformation[]; total: number }> {
  const limit = params.limit || 50
  const offset = params.offset || 0

  const countResult = await dbQuery(
    `SELECT COUNT(*) as total FROM tax_information WHERE status = 'pending'`
  )

  const result = await dbQuery(
    `SELECT id, user_id, organization_id, tax_form_type, legal_name, business_name,
            tax_classification, tin_type, tin_last_four,
            address_line1, address_line2, city, state, postal_code, country,
            is_us_person, is_exempt_payee, exempt_payee_code,
            signature_name, signature_date, status, verified_at, verified_by,
            created_at, expires_at
     FROM tax_information
     WHERE status = 'pending'
     ORDER BY created_at ASC
     OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
    { limit, offset }
  )

  return {
    submissions: result.recordset.map(mapTaxInfoRow),
    total: countResult.recordset[0].total,
  }
}

/**
 * Get decrypted TIN for 1099 generation (admin only, audited)
 */
export async function getDecryptedTINFor1099(
  taxInfoId: string,
  accessedBy: string,
  ipAddress?: string
): Promise<{ tin: string; tinType: TINType; formattedMasked: string }> {
  // Get the encrypted TIN
  const result = await dbQuery(
    `SELECT tin_encrypted, tin_type, tin_last_four, user_id, organization_id
     FROM tax_information
     WHERE id = @id AND status = 'verified'`,
    { id: taxInfoId }
  )

  if (result.recordset.length === 0) {
    throw new Error('Verified tax information not found')
  }

  const row = result.recordset[0]

  // Log the access
  await logTINAccess({
    accessedBy,
    targetUserId: row.user_id,
    targetOrganizationId: row.organization_id,
    purpose: '1099 generation',
    ipAddress,
  })

  // Decrypt the TIN
  const tin = decryptTIN(row.tin_encrypted)

  return {
    tin,
    tinType: row.tin_type as TINType,
    formattedMasked:
      row.tin_type === 'ssn'
        ? formatMaskedSSN(row.tin_last_four)
        : formatMaskedEIN(row.tin_last_four),
  }
}

/**
 * Get user's tax status summary
 */
export async function getTaxStatus(userId: string): Promise<{
  status: 'not_submitted' | 'pending' | 'verified' | 'expired'
  submittedAt?: Date
  tinLastFour?: string
  tinType?: TINType
  requiresUpdate: boolean
}> {
  const result = await dbQuery(
    `SELECT tax_info_status, tax_info_submitted_at FROM users WHERE id = @userId`,
    { userId }
  )

  if (result.recordset.length === 0) {
    throw new Error('User not found')
  }

  const user = result.recordset[0]
  const status = user.tax_info_status || 'not_submitted'

  // Get tax info details if submitted
  let tinLastFour: string | undefined
  let tinType: TINType | undefined

  if (status !== 'not_submitted') {
    const taxInfo = await getUserTaxInfo(userId)
    if (taxInfo) {
      tinLastFour = taxInfo.tinLastFour
      tinType = taxInfo.tinType
    }
  }

  // Check if payout requirement would require W-9
  const payoutCheck = await requiresW9ForPayout(userId)

  return {
    status,
    submittedAt: user.tax_info_submitted_at || undefined,
    tinLastFour,
    tinType,
    requiresUpdate: payoutCheck.required && status !== 'verified',
  }
}
