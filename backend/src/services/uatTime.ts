import { query as dbQuery } from '../config/database.js'

interface UatSettings {
  global_time_offset_seconds: number
  is_time_frozen: boolean
  time_frozen_at: Date | null
}

interface AuctionEvent {
  simulated_current_time?: Date | null
}

// Cache for UAT settings
let settingsCache: UatSettings | null = null
let settingsCacheTime = 0
const CACHE_TTL = 5000 // 5 seconds

/**
 * Get UAT settings (cached for performance).
 */
export async function getUatSettings(): Promise<UatSettings> {
  if (settingsCache && Date.now() - settingsCacheTime < CACHE_TTL) {
    return settingsCache
  }

  const result = await dbQuery(`SELECT * FROM uat_settings WHERE id = 1`)
  settingsCache = result.recordset[0] || { global_time_offset_seconds: 0, is_time_frozen: false, time_frozen_at: null }
  settingsCacheTime = Date.now()
  return settingsCache
}

/**
 * Clear the settings cache (call after updates).
 */
export function clearSettingsCache(): void {
  settingsCache = null
}

/**
 * Get the effective current time for UAT.
 * Considers: frozen time, global offset, and per-event simulation.
 */
export async function getEffectiveTime(event?: AuctionEvent): Promise<Date> {
  // 1. If event has simulated time, use that
  if (event?.simulated_current_time) {
    return new Date(event.simulated_current_time)
  }

  // 2. Check global UAT settings
  const settings = await getUatSettings()

  // 3. If time is frozen globally, use frozen time
  if (settings.is_time_frozen && settings.time_frozen_at) {
    return new Date(settings.time_frozen_at)
  }

  // 4. Apply global offset
  const now = new Date()
  if (settings.global_time_offset_seconds) {
    return new Date(now.getTime() + (settings.global_time_offset_seconds * 1000))
  }

  // 5. Default to real time
  return now
}

/**
 * Parse an offset string like "+2h", "-30m", "+1d" into seconds.
 */
export function parseOffsetString(offset: string): number {
  const match = offset.match(/^([+-]?)(\d+)(s|m|h|d|w)$/)
  if (!match) throw new Error('Invalid offset format. Use format like +2h, -30m, +1d')

  const sign = match[1] === '-' ? -1 : 1
  const value = parseInt(match[2])
  const unit = match[3]

  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
    w: 604800,
  }

  return sign * value * multipliers[unit]
}

/**
 * Format seconds offset into human-readable string.
 */
export function formatOffset(seconds: number): string {
  if (seconds === 0) return 'none'

  const abs = Math.abs(seconds)
  const sign = seconds > 0 ? '+' : '-'

  if (abs >= 604800) return `${sign}${Math.round(abs / 604800)}w`
  if (abs >= 86400) return `${sign}${Math.round(abs / 86400)}d`
  if (abs >= 3600) return `${sign}${Math.round(abs / 3600)}h`
  if (abs >= 60) return `${sign}${Math.round(abs / 60)}m`
  return `${sign}${abs}s`
}
