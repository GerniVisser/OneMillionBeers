import { describe, it, expect, beforeEach } from 'vitest'
import {
  MAX_GLOBAL,
  MAX_PER_IP,
  WINDOW_MS,
  checkLogin,
  recordFailure,
  recordSuccess,
  resetLoginLimiter,
} from '../../admin/login-limiter.js'

const T = 1_800_000_000_000

describe('admin login limiter', () => {
  beforeEach(() => resetLoginLimiter())

  it(`locks an IP after ${MAX_PER_IP} failures`, () => {
    for (let i = 0; i < MAX_PER_IP - 1; i++) recordFailure('1.1.1.1', T + i)
    expect(checkLogin('1.1.1.1', T + 10).allowed).toBe(true)
    recordFailure('1.1.1.1', T + 10)
    const check = checkLogin('1.1.1.1', T + 11)
    expect(check.allowed).toBe(false)
    expect(check.retryAfterMs).toBe(WINDOW_MS - 11)
  })

  it('does not lock other IPs', () => {
    for (let i = 0; i < MAX_PER_IP; i++) recordFailure('1.1.1.1', T)
    expect(checkLogin('2.2.2.2', T).allowed).toBe(true)
  })

  it('unlocks once the failures leave the 15-minute window', () => {
    for (let i = 0; i < MAX_PER_IP; i++) recordFailure('1.1.1.1', T)
    expect(checkLogin('1.1.1.1', T + WINDOW_MS - 1).allowed).toBe(false)
    expect(checkLogin('1.1.1.1', T + WINDOW_MS).allowed).toBe(true)
  })

  it('clears an IP on successful login', () => {
    for (let i = 0; i < MAX_PER_IP - 1; i++) recordFailure('1.1.1.1', T)
    recordSuccess('1.1.1.1')
    recordFailure('1.1.1.1', T)
    expect(checkLogin('1.1.1.1', T).allowed).toBe(true)
  })

  it(`locks every login after ${MAX_GLOBAL} failures spread across IPs`, () => {
    for (let i = 0; i < MAX_GLOBAL; i++) recordFailure(`10.0.0.${i}`, T)
    expect(checkLogin('9.9.9.9', T + 1).allowed).toBe(false)
    expect(checkLogin('9.9.9.9', T + WINDOW_MS).allowed).toBe(true)
  })
})
