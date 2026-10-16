import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'

// Admin password hashes, stored in SSM as ADMIN_PASSWORD_HASH:
//
//   scrypt:<N>:<r>:<p>:<salt>:<key>      (salt and key base64url, no padding)
//
// Colons and base64url only: the deploy writes SSM values into an env file that
// Docker Compose interpolates, so a `$` in the value would be mangled.

const KEY_LENGTH = 32
// N=2^15, r=8 costs ~32 MiB and ~50–100 ms per check: slow enough to make
// offline guessing expensive, cheap enough for a single admin logging in.
const DEFAULT_PARAMS = { N: 2 ** 15, r: 8, p: 1 }

function scryptAsync(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, opts, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

// scrypt needs 128·N·r bytes; Node's default cap (32 MiB) is exactly at the
// edge for the defaults, so allow headroom.
const maxmem = (N: number, r: number) => 256 * N * r

export async function hashPassword(password: string, params = DEFAULT_PARAMS): Promise<string> {
  const salt = randomBytes(16)
  const { N, r, p } = params
  const key = await scryptAsync(password, salt, { N, r, p, maxmem: maxmem(N, r) })
  return ['scrypt', N, r, p, salt.toString('base64url'), key.toString('base64url')].join(':')
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split(':')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [N, r, p] = parts.slice(1, 4).map(Number)
  // Refuse absurd parameters rather than letting a bad hash pin the CPU.
  if (![N, r, p].every(Number.isInteger) || N < 2 ** 14 || N > 2 ** 20 || r > 32 || p > 16) {
    return false
  }
  const salt = Buffer.from(parts[4], 'base64url')
  const expected = Buffer.from(parts[5], 'base64url')
  if (salt.length < 16 || expected.length !== KEY_LENGTH) return false
  const actual = await scryptAsync(password, salt, { N, r, p, maxmem: maxmem(N, r) })
  return timingSafeEqual(actual, expected)
}
