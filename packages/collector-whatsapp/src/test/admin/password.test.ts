import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '../../admin/password.js'

// Minimum accepted cost, to keep the suite fast; production uses N=2^15.
const FAST = { N: 2 ** 14, r: 8, p: 1 }

describe('admin password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple', FAST)
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true)
    expect(await verifyPassword('correct horse battery stapler', hash)).toBe(false)
    expect(await verifyPassword('', hash)).toBe(false)
  })

  it('uses a format that survives Docker Compose env interpolation', async () => {
    const hash = await hashPassword('pw-with-$dollar', FAST)
    expect(hash).not.toContain('$')
    expect(hash).toMatch(/^scrypt:16384:8:1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/)
  })

  it('defaults to N=2^15', async () => {
    expect(await hashPassword('x')).toMatch(/^scrypt:32768:8:1:/)
  })

  it('salts every hash differently', async () => {
    const [a, b] = await Promise.all([hashPassword('same', FAST), hashPassword('same', FAST)])
    expect(a).not.toBe(b)
    expect(await verifyPassword('same', a)).toBe(true)
    expect(await verifyPassword('same', b)).toBe(true)
  })

  it('rejects a tampered key', async () => {
    const hash = await hashPassword('pw', FAST)
    const parts = hash.split(':')
    const key = Buffer.from(parts[5], 'base64url')
    key[0] ^= 1
    parts[5] = key.toString('base64url')
    expect(await verifyPassword('pw', parts.join(':'))).toBe(false)
  })

  it.each([
    ['not a hash', 'plaintext'],
    ['wrong scheme', 'bcrypt:16384:8:1:c2FsdHNhbHRzYWx0c2FsdA:abc'],
    ['missing field', 'scrypt:16384:8:1:c2FsdHNhbHRzYWx0c2FsdA'],
    ['cost too low', 'scrypt:1024:8:1:c2FsdHNhbHRzYWx0c2FsdA:' + 'A'.repeat(43)],
    ['cost too high (CPU pinning)', 'scrypt:4194304:8:1:c2FsdHNhbHRzYWx0c2FsdA:' + 'A'.repeat(43)],
    ['short salt', 'scrypt:16384:8:1:c2FsdA:' + 'A'.repeat(43)],
    ['wrong key length', 'scrypt:16384:8:1:c2FsdHNhbHRzYWx0c2FsdA:AAAA'],
  ])('returns false for a malformed hash: %s', async (_label, encoded) => {
    expect(await verifyPassword('pw', encoded)).toBe(false)
  })
})
