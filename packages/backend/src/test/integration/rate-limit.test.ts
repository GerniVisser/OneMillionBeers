import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type pg from 'pg'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../app.js'
import { startDb, stopDb } from '../helpers.js'

let pool: pg.Pool
let app: FastifyInstance

// The default bucket configured in buildApp.
const MAX = 100

beforeAll(async () => {
  pool = await startDb()
}, 60000)

// The limiter keeps its counters in process memory for a full minute, so each test
// gets its own app rather than inheriting whatever the previous one spent.
beforeEach(async () => {
  await app?.close()
  app = await buildApp(pool, 'silent')
  await app.ready()
})

afterAll(async () => {
  await app?.close()
  await stopDb()
})

/** One public GET, carrying the X-Forwarded-For chain nginx would have built. */
function get(forwardedFor: string) {
  return app.inject({
    method: 'GET',
    url: '/v1/global/count',
    headers: { 'x-forwarded-for': forwardedFor },
  })
}

async function exhaust(forwardedFor: string) {
  for (let i = 0; i < MAX; i++) {
    const res = await get(forwardedFor)
    expect(res.statusCode).toBe(200)
  }
}

describe('rate limiting keys on the forwarded client address', () => {
  it('spends one client budget without touching another', async () => {
    await exhaust('203.0.113.1')
    expect((await get('203.0.113.1')).statusCode).toBe(429)

    // The whole point: a second client still has its full allowance.
    const other = await get('198.51.100.7')
    expect(other.statusCode).toBe(200)
    expect(String(other.headers['x-ratelimit-remaining'])).toBe(String(MAX - 1))
  })

  it('ignores an X-Forwarded-For prefix the client made up', async () => {
    // nginx appends the peer address to whatever the client sent, so the entry
    // nginx added is the last one and everything before it is attacker-controlled.
    await exhaust('203.0.113.9')

    const spoofed = await get('1.2.3.4, 203.0.113.9')
    expect(spoofed.statusCode).toBe(429)
  })

  it('does not let one client exhaust the budget for everyone', async () => {
    await exhaust('203.0.113.20')

    for (const ip of ['198.51.100.1', '198.51.100.2', '198.51.100.3']) {
      expect((await get(ip)).statusCode).toBe(200)
    }
  })
})
