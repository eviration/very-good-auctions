import { query as dbQuery } from '../config/database.js'
import { v4 as uuidv4 } from 'uuid'
import { hashAgreementContent } from './encryption.js'
import { logComplianceEvent } from './complianceAudit.js'

/**
 * Agreement types supported by the platform
 */
export type AgreementType =
  | 'terms_of_service'
  | 'privacy_policy'
  | 'seller_agreement'
  | 'organization_agreement'
  | 'bidder_agreement'

/**
 * Agreement version data
 */
export interface AgreementVersion {
  id: string
  agreementType: AgreementType
  version: string
  title: string
  content: string
  contentHash: string
  effectiveDate: Date
  isCurrent: boolean
  createdAt: Date
}

/**
 * Agreement acceptance record
 */
export interface AgreementAcceptance {
  id: string
  userId: string
  agreementType: AgreementType
  agreementVersion: string
  agreementHash: string
  acceptedAt: Date
  organizationId?: string
}

/**
 * Get the current version of an agreement type
 */
export async function getCurrentAgreement(
  agreementType: AgreementType
): Promise<AgreementVersion | null> {
  const result = await dbQuery(
    `SELECT id, agreement_type, version, title, content, content_hash, effective_date, is_current, created_at
     FROM agreement_versions
     WHERE agreement_type = @agreementType AND is_current = 1`,
    { agreementType }
  )

  if (result.recordset.length === 0) {
    return null
  }

  const row = result.recordset[0]
  return {
    id: row.id,
    agreementType: row.agreement_type as AgreementType,
    version: row.version,
    title: row.title,
    content: row.content,
    contentHash: row.content_hash,
    effectiveDate: row.effective_date,
    isCurrent: row.is_current,
    createdAt: row.created_at,
  }
}

/**
 * Get a specific version of an agreement
 */
export async function getAgreementVersion(
  agreementType: AgreementType,
  version: string
): Promise<AgreementVersion | null> {
  const result = await dbQuery(
    `SELECT id, agreement_type, version, title, content, content_hash, effective_date, is_current, created_at
     FROM agreement_versions
     WHERE agreement_type = @agreementType AND version = @version`,
    { agreementType, version }
  )

  if (result.recordset.length === 0) {
    return null
  }

  const row = result.recordset[0]
  return {
    id: row.id,
    agreementType: row.agreement_type as AgreementType,
    version: row.version,
    title: row.title,
    content: row.content,
    contentHash: row.content_hash,
    effectiveDate: row.effective_date,
    isCurrent: row.is_current,
    createdAt: row.created_at,
  }
}

/**
 * Create a new agreement version
 * Automatically sets previous versions as non-current
 */
export async function createAgreementVersion(params: {
  agreementType: AgreementType
  version: string
  title: string
  content: string
  effectiveDate: Date
  createdBy?: string
}): Promise<AgreementVersion> {
  const id = uuidv4()
  const contentHash = hashAgreementContent(params.content)

  // Set all previous versions as non-current
  await dbQuery(
    `UPDATE agreement_versions SET is_current = 0 WHERE agreement_type = @agreementType`,
    { agreementType: params.agreementType }
  )

  // Insert new version
  await dbQuery(
    `INSERT INTO agreement_versions (id, agreement_type, version, title, content, content_hash, effective_date, is_current, created_at, created_by)
     VALUES (@id, @agreementType, @version, @title, @content, @contentHash, @effectiveDate, 1, GETUTCDATE(), @createdBy)`,
    {
      id,
      agreementType: params.agreementType,
      version: params.version,
      title: params.title,
      content: params.content,
      contentHash,
      effectiveDate: params.effectiveDate,
      createdBy: params.createdBy || null,
    }
  )

  // Log the event
  await logComplianceEvent({
    eventType: 'agreement_version_created',
    userId: params.createdBy,
    details: {
      agreementType: params.agreementType,
      version: params.version,
      contentHash,
    },
  })

  return {
    id,
    agreementType: params.agreementType,
    version: params.version,
    title: params.title,
    content: params.content,
    contentHash,
    effectiveDate: params.effectiveDate,
    isCurrent: true,
    createdAt: new Date(),
  }
}

/**
 * Record a user's acceptance of an agreement
 */
export async function acceptAgreement(params: {
  userId: string
  agreementType: AgreementType
  agreementVersion: string
  agreementHash: string
  organizationId?: string
  ipAddress?: string
  userAgent?: string
}): Promise<AgreementAcceptance> {
  const id = uuidv4()

  await dbQuery(
    `INSERT INTO agreement_acceptances (id, user_id, agreement_type, agreement_version, agreement_hash, accepted_at, accepted_ip, accepted_user_agent, organization_id)
     VALUES (@id, @userId, @agreementType, @version, @hash, GETUTCDATE(), @ip, @userAgent, @orgId)`,
    {
      id,
      userId: params.userId,
      agreementType: params.agreementType,
      version: params.agreementVersion,
      hash: params.agreementHash,
      ip: params.ipAddress || null,
      userAgent: params.userAgent || null,
      orgId: params.organizationId || null,
    }
  )

  // Update user's agreement tracking fields
  const updateField = getAgreementUserField(params.agreementType)
  if (updateField && !params.organizationId) {
    await dbQuery(
      `UPDATE users SET ${updateField.versionField} = @version, ${updateField.dateField} = GETUTCDATE() WHERE id = @userId`,
      { userId: params.userId, version: params.agreementVersion }
    )
  }

  // Update organization's agreement tracking if applicable
  if (params.organizationId && params.agreementType === 'organization_agreement') {
    await dbQuery(
      `UPDATE organizations SET org_agreement_version = @version, org_agreement_accepted_at = GETUTCDATE(), org_agreement_accepted_by = @userId
       WHERE id = @orgId`,
      {
        version: params.agreementVersion,
        userId: params.userId,
        orgId: params.organizationId,
      }
    )
  }

  // Log the event
  await logComplianceEvent({
    eventType: 'agreement_accepted',
    userId: params.userId,
    organizationId: params.organizationId,
    details: {
      agreementType: params.agreementType,
      version: params.agreementVersion,
      hash: params.agreementHash,
    },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  })

  return {
    id,
    userId: params.userId,
    agreementType: params.agreementType,
    agreementVersion: params.agreementVersion,
    agreementHash: params.agreementHash,
    acceptedAt: new Date(),
    organizationId: params.organizationId,
  }
}

/**
 * Get user field mapping for agreement type
 */
function getAgreementUserField(
  agreementType: AgreementType
): { versionField: string; dateField: string } | null {
  switch (agreementType) {
    case 'terms_of_service':
      return { versionField: 'tos_accepted_version', dateField: 'tos_accepted_at' }
    case 'privacy_policy':
      return { versionField: 'privacy_accepted_version', dateField: 'privacy_accepted_at' }
    case 'seller_agreement':
      return {
        versionField: 'seller_agreement_version',
        dateField: 'seller_agreement_accepted_at',
      }
    default:
      return null
  }
}

/**
 * Get all agreements accepted by a user
 */
export async function getUserAcceptances(userId: string): Promise<AgreementAcceptance[]> {
  const result = await dbQuery(
    `SELECT id, user_id, agreement_type, agreement_version, agreement_hash, accepted_at, organization_id
     FROM agreement_acceptances
     WHERE user_id = @userId
     ORDER BY accepted_at DESC`,
    { userId }
  )

  return result.recordset.map(
    (row: {
      id: string
      user_id: string
      agreement_type: string
      agreement_version: string
      agreement_hash: string
      accepted_at: Date
      organization_id: string | null
    }) => ({
      id: row.id,
      userId: row.user_id,
      agreementType: row.agreement_type as AgreementType,
      agreementVersion: row.agreement_version,
      agreementHash: row.agreement_hash,
      acceptedAt: row.accepted_at,
      organizationId: row.organization_id || undefined,
    })
  )
}

/**
 * Check if user has accepted the current version of an agreement
 */
export async function hasAcceptedCurrentAgreement(
  userId: string,
  agreementType: AgreementType
): Promise<boolean> {
  const currentAgreement = await getCurrentAgreement(agreementType)
  if (!currentAgreement) {
    return true // No agreement required
  }

  const result = await dbQuery(
    `SELECT 1 FROM agreement_acceptances
     WHERE user_id = @userId AND agreement_type = @agreementType AND agreement_version = @version`,
    { userId, agreementType, version: currentAgreement.version }
  )

  return result.recordset.length > 0
}

/**
 * Get agreements that user needs to accept
 */
export async function getPendingAgreements(
  userId: string,
  requiredTypes: AgreementType[]
): Promise<AgreementVersion[]> {
  const pending: AgreementVersion[] = []

  for (const agreementType of requiredTypes) {
    const hasAccepted = await hasAcceptedCurrentAgreement(userId, agreementType)
    if (!hasAccepted) {
      const current = await getCurrentAgreement(agreementType)
      if (current) {
        pending.push(current)
      }
    }
  }

  return pending
}

/**
 * Get all versions of an agreement type
 */
export async function getAgreementHistory(
  agreementType: AgreementType
): Promise<AgreementVersion[]> {
  const result = await dbQuery(
    `SELECT id, agreement_type, version, title, content, content_hash, effective_date, is_current, created_at
     FROM agreement_versions
     WHERE agreement_type = @agreementType
     ORDER BY created_at DESC`,
    { agreementType }
  )

  return result.recordset.map(
    (row: {
      id: string
      agreement_type: string
      version: string
      title: string
      content: string
      content_hash: string
      effective_date: Date
      is_current: boolean
      created_at: Date
    }) => ({
      id: row.id,
      agreementType: row.agreement_type as AgreementType,
      version: row.version,
      title: row.title,
      content: row.content,
      contentHash: row.content_hash,
      effectiveDate: row.effective_date,
      isCurrent: row.is_current,
      createdAt: row.created_at,
    })
  )
}

/**
 * Get acceptance statistics for an agreement version
 */
export async function getAgreementAcceptanceStats(
  agreementType: AgreementType,
  version: string
): Promise<{
  totalAcceptances: number
  uniqueUsers: number
  firstAcceptance: Date | null
  lastAcceptance: Date | null
}> {
  const result = await dbQuery(
    `SELECT
       COUNT(*) as total_acceptances,
       COUNT(DISTINCT user_id) as unique_users,
       MIN(accepted_at) as first_acceptance,
       MAX(accepted_at) as last_acceptance
     FROM agreement_acceptances
     WHERE agreement_type = @agreementType AND agreement_version = @version`,
    { agreementType, version }
  )

  const row = result.recordset[0]
  return {
    totalAcceptances: row.total_acceptances,
    uniqueUsers: row.unique_users,
    firstAcceptance: row.first_acceptance,
    lastAcceptance: row.last_acceptance,
  }
}
