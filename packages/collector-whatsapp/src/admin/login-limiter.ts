// Failed-login throttling for the admin page, in memory (a collector restart
// clears it; nginx adds its own per-IP request rate limit in front).
//
// - Per IP: 5 failures within 15 minutes locks that IP out for 15 minutes.
// - Overall: 20 failures within 15 minutes locks every new login for 15
//   minutes, against guessing spread across many addresses. That lets an
//   attacker keep the admin from logging in afresh, but an existing session
//   cookie keeps working, so it cannot lock out a device already logged in.

export const WINDOW_MS = 15 * 60 * 1000
export const MAX_PER_IP = 5
export const MAX_GLOBAL = 20

const failuresByIp = new Map<string, number[]>()
let globalFailures: number[] = []

const recent = (times: number[], now: number) => times.filter((t) => now - t < WINDOW_MS)

export interface LimitCheck {
  allowed: boolean
  retryAfterMs: number
}

function lockout(times: number[], max: number, now: number): number {
  if (times.length < max) return 0
  // Locked until the oldest counted failure leaves the window.
  return times[times.length - max] + WINDOW_MS - now
}

export function checkLogin(ip: string, now = Date.now()): LimitCheck {
  const ipTimes = recent(failuresByIp.get(ip) ?? [], now)
  globalFailures = recent(globalFailures, now)
  const wait = Math.max(lockout(ipTimes, MAX_PER_IP, now), lockout(globalFailures, MAX_GLOBAL, now))
  return { allowed: wait <= 0, retryAfterMs: Math.max(0, wait) }
}

export function recordFailure(ip: string, now = Date.now()): void {
  failuresByIp.set(ip, [...recent(failuresByIp.get(ip) ?? [], now), now])
  globalFailures = [...recent(globalFailures, now), now]
  // Keep the map from growing without bound under a spray of addresses.
  if (failuresByIp.size > 10_000) {
    for (const [key, times] of failuresByIp) {
      if (recent(times, now).length === 0) failuresByIp.delete(key)
    }
  }
}

export function recordSuccess(ip: string): void {
  failuresByIp.delete(ip)
}

export function resetLoginLimiter(): void {
  failuresByIp.clear()
  globalFailures = []
}
