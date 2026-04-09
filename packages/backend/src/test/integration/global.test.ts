import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type pg from 'pg'
import { buildApp } from '../../app.js'
import { startDb, stopDb, clearTables } from '../helpers.js'
import type { FastifyInstance } from 'fastify'
import {
  GlobalCountResponseSchema,
  GlobalStatsResponseSchema,
  GlobalActivityResponseSchema,
  GlobalHourlyResponseSchema,
  GlobalMonthlyResponseSchema,
  GlobalCountriesResponseSchema,
  PaginatedResponseSchema,
  FeedItemSchema,
  LeaderboardResponseSchema,
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

async function seedBeerLogWithCountry(senderId: string, ts = '2024-06-01T12:00:00.000Z') {
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

describe('GET /v1/global/count', () => {
  it('returns 0 when no beers', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/global/count' })
    expect(res.statusCode).toBe(200)
    const parsed = GlobalCountResponseSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.count).toBe(0)
  })

  it('returns correct count after inserts', async () => {
    await seedBeerLog()
    await seedBeerLog()
    await seedBeerLog()

    const res = await app.inject({ method: 'GET', url: '/v1/global/count' })
    expect(res.json().count).toBe(3)
  })
})

describe('GET /v1/global/feed', () => {
  it('returns paginated feed', async () => {
    await seedBeerLog('111111111', '2024-06-01T10:00:00.000Z')
    await seedBeerLog('222222222', '2024-06-01T11:00:00.000Z')

    const res = await app.inject({ method: 'GET', url: '/v1/global/feed?limit=10&offset=0' })
    expect(res.statusCode).toBe(200)

    const PaginatedFeedSchema = PaginatedResponseSchema(FeedItemSchema)
    const parsed = PaginatedFeedSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.items).toHaveLength(2)
    expect(parsed.data?.total).toBe(2)
  })

  it('respects limit and offset', async () => {
    for (let i = 0; i < 5; i++) {
      await seedBeerLog(`user${i}`, `2024-06-0${i + 1}T12:00:00.000Z`)
    }
    const res = await app.inject({ method: 'GET', url: '/v1/global/feed?limit=2&offset=1' })
    const body = res.json()
    expect(body.items).toHaveLength(2)
    expect(body.total).toBe(5)
    expect(body.offset).toBe(1)
  })
})

describe('GET /v1/global/leaderboard', () => {
  it('returns leaderboard matching LeaderboardResponseSchema', async () => {
    await seedBeerLog('111111111', '2024-06-01T10:00:00.000Z')
    await seedBeerLog('111111111', '2024-06-01T11:00:00.000Z')
    await seedBeerLog('222222222', '2024-06-01T12:00:00.000Z')

    const res = await app.inject({ method: 'GET', url: '/v1/global/leaderboard' })
    expect(res.statusCode).toBe(200)

    const parsed = LeaderboardResponseSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.entries[0].beerCount).toBe(2)
    expect(parsed.data?.entries[0].rank).toBe(1)
    expect(parsed.data?.entries[1].rank).toBe(2)
  })
})

describe('GET /v1/global/stream', () => {
  let sseApp: FastifyInstance
  let sseBaseUrl: string

  beforeAll(async () => {
    sseApp = await buildApp(pool, 'silent')
    sseBaseUrl = await sseApp.listen({ port: 0, host: '127.0.0.1' })
  }, 30000)

  afterAll(async () => {
    await sseApp.close()
  })

  it('returns SSE headers and initial count event', async () => {
    await clearTables(pool)
    // seed via the main app (inject) so we share the same DB
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      payload: {
        sourceGroupId: 'group-tg-sse',
        groupName: 'SSE Group',
        senderId: '333333333',
        timestamp: '2024-06-01T12:00:00.000Z',
        photoUrl: 'https://example.com/beer.jpg',
      },
    })

    const controller = new AbortController()
    const res = await fetch(`${sseBaseUrl}/v1/global/stream`, { signal: controller.signal })

    expect(res.headers.get('content-type')).toContain('text/event-stream')

    const reader = res.body!.getReader()
    const { value } = await reader.read()
    const text = new TextDecoder().decode(value)
    controller.abort()

    expect(text).toContain('"type":"count"')
    expect(text).toContain('"count":1')
  }, 30000)
})

describe('GET /v1/global/stats', () => {
  it('returns zeros and null peakDay when no beers', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/global/stats' })
    expect(res.statusCode).toBe(200)
    const parsed = GlobalStatsResponseSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.totalBeers).toBe(0)
    expect(parsed.data?.activeMemberCount).toBe(0)
    expect(parsed.data?.activeGroupCount).toBe(0)
    expect(parsed.data?.peakDay).toBeNull()
  })

  it('returns correct aggregates after seeding', async () => {
    await seedBeerLog('111111111', '2024-06-01T12:00:00.000Z')
    await seedBeerLog('222222222', '2024-06-01T13:00:00.000Z')
    // Second group via different sourceGroupId
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      payload: {
        sourceGroupId: 'group-tg-2',
        groupName: 'Second Group',
        senderId: '333333333',
        timestamp: '2024-06-01T14:00:00.000Z',
        photoUrl: 'https://example.com/beer.jpg',
      },
    })

    const res = await app.inject({ method: 'GET', url: '/v1/global/stats' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.totalBeers).toBe(3)
    expect(body.activeMemberCount).toBe(3)
    expect(body.activeGroupCount).toBe(2)
    expect(body.daysActive).toBe(1)
    expect(body.peakDay).not.toBeNull()
    expect(body.peakDay.count).toBe(3)
  })
})

describe('GET /v1/global/activity', () => {
  it('returns empty days when no beers', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/global/activity' })
    expect(res.statusCode).toBe(200)
    const parsed = GlobalActivityResponseSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.days).toHaveLength(0)
  })

  it('returns activity days after seeding within 365 days', async () => {
    const now = new Date()
    const d1 = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
    const d2 = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()
    await seedBeerLog('111111111', d1)
    await seedBeerLog('222222222', d1)
    await seedBeerLog('333333333', d2)

    const res = await app.inject({ method: 'GET', url: '/v1/global/activity' })
    const body = res.json()
    expect(body.days.length).toBeGreaterThanOrEqual(2)
    const totalCount = body.days.reduce((s: number, d: { count: number }) => s + d.count, 0)
    expect(totalCount).toBe(3)
  })
})

describe('GET /v1/global/hourly', () => {
  it('always returns 24 buckets even when no beers', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/global/hourly' })
    expect(res.statusCode).toBe(200)
    const parsed = GlobalHourlyResponseSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.hours).toHaveLength(24)
    expect(parsed.data?.hours.every((h) => h.count === 0)).toBe(true)
  })

  it('counts beer in the correct hour bucket', async () => {
    // Seed at a known hour (12:00 UTC)
    await seedBeerLog('111111111', '2024-06-01T12:30:00.000Z')
    await seedBeerLog('222222222', '2024-06-01T12:45:00.000Z')

    const res = await app.inject({ method: 'GET', url: '/v1/global/hourly' })
    const body = res.json()
    const hourBucket = body.hours.find((h: { hour: number }) => h.hour === 12)
    expect(hourBucket?.count).toBe(2)
  })
})

describe('GET /v1/global/monthly', () => {
  it('returns empty months when no beers', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/global/monthly' })
    expect(res.statusCode).toBe(200)
    const parsed = GlobalMonthlyResponseSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.months).toHaveLength(0)
  })

  it('aggregates beers by month', async () => {
    await seedBeerLog('111111111', '2024-05-15T12:00:00.000Z')
    await seedBeerLog('222222222', '2024-05-20T12:00:00.000Z')
    await seedBeerLog('333333333', '2024-06-10T12:00:00.000Z')

    const res = await app.inject({ method: 'GET', url: '/v1/global/monthly' })
    const body = res.json()
    expect(body.months.length).toBeGreaterThanOrEqual(2)
    const mayBucket = body.months.find((m: { month: string }) => m.month === '2024-05')
    const juneBucket = body.months.find((m: { month: string }) => m.month === '2024-06')
    expect(mayBucket?.count).toBe(2)
    expect(juneBucket?.count).toBe(1)
  })
})

describe('GET /v1/global/countries', () => {
  it('returns empty array when no beers', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/global/countries' })
    expect(res.statusCode).toBe(200)
    const parsed = GlobalCountriesResponseSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data).toHaveLength(0)
  })

  it('aggregates beer and user counts by country', async () => {
    await seedBeerLogWithCountry('wa:27831234567') // ZA
    await seedBeerLogWithCountry('wa:27831234567') // ZA — same user, second log
    await seedBeerLogWithCountry('wa:4915123456789') // DE

    const res = await app.inject({ method: 'GET', url: '/v1/global/countries' })
    const body = res.json()
    const za = body.find((c: { countryCode: string }) => c.countryCode === 'ZA')
    const de = body.find((c: { countryCode: string }) => c.countryCode === 'DE')
    expect(za?.beerCount).toBe(2)
    expect(za?.userCount).toBe(1) // one user logged twice
    expect(de?.beerCount).toBe(1)
    expect(de?.userCount).toBe(1)
  })

  it('excludes users with null country_code', async () => {
    await seedBeerLog() // plain senderId — extractCountryCode returns null
    const res = await app.inject({ method: 'GET', url: '/v1/global/countries' })
    expect(res.json()).toHaveLength(0)
  })
})
