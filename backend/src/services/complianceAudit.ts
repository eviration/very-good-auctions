import { query as dbQuery } from '../config/database.js'
import { v4 as uuidv4 } from 'uuid'

/**
 * Compliance event types for audit logging
 */
export type ComplianceEventType =
  | 'tax_info_submitted'
  | 'tax_info_verified'
  | 'tax_info_rejected'
  | 'tax_info_expired'
  | 'agreement_accepted'
  | 'agreement_version_created'
  | 'payout_blocked_w9_required'
  | 'payout_processed'
  | 'nonprofit_verification_submitted'
  | 'nonprofit_verified'
  | 'nonprofit_verification_rejected'
  | '1099_threshold_met'
  | '1099_generated'
  | 'tin_accessed'

/**
 * Log a compliance event for audit trail
 *
 * @param params - Event parameters
 * @param params.eventType - Type of compliance event
 * @param params.userId - Optional user ID associated with event
 * @param params.organizationId - Optional organization ID associated with event
 * @param params.details - JSON-serializable object with event-specific details
 * @param params.ipAddress - IP address of the request
 * @param params.userAgent - User agent string of the request
 */
export async function logComplianceEvent(params: {
  eventType: ComplianceEventType
  userId?: string
  organizationId?: string
  details?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}): Promise<void> {
  const id = uuidv4()

  await dbQuery(
    `INSERT INTO compliance_audit_log (id, event_type, user_id, organization_id, details, ip_address, user_agent, created_at)
     VALUES (@id, @eventType, @userId, @organizationId, @details, @ipAddress, @userAgent, GETUTCDATE())`,
    {
      id,
      eventType: params.eventType,
      userId: params.userId || null,
      organizationId: params.organizationId || null,
      details: params.details ? JSON.stringify(params.details) : null,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
    }
  )
}

/**
 * Get compliance audit logs with filtering
 */
export async function getComplianceAuditLogs(params: {
  userId?: string
  organizationId?: string
  eventType?: ComplianceEventType
  startDate?: Date
  endDate?: Date
  limit?: number
  offset?: number
}): Promise<{
  logs: Array<{
    id: string
    eventType: string
    userId: string | null
    organizationId: string | null
    details: Record<string, unknown> | null
    ipAddress: string | null
    userAgent: string | null
    createdAt: Date
  }>
  total: number
}> {
  const conditions: string[] = ['1=1']
  const queryParams: Record<string, unknown> = {
    limit: params.limit || 50,
    offset: params.offset || 0,
  }

  if (params.userId) {
    conditions.push('user_id = @userId')
    queryParams.userId = params.userId
  }

  if (params.organizationId) {
    conditions.push('organization_id = @organizationId')
    queryParams.organizationId = params.organizationId
  }

  if (params.eventType) {
    conditions.push('event_type = @eventType')
    queryParams.eventType = params.eventType
  }

  if (params.startDate) {
    conditions.push('created_at >= @startDate')
    queryParams.startDate = params.startDate
  }

  if (params.endDate) {
    conditions.push('created_at <= @endDate')
    queryParams.endDate = params.endDate
  }

  const whereClause = conditions.join(' AND ')

  // Get total count
  const countResult = await dbQuery(
    `SELECT COUNT(*) as total FROM compliance_audit_log WHERE ${whereClause}`,
    queryParams
  )

  // Get paginated results
  const logsResult = await dbQuery(
    `SELECT id, event_type, user_id, organization_id, details, ip_address, user_agent, created_at
     FROM compliance_audit_log
     WHERE ${whereClause}
     ORDER BY created_at DESC
     OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
    queryParams
  )

  const logs = logsResult.recordset.map(
    (row: {
      id: string
      event_type: string
      user_id: string | null
      organization_id: string | null
      details: string | null
      ip_address: string | null
      user_agent: string | null
      created_at: Date
    }) => ({
      id: row.id,
      eventType: row.event_type,
      userId: row.user_id,
      organizationId: row.organization_id,
      details: row.details ? JSON.parse(row.details) : null,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at,
    })
  )

  return {
    logs,
    total: countResult.recordset[0].total,
  }
}

/**
 * Log access to decrypted TIN data (for 1099 generation)
 * This is required for security auditing
 */
export async function logTINAccess(params: {
  accessedBy: string
  targetUserId?: string
  targetOrganizationId?: string
  purpose: string
  ipAddress?: string
}): Promise<void> {
  await logComplianceEvent({
    eventType: 'tin_accessed',
    userId: params.targetUserId,
    organizationId: params.targetOrganizationId,
    details: {
      accessedBy: params.accessedBy,
      purpose: params.purpose,
      timestamp: new Date().toISOString(),
    },
    ipAddress: params.ipAddress,
  })
}
