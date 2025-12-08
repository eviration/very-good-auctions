import { query as dbQuery } from '../config/database.js'

// Known feature flag keys
export type FeatureFlagKey =
  | 'integrated_payments_enabled'
  | 'self_managed_payments_enabled'
  | 'free_mode_enabled'
  | 'silent_auctions_enabled'
  | 'standard_auctions_enabled'

export interface FeatureFlag {
  id: string
  flagKey: FeatureFlagKey
  flagValue: boolean
  description: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface FeatureFlagAuditEntry {
  id: string
  flagKey: string
  oldValue: boolean | null
  newValue: boolean
  changedByUserId: string
  changedByEmail: string
  reason: string | null
  createdAt: string
}

// In-memory cache for feature flags (refreshed on updates)
const flagCache: Map<FeatureFlagKey, boolean> = new Map()
let cacheInitialized = false

/**
 * Initialize the feature flag cache from database
 */
export async function initializeFeatureFlagCache(): Promise<void> {
  try {
    const result = await dbQuery(
      `SELECT flag_key, flag_value FROM feature_flags`,
      {}
    )

    flagCache.clear()
    for (const row of result.recordset) {
      flagCache.set(row.flag_key as FeatureFlagKey, row.flag_value === true || row.flag_value === 1)
    }
    cacheInitialized = true
    console.log('[FeatureFlags] Cache initialized with', flagCache.size, 'flags')
  } catch (error) {
    console.error('[FeatureFlags] Failed to initialize cache:', error)
    // Set defaults if database not available
    flagCache.set('integrated_payments_enabled', true)
    flagCache.set('self_managed_payments_enabled', true)
    flagCache.set('free_mode_enabled', false)
    flagCache.set('silent_auctions_enabled', true)
    flagCache.set('standard_auctions_enabled', true)
    cacheInitialized = true
  }
}

/**
 * Get a feature flag value (uses cache for performance)
 */
export async function getFeatureFlag(key: FeatureFlagKey): Promise<boolean> {
  if (!cacheInitialized) {
    await initializeFeatureFlagCache()
  }

  const cached = flagCache.get(key)
  if (cached !== undefined) {
    return cached
  }

  // Fallback to database if not in cache
  const result = await dbQuery(
    `SELECT flag_value FROM feature_flags WHERE flag_key = @key`,
    { key }
  )

  if (result.recordset.length === 0) {
    console.warn(`[FeatureFlags] Unknown flag key: ${key}, defaulting to false`)
    return false
  }

  const value = result.recordset[0].flag_value === true || result.recordset[0].flag_value === 1
  flagCache.set(key, value)
  return value
}

/**
 * Get all feature flags
 */
export async function getAllFeatureFlags(): Promise<FeatureFlag[]> {
  const result = await dbQuery(
    `SELECT id, flag_key, flag_value, description, updated_by, created_at, updated_at
     FROM feature_flags
     ORDER BY flag_key`,
    {}
  )

  return result.recordset.map((row: any) => ({
    id: row.id,
    flagKey: row.flag_key,
    flagValue: row.flag_value === true || row.flag_value === 1,
    description: row.description,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

/**
 * Update a feature flag value
 */
export async function updateFeatureFlag(
  key: FeatureFlagKey,
  value: boolean,
  userId: string,
  userEmail: string,
  reason?: string
): Promise<FeatureFlag> {
  // Get old value for audit
  const oldResult = await dbQuery(
    `SELECT flag_value FROM feature_flags WHERE flag_key = @key`,
    { key }
  )

  if (oldResult.recordset.length === 0) {
    throw new Error(`Feature flag not found: ${key}`)
  }

  const oldValue = oldResult.recordset[0].flag_value === true || oldResult.recordset[0].flag_value === 1

  // Update the flag
  await dbQuery(
    `UPDATE feature_flags
     SET flag_value = @value, updated_by = @userId, updated_at = GETUTCDATE()
     WHERE flag_key = @key`,
    { key, value: value ? 1 : 0, userId }
  )

  // Create audit entry
  await dbQuery(
    `INSERT INTO feature_flag_audit_log (flag_key, old_value, new_value, changed_by_user_id, changed_by_email, reason)
     VALUES (@key, @oldValue, @newValue, @userId, @userEmail, @reason)`,
    {
      key,
      oldValue: oldValue ? 1 : 0,
      newValue: value ? 1 : 0,
      userId,
      userEmail,
      reason: reason || null,
    }
  )

  // Update cache
  flagCache.set(key, value)

  // Return updated flag
  const result = await dbQuery(
    `SELECT id, flag_key, flag_value, description, updated_by, created_at, updated_at
     FROM feature_flags
     WHERE flag_key = @key`,
    { key }
  )

  const row = result.recordset[0]
  return {
    id: row.id,
    flagKey: row.flag_key,
    flagValue: row.flag_value === true || row.flag_value === 1,
    description: row.description,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Get audit log for a specific flag or all flags
 */
export async function getFeatureFlagAuditLog(
  flagKey?: FeatureFlagKey,
  limit: number = 50
): Promise<FeatureFlagAuditEntry[]> {
  const whereClause = flagKey ? 'WHERE flag_key = @flagKey' : ''

  const result = await dbQuery(
    `SELECT TOP (@limit) id, flag_key, old_value, new_value, changed_by_user_id, changed_by_email, reason, created_at
     FROM feature_flag_audit_log
     ${whereClause}
     ORDER BY created_at DESC`,
    { flagKey: flagKey || null, limit }
  )

  return result.recordset.map((row: any) => ({
    id: row.id,
    flagKey: row.flag_key,
    oldValue: row.old_value === null ? null : (row.old_value === true || row.old_value === 1),
    newValue: row.new_value === true || row.new_value === 1,
    changedByUserId: row.changed_by_user_id,
    changedByEmail: row.changed_by_email,
    reason: row.reason,
    createdAt: row.created_at,
  }))
}

// Convenience functions for specific flags

/**
 * Check if integrated payments (Stripe Connect) are enabled
 */
export async function isIntegratedPaymentsEnabled(): Promise<boolean> {
  return getFeatureFlag('integrated_payments_enabled')
}

/**
 * Check if self-managed payments are enabled
 */
export async function isSelfManagedPaymentsEnabled(): Promise<boolean> {
  return getFeatureFlag('self_managed_payments_enabled')
}

/**
 * Check if free mode (no platform fees) is enabled
 */
export async function isFreeModeEnabled(): Promise<boolean> {
  return getFeatureFlag('free_mode_enabled')
}

/**
 * Check if silent auctions are enabled
 */
export async function isSilentAuctionsEnabled(): Promise<boolean> {
  return getFeatureFlag('silent_auctions_enabled')
}

/**
 * Check if standard auctions are enabled
 */
export async function isStandardAuctionsEnabled(): Promise<boolean> {
  return getFeatureFlag('standard_auctions_enabled')
}

/**
 * Get all feature flags as a simple key-value object (useful for frontend)
 */
export async function getFeatureFlagsObject(): Promise<Record<FeatureFlagKey, boolean>> {
  if (!cacheInitialized) {
    await initializeFeatureFlagCache()
  }

  return {
    integrated_payments_enabled: flagCache.get('integrated_payments_enabled') ?? true,
    self_managed_payments_enabled: flagCache.get('self_managed_payments_enabled') ?? true,
    free_mode_enabled: flagCache.get('free_mode_enabled') ?? false,
    silent_auctions_enabled: flagCache.get('silent_auctions_enabled') ?? true,
    standard_auctions_enabled: flagCache.get('standard_auctions_enabled') ?? true,
  }
}
