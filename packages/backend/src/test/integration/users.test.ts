import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type pg from 'pg'
import { buildApp } from '../../app.js'
import { startDb, stopDb, clearTables } from '../helpers.js'
import type { FastifyInstance } from 'fastify'
import {
  UserProfileResponseSchema,
  UserStatsResponseSchema,
  UserSearchResponseSchema,
  UserActivityResponseSchema,
  UserHourlyResponseSchema,
  UserMonthlyResponseSchema,
  FeedItemSchema,
  PaginatedResponseSchema,
} from '@omb/shared'

let pool: pg.Pool
let app: FastifyInstance

beforeAll(async () => {
  pool = await startDb()
  app = await buildApp(pool, 'silent')
  await app.ready()
}, 60000)

afterAll(async () => {
  await app.close()
  await stopDb()
})

beforeEach(async () => {
  await clearTables(pool)
})

async function seedBeerLog(senderId = '123456789', ts = '2024-06-01T12:00:00.000Z') {
  return app.inject({
    method: 'POST',
    url: '/v1/internal/beer-log',
    payload: {
      sourceGroupId: 'group-tg-1',
      groupName: 'Test Group',
      senderId,
      timestamp: ts,
      photoUrl: 'https://example.com/beer.jpg',
    },
  })
}

async function getUserSlugAndId(): Promise<{ slug: string; id: string }> {
  const { rows } = await pool.query('SELECT id, slug FROM users LIMIT 1')
  return { id: rows[0].id, slug: rows[0].slug }
}

describe('GET /v1/users/:userId', () => {
  it('returns 404 for unknown user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/users/no-such-user',
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns user profile without internal fields', async () => {
    await seedBeerLog('wa:27831234567')
    const { slug } = await getUserSlugAndId()

    const res = await app.inject({ method: 'GET', url: `/v1/users/${slug}` })
    expect(res.statusCode).toBe(200)

    const body = res.json()
    expect(body.identityHash).toBeUndefined()
    expect(body.phoneNumber).toBeUndefined()
    expect(body.pushName).toBeUndefined()
    expect(body.active).toBeUndefined()
    expect(body.public).toBeUndefined()

    const parsed = UserProfileResponseSchema.safeParse(body)
    expect(parsed.success).toBe(true)
  })
})

describe('GET /v1/users/search', () => {
  it('returns 400 when q is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/users/search' })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when q is fewer than 4 chars', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/users/search?q=abc' })
    expect(res.statusCode).toBe(400)
  })

  it('returns empty results for a query that matches nothing', async () => {
    await seedBeerLog('wa:27831234567')
    const res = await app.inject({ method: 'GET', url: '/v1/users/search?q=zzzznotaname' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.results).toEqual([])
  })

  it('finds a user by phone number with + prefix', async () => {
    await seedBeerLog('wa:27831234567')
    const res = await app.inject({
      method: 'GET',
      url: '/v1/users/search?q=' + encodeURIComponent('+27831234567'),
    })
    expect(res.statusCode).toBe(200)
    const parsed = UserSearchResponseSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.results.length).toBe(1)
  })

  it('does NOT treat bare digits as a phone query (routes to name search instead)', async () => {
    await seedBeerLog('wa:27831234567')
    const res = await app.inject({ method: 'GET', url: '/v1/users/search?q=27831234567' })
    expect(res.statusCode).toBe(200)
    // Bare digits have no pseudo-name match → empty results, not a phone lookup
    expect(res.json().results).toEqual([])
  })

  it('finds a user by phone number with + and spaces stripped', async () => {
    await seedBeerLog('wa:27831234567')
    const res = await app.inject({
      method: 'GET',
      url: '/v1/users/search?q=' + encodeURIComponent('+27 83 123 4567'),
    })
    expect(res.statusCode).toBe(200)
    const parsed = UserSearchResponseSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.results.length).toBe(1)
  })

  it('never exposes phoneNumber, identityHash, or pushName in results', async () => {
    await seedBeerLog('wa:27831234567')
    const res = await app.inject({
      method: 'GET',
      url: '/v1/users/search?q=' + encodeURIComponent('+27831234567'),
    })
    const body = res.json()
    expect(body.results.length).toBeGreaterThan(0)
    for (const result of body.results) {
      expect(result.phoneNumber).toBeUndefined()
      expect(result.identityHash).toBeUndefined()
      expect(result.pushName).toBeUndefined()
    }
  })

  it('caps results at the requested limit', async () => {
    await seedBeerLog('wa:27831234567')
    await seedBeerLog('wa:27831234568')
    const res = await app.inject({
      method: 'GET',
      url: '/v1/users/search?q=' + encodeURIComponent('+27831234567') + '&limit=1',
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.results.length).toBeLessThanOrEqual(1)
  })

  it('matches pseudo-name with a fuzzy query (trigram)', async () => {
    await seedBeerLog('wa:27831234567')
    const { rows } = await pool.query<{ pseudo_name: string }>(
      'SELECT pseudo_name FROM users LIMIT 1',
    )
    const realName = rows[0]?.pseudo_name
    if (!realName || realName.length < 5) return // skip if name too short to typo-test

    // Introduce a single-char typo in the middle of the name
    const typo = realName.slice(0, 3) + realName.slice(4)
    const res = await app.inject({
      method: 'GET',
      url: '/v1/users/search?q=' + encodeURIComponent(typo),
    })
    expect(res.statusCode).toBe(200)
    const parsed = UserSearchResponseSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    // The real user should appear in results (fuzzy match)
    const found = parsed.data?.results.some((r) => r.pseudoName === realName)
    expect(found).toBe(true)
  })
})

describe('GET /v1/users/:userId/stats', () => {
  it('returns 404 for unknown user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/users/no-such-user/stats',
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns stats matching UserStatsResponseSchema', async () => {
    await seedBeerLog('123456789', '2024-06-01T12:00:00.000Z')
    await seedBeerLog('123456789', '2024-06-02T12:00:00.000Z')
    await seedBeerLog('123456789', '2024-06-03T12:00:00.000Z')
    const { slug, id } = await getUserSlugAndId()

    const res = await app.inject({ method: 'GET', url: `/v1/users/${slug}/stats` })
    expect(res.statusCode).toBe(200)

    const parsed = UserStatsResponseSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.totalBeers).toBe(3)
    expect(parsed.data?.userId).toBe(id)
  })
})

describe('GET /v1/users/:userId/feed', () => {
  it('returns 404 for unknown user', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/users/no-such-user/feed' })
    expect(res.statusCode).toBe(404)
  })

  it('returns paginated feed matching FeedItem schema', async () => {
    await seedBeerLog('feed-user-1', '2024-06-01T12:00:00.000Z')
    await seedBeerLog('feed-user-1', '2024-06-02T12:00:00.000Z')
    const { slug } = await getUserSlugAndId()

    const res = await app.inject({ method: 'GET', url: `/v1/users/${slug}/feed?limit=20&offset=0` })
    expect(res.statusCode).toBe(200)

    const parsed = PaginatedResponseSchema(FeedItemSchema).safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.total).toBe(2)
    expect(parsed.data?.items).toHaveLength(2)
  })

  it('only returns feed items for the requested user', async () => {
    await seedBeerLog('user-a', '2024-06-01T12:00:00.000Z')
    await seedBeerLog('user-b', '2024-06-02T12:00:00.000Z')
    const { slug } = await getUserSlugAndId()

    const res = await app.inject({ method: 'GET', url: `/v1/users/${slug}/feed` })
    expect(res.statusCode).toBe(200)
    expect(res.json().total).toBe(1)
  })
})

describe('GET /v1/users/:userId/activity', () => {
  it('returns 404 for unknown user', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/users/no-such-user/activity' })
    expect(res.statusCode).toBe(404)
  })

  it('returns activity matching UserActivityResponseSchema', async () => {
    await seedBeerLog('act-user', '2024-06-01T12:00:00.000Z')
    const { slug } = await getUserSlugAndId()

    const res = await app.inject({ method: 'GET', url: `/v1/users/${slug}/activity` })
    expect(res.statusCode).toBe(200)

    const parsed = UserActivityResponseSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
  })
})

describe('GET /v1/users/:userId/hourly', () => {
  it('returns 404 for unknown user', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/users/no-such-user/hourly' })
    expect(res.statusCode).toBe(404)
  })

  it('returns 24 hour buckets matching UserHourlyResponseSchema', async () => {
    await seedBeerLog('hourly-user', '2024-06-01T14:00:00.000Z')
    const { slug } = await getUserSlugAndId()

    const res = await app.inject({ method: 'GET', url: `/v1/users/${slug}/hourly` })
    expect(res.statusCode).toBe(200)

    const parsed = UserHourlyResponseSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.hours).toHaveLength(24)
  })
})

describe('GET /v1/users/:userId/monthly', () => {
  it('returns 404 for unknown user', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/users/no-such-user/monthly' })
    expect(res.statusCode).toBe(404)
  })

  it('returns monthly buckets matching UserMonthlyResponseSchema', async () => {
    await seedBeerLog('monthly-user', '2024-06-01T12:00:00.000Z')
    const { slug } = await getUserSlugAndId()

    const res = await app.inject({ method: 'GET', url: `/v1/users/${slug}/monthly` })
    expect(res.statusCode).toBe(200)

    const parsed = UserMonthlyResponseSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.months.length).toBeGreaterThanOrEqual(1)
  })
})
