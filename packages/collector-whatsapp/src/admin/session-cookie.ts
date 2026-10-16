import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// Stateless admin session: `<payload>.<signature>`, both base64url, where the
// payload is {u: username, iat, exp, jti} and the signature an HMAC-SHA256.
// Stateless so a collector restart or deploy does not log the admin out.
//
// The signing key mixes in the password hash, so changing the password
// invalidates every session; rotating ADMIN_SESSION_SECRET does the same.
// Logout revokes the token's jti in memory until it would have expired anyway.

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface AdminSession {
  username: string
  issuedAt: number
  expiresAt: number
  id: string
}

interface Payload {
  u: string
  iat: number
  exp: number
  jti: string
}

const revoked = new Map<string, number>() // jti -> exp

function signingKey(secret: string, passwordHash: string): Buffer {
  return createHmac('sha256', secret).update(`omb-admin-session:${passwordHash}`).digest()
}

function sign(data: string, key: Buffer): string {
  return createHmac('sha256', key).update(data).digest('base64url')
}

export function issueSession(
  username: string,
  secret: string,
  passwordHash: string,
  now = Date.now(),
): { token: string; session: AdminSession } {
  const payload: Payload = {
    u: username,
    iat: now,
    exp: now + SESSION_TTL_MS,
    jti: randomBytes(12).toString('base64url'),
  }
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const token = `${data}.${sign(data, signingKey(secret, passwordHash))}`
  return {
    token,
    session: {
      username: payload.u,
      issuedAt: payload.iat,
      expiresAt: payload.exp,
      id: payload.jti,
    },
  }
}

export function verifySession(
  token: string | undefined,
  secret: string,
  passwordHash: string,
  now = Date.now(),
): AdminSession | null {
  if (!token) return null
  const dot = token.indexOf('.')
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return null
  const data = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1), 'base64url')
  const expected = Buffer.from(sign(data, signingKey(secret, passwordHash)), 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  let payload: Payload
  try {
    payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as Payload
  } catch {
    return null
  }
  if (typeof payload.u !== 'string' || typeof payload.exp !== 'number') return null
  if (payload.exp <= now || revoked.has(payload.jti)) return null
  return { username: payload.u, issuedAt: payload.iat, expiresAt: payload.exp, id: payload.jti }
}

export function revokeSession(session: AdminSession, now = Date.now()): void {
  for (const [jti, exp] of revoked) if (exp <= now) revoked.delete(jti)
  revoked.set(session.id, session.expiresAt)
}

export function resetRevocations(): void {
  revoked.clear()
}
