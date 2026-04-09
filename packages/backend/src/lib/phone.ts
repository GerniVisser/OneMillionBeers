import { parsePhoneNumberWithError } from 'libphonenumber-js'

/**
 * Extracts the ISO 3166-1 alpha-2 country code from a collector senderId.
 * senderId format: "wa:27831234567" (prefix:digits without leading +)
 * Returns null if the number cannot be parsed.
 */
export function extractCountryCode(senderId: string): string | null {
  try {
    const digits = senderId.replace(/^[^:]+:/, '')
    const parsed = parsePhoneNumberWithError('+' + digits)
    return parsed?.country ?? null
  } catch {
    return null
  }
}
