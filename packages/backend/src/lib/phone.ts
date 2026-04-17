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

/**
 * Normalises a user-supplied phone string for DB lookup.
 * Only treats the input as a phone number when the user has given an explicit
 * international signal: a leading "+" or "00" dialling prefix. Bare digit
 * strings (e.g. "27831234567") are rejected — they route to fuzzy name search
 * instead so that digit-like pseudo-names are not silently bypassed.
 *
 * Returns the digits-only E.164 number (no leading +) on success, or null if
 * the input should not be treated as a phone number.
 *
 * Examples:
 *   "+27 83 123 4567" → "27831234567"
 *   "0027831234567"   → "27831234567"
 *   "27831234567"     → null  (no explicit prefix — treated as name query)
 *   "0831234567"      → null  (local format, ambiguous country)
 *   "GoldenLager"     → null  (not a phone number)
 */
export function normalisePhoneForSearch(raw: string): string | null {
  const trimmed = raw.trim()
  // Require an explicit international prefix — never auto-prepend one.
  if (!trimmed.startsWith('+') && !trimmed.startsWith('00')) return null

  const withPlus = trimmed.startsWith('00') ? '+' + trimmed.slice(2) : trimmed
  const stripped = withPlus.replace(/[\s\-().]/g, '')
  try {
    const parsed = parsePhoneNumberWithError(stripped)
    if (!parsed.isValid()) return null
    // E.164 is "+27831234567"; drop the leading + to match DB storage format
    return parsed.format('E.164').slice(1)
  } catch {
    return null
  }
}
