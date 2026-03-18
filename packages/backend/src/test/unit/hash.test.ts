import { describe, it, expect } from 'vitest'
import { hashIdentity } from '../../lib/hash.js'

describe('hashIdentity', () => {
  it('returns a 64-char hex string', () => {
    const result = hashIdentity('123456789')
    expect(result).toHaveLength(64)
    expect(result).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic', () => {
    expect(hashIdentity('123456789')).toBe(hashIdentity('123456789'))
  })

  it('produces different hashes for different inputs', () => {
    expect(hashIdentity('123456789')).not.toBe(hashIdentity('987654321'))
  })
})
