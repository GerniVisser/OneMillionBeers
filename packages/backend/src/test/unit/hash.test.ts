import { describe, it, expect } from 'vitest'
import { hashPhone } from '../../lib/hash.js'

describe('hashPhone', () => {
  it('returns a 64-char hex string', () => {
    const result = hashPhone('+15551234567')
    expect(result).toHaveLength(64)
    expect(result).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic', () => {
    expect(hashPhone('+15551234567')).toBe(hashPhone('+15551234567'))
  })

  it('produces different hashes for different inputs', () => {
    expect(hashPhone('+15551234567')).not.toBe(hashPhone('+15557654321'))
  })
})
