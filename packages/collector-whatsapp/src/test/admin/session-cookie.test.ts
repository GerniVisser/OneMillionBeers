import { describe, it, expect, beforeEach } from 'vitest'
import {
  SESSION_TTL_MS,
  issueSession,
  resetRevocations,
  revokeSession,
  verifySession,
} from '../../admin/session-cookie.js'

const SECRET = 's'.repeat(32)
const HASH = 'scrypt:32768:8:1:salt:key'
const NOW = 1_800_000_000_000

describe('admin session cookie', () => {
  beforeEach(() => resetRevocations())

  it('round-trips a session', () => {
    const { token } = issueSession('gerni', SECRET, HASH, NOW)
    const session = verifySession(token, SECRET, HASH, NOW + 1000)
    expect(session).toMatchObject({
      username: 'gerni',
      issuedAt: NOW,
      expiresAt: NOW + SESSION_TTL_MS,
    })
  })

  it('expires after 30 days', () => {
    const { token } = issueSession('gerni', SECRET, HASH, NOW)
    expect(verifySession(token, SECRET, HASH, NOW + SESSION_TTL_MS - 1)).not.toBeNull()
    expect(verifySession(token, SECRET, HASH, NOW + SESSION_TTL_MS)).toBeNull()
  })

  it('rejects a token signed with another secret', () => {
    const { token } = issueSession('gerni', 'o'.repeat(32), HASH, NOW)
    expect(verifySession(token, SECRET, HASH, NOW)).toBeNull()
  })

  it('is invalidated by a password change', () => {
    const { token } = issueSession('gerni', SECRET, HASH, NOW)
    expect(verifySession(token, SECRET, 'scrypt:32768:8:1:salt:other', NOW)).toBeNull()
  })

  it('rejects an edited payload, even with an extended expiry', () => {
    const { token } = issueSession('gerni', SECRET, HASH, NOW)
    const [data, sig] = token.split('.')
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString())
    payload.exp = NOW + 10 * SESSION_TTL_MS
    payload.u = 'someone-else'
    const forged = Buffer.from(JSON.stringify(payload)).toString('base64url') + '.' + sig
    expect(verifySession(forged, SECRET, HASH, NOW)).toBeNull()
  })

  it.each([undefined, '', 'nodot', 'a.b.c', '.sig', 'data.', '!!!.###'])(
    'rejects malformed token %j',
    (token) => {
      expect(verifySession(token, SECRET, HASH, NOW)).toBeNull()
    },
  )

  it('stops accepting a revoked (logged out) session', () => {
    const issued = issueSession('gerni', SECRET, HASH, NOW)
    const other = issueSession('gerni', SECRET, HASH, NOW)
    revokeSession(issued.session, NOW)
    expect(verifySession(issued.token, SECRET, HASH, NOW)).toBeNull()
    // Only that session: another device stays logged in.
    expect(verifySession(other.token, SECRET, HASH, NOW)).not.toBeNull()
  })
})
