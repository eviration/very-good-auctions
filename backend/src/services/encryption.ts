import crypto from 'crypto'

// Environment variable for encryption key (must be 32 bytes / 64 hex characters)
const ENCRYPTION_KEY = process.env.TAX_ENCRYPTION_KEY

/**
 * Validate that the encryption key is properly configured
 */
function getEncryptionKey(): Buffer {
  if (!ENCRYPTION_KEY) {
    throw new Error(
      'TAX_ENCRYPTION_KEY environment variable is not set. ' +
        'Generate a 32-byte key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    )
  }

  if (ENCRYPTION_KEY.length !== 64) {
    throw new Error(
      'TAX_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). ' +
        `Current length: ${ENCRYPTION_KEY.length}`
    )
  }

  return Buffer.from(ENCRYPTION_KEY, 'hex')
}

/**
 * Encrypt a Tax Identification Number (SSN or EIN) using AES-256-GCM
 *
 * The encrypted output format is:
 * - Bytes 0-15: IV (Initialization Vector)
 * - Bytes 16-31: Authentication Tag
 * - Bytes 32+: Encrypted data
 *
 * @param tin - The TIN to encrypt (can include dashes, will be cleaned)
 * @returns Buffer containing IV + AuthTag + EncryptedData
 */
export function encryptTIN(tin: string): Buffer {
  const key = getEncryptionKey()

  // Remove any non-digit characters (dashes, spaces, etc.)
  const cleanTIN = tin.replace(/\D/g, '')

  // Validate TIN length (both SSN and EIN are 9 digits)
  if (cleanTIN.length !== 9) {
    throw new Error('TIN must be exactly 9 digits')
  }

  // Generate a random 16-byte IV for each encryption
  const iv = crypto.randomBytes(16)

  // Create cipher with AES-256-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

  // Encrypt the TIN
  let encrypted = cipher.update(cleanTIN, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  // Get the authentication tag (16 bytes)
  const authTag = cipher.getAuthTag()

  // Combine IV + AuthTag + EncryptedData into a single buffer
  return Buffer.concat([iv, authTag, Buffer.from(encrypted, 'hex')])
}

/**
 * Decrypt a Tax Identification Number using AES-256-GCM
 *
 * IMPORTANT: This function should only be used for authorized 1099 generation.
 * Access to decrypted TINs should be strictly controlled and audited.
 *
 * @param encrypted - Buffer containing IV + AuthTag + EncryptedData
 * @returns The decrypted TIN (9 digits, no formatting)
 */
export function decryptTIN(encrypted: Buffer): string {
  const key = getEncryptionKey()

  // Extract components from the encrypted buffer
  const iv = encrypted.subarray(0, 16)
  const authTag = encrypted.subarray(16, 32)
  const data = encrypted.subarray(32)

  // Create decipher
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)

  // Decrypt
  let decrypted = decipher.update(data, undefined, 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

/**
 * Get the last 4 digits of a TIN for display purposes
 *
 * @param tin - The TIN (can include dashes)
 * @returns Last 4 digits (e.g., "1234")
 */
export function getTINLastFour(tin: string): string {
  const cleanTIN = tin.replace(/\D/g, '')
  if (cleanTIN.length !== 9) {
    throw new Error('TIN must be exactly 9 digits')
  }
  return cleanTIN.slice(-4)
}

/**
 * Validate SSN format
 *
 * Valid SSN rules:
 * - 9 digits
 * - Cannot start with 000, 666, or 900-999
 * - Middle two digits cannot be 00
 * - Last four digits cannot be 0000
 *
 * @param ssn - The SSN to validate (with or without dashes)
 * @returns True if valid format
 */
export function validateSSN(ssn: string): boolean {
  const clean = ssn.replace(/\D/g, '')

  if (clean.length !== 9) {
    return false
  }

  const area = parseInt(clean.substring(0, 3), 10)
  const group = parseInt(clean.substring(3, 5), 10)
  const serial = parseInt(clean.substring(5, 9), 10)

  // Area number restrictions
  if (area === 0 || area === 666 || area >= 900) {
    return false
  }

  // Group number cannot be 00
  if (group === 0) {
    return false
  }

  // Serial number cannot be 0000
  if (serial === 0) {
    return false
  }

  return true
}

/**
 * Validate EIN format
 *
 * Valid EIN rules:
 * - 9 digits
 * - First two digits must be a valid campus code (01-06, 10-16, 20-27, 30-39, 40-48, 50-59, 60-68, 71-77, 80-88, 90-98)
 *
 * @param ein - The EIN to validate (with or without dash)
 * @returns True if valid format
 */
export function validateEIN(ein: string): boolean {
  const clean = ein.replace(/\D/g, '')

  if (clean.length !== 9) {
    return false
  }

  const prefix = parseInt(clean.substring(0, 2), 10)

  // Valid EIN prefixes (IRS campus codes)
  const validPrefixes = [
    // Campus codes
    ...Array.from({ length: 6 }, (_, i) => i + 1), // 01-06
    ...Array.from({ length: 7 }, (_, i) => i + 10), // 10-16
    ...Array.from({ length: 8 }, (_, i) => i + 20), // 20-27
    ...Array.from({ length: 10 }, (_, i) => i + 30), // 30-39
    ...Array.from({ length: 9 }, (_, i) => i + 40), // 40-48
    ...Array.from({ length: 10 }, (_, i) => i + 50), // 50-59
    ...Array.from({ length: 9 }, (_, i) => i + 60), // 60-68
    ...Array.from({ length: 7 }, (_, i) => i + 71), // 71-77
    ...Array.from({ length: 9 }, (_, i) => i + 80), // 80-88
    ...Array.from({ length: 9 }, (_, i) => i + 90), // 90-98
  ]

  return validPrefixes.includes(prefix)
}

/**
 * Format SSN for display (XXX-XX-1234)
 * Only shows last 4 digits, masks the rest
 *
 * @param lastFour - The last 4 digits of the SSN
 * @returns Formatted masked SSN
 */
export function formatMaskedSSN(lastFour: string): string {
  return `XXX-XX-${lastFour}`
}

/**
 * Format EIN for display (XX-XXX1234)
 * Only shows last 4 digits, masks the rest
 *
 * @param lastFour - The last 4 digits of the EIN
 * @returns Formatted masked EIN
 */
export function formatMaskedEIN(lastFour: string): string {
  return `XX-XXX${lastFour}`
}

/**
 * Generate a SHA-256 hash of agreement content for verification
 *
 * @param content - The agreement text content
 * @returns 64-character hex string (SHA-256 hash)
 */
export function hashAgreementContent(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex')
}
