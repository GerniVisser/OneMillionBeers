import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type pg from 'pg'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../app.js'
import { startDb, stopDb, clearTables, internalHeaders, INTERNAL_TEST_TOKEN } from '../helpers.js'

let pool: pg.Pool
let app: FastifyInstance

beforeAll(async () => {
  pool = await startDb()
  app = await buildApp(pool, 'silent', 'test', INTERNAL_TEST_TOKEN)
  await app.ready()
}, 60000)

afterAll(async () => {
  await app.close()
  await stopDb()
})

beforeEach(async () => {
  await clearTables(pool)
})

const validPayload = {
  sourceGroupId: 'wa:120363000000000000@g.us',
  groupName: 'Test Group',
  senderId: 'wa:27831234567',
  timestamp: '2026-06-01T12:00:00.000Z',
  photoUrl: 'https://example.com/beer.jpg',
}

async function beerLogCount(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM beer_logs',
  )
  return parseInt(rows[0].count, 10)
}

describe('/v1/internal/* authentication', () => {
  const rejected: Array<[string, Record<string, string> | undefined]> = [
    ['no Authorization header', undefined],
    ['a wrong token', { authorization: `Bearer not-the-right-token-but-long-enough-x` }],
    ['the token without the Bearer scheme', { authorization: INTERNAL_TEST_TOKEN }],
    ['an empty bearer token', { authorization: 'Bearer ' }],
    ['a token that is a prefix of the real one', { authorization: 'Bearer test-internal-token' }],
  ]

  for (const [label, headers] of rejected) {
    it(`rejects POST /v1/internal/beer-log with ${label}`, async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/internal/beer-log',
        ...(headers ? { headers } : {}),
        payload: validPayload,
      })
      expect(res.statusCode).toBe(401)
      expect(await beerLogCount()).toBe(0)
    })
  }

  it('rejects DELETE /v1/internal/beer-log/by-message/:id without a token', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/internal/beer-log/by-message/some-message-id',
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejects PUT /v1/internal/groups/:sourceGroupId without a token', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/internal/groups/wa:120363000000000000@g.us',
      payload: { name: 'Renamed By Stranger', avatarUrl: null },
    })
    expect(res.statusCode).toBe(401)

    const { rows } = await pool.query('SELECT 1 FROM groups')
    expect(rows).toHaveLength(0)
  })

  it('rejects before validating the body, so the schema is not an oracle', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/internal/beer-log', payload: {} })
    expect(res.statusCode).toBe(401)
    expect(res.body).not.toContain('sourceGroupId')
  })

  it('accepts a correct token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: validPayload,
    })
    expect(res.statusCode).toBe(201)
    expect(await beerLogCount()).toBe(1)
  })

  it('leaves public routes reachable without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/global/count' })
    expect(res.statusCode).toBe(200)
  })
})

describe('/v1/internal/* with an unconfigured token', () => {
  let openApp: FastifyInstance

  beforeAll(async () => {
    // An empty token must fail closed — a half-configured deploy should reject
    // everything rather than silently accept anonymous writes.
    openApp = await buildApp(pool, 'silent', 'test', '')
    await openApp.ready()
  })

  afterAll(async () => {
    await openApp.close()
  })

  it('rejects every internal request, including one with a plausible token', async () => {
    const withHeader = await openApp.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: validPayload,
    })
    expect(withHeader.statusCode).toBe(401)

    const withoutHeader = await openApp.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      payload: validPayload,
    })
    expect(withoutHeader.statusCode).toBe(401)

    expect(await beerLogCount()).toBe(0)
  })
})
