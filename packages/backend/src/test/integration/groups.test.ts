import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type pg from 'pg'
import { buildApp } from '../../app.js'
import { startDb, stopDb, clearTables } from '../helpers.js'
import type { FastifyInstance } from 'fastify'
import {
  GroupProfileResponseSchema,
  GroupListItemSchema,
  PaginatedResponseSchema,
  FeedItemSchema,
  LeaderboardResponseSchema,
  GroupStatsResponseSchema,
  GroupActivityResponseSchema,
  GroupHourlyResponseSchema,
  GroupMonthlyResponseSchema,
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

async function getGroupSlug(): Promise<string> {
  const { rows } = await pool.query('SELECT slug FROM groups LIMIT 1')
  return rows[0].slug
}

describe('GET /v1/groups', () => {
  it('returns empty items when no groups exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/groups' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.items).toHaveLength(0)
    expect(body.total).toBe(0)
  })

  it('returns groups with correct memberCount', async () => {
    await seedBeerLog('+15551111111')
    await seedBeerLog('+15552222222')

    const res = await app.inject({ method: 'GET', url: '/v1/groups' })
    expect(res.statusCode).toBe(200)

    const GroupListSchema = PaginatedResponseSchema(GroupListItemSchema)
    const parsed = GroupListSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.items).toHaveLength(1)
    expect(parsed.data?.items[0].memberCount).toBe(2)
    expect(parsed.data?.total).toBe(1)
  })

  it('filters by name with search param (case-insensitive)', async () => {
    await seedBeerLog('111')
    // Seed a second group
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      payload: {
        sourceGroupId: 'group-other',
        groupName: 'Other Crew',
        senderId: '222',
        timestamp: '2024-06-01T12:00:00.000Z',
        photoUrl: 'https://example.com/beer.jpg',
      },
    })

    const res = await app.inject({ method: 'GET', url: '/v1/groups?search=test' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].name).toBe('Test Group')
    expect(body.total).toBe(1)
  })

  it('paginates results with limit and offset', async () => {
    // Seed two different groups
    await seedBeerLog('aaa')
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      payload: {
        sourceGroupId: 'group-b',
        groupName: 'Beta Group',
        senderId: 'bbb',
        timestamp: '2024-06-01T12:00:00.000Z',
        photoUrl: 'https://example.com/beer.jpg',
      },
    })

    const page1 = await app.inject({ method: 'GET', url: '/v1/groups?limit=1&offset=0' })
    expect(page1.statusCode).toBe(200)
    expect(page1.json().items).toHaveLength(1)
    expect(page1.json().total).toBe(2)

    const page2 = await app.inject({ method: 'GET', url: '/v1/groups?limit=1&offset=1' })
    expect(page2.statusCode).toBe(200)
    expect(page2.json().items).toHaveLength(1)
    // The two pages should return different groups
    expect(page1.json().items[0].slug).not.toBe(page2.json().items[0].slug)
  })

  it('returns 400 for invalid query params', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/groups?limit=abc' })
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /v1/groups/:groupId', () => {
  it('returns 404 for unknown group', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/groups/no-such-group',
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns group profile with totalBeers', async () => {
    await seedBeerLog()
    await seedBeerLog()
    const slug = await getGroupSlug()

    const res = await app.inject({ method: 'GET', url: `/v1/groups/${slug}` })
    expect(res.statusCode).toBe(200)

    const parsed = GroupProfileResponseSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.totalBeers).toBe(2)
    expect(parsed.data?.name).toBe('Test Group')
  })
})

describe('GET /v1/groups/:groupId/feed', () => {
  it('returns paginated feed matching FeedItemSchema', async () => {
    await seedBeerLog('+15551234567', '2024-06-01T10:00:00.000Z')
    await seedBeerLog('+15559999999', '2024-06-01T11:00:00.000Z')
    const slug = await getGroupSlug()

    const res = await app.inject({
      method: 'GET',
      url: `/v1/groups/${slug}/feed?limit=10&offset=0`,
    })
    expect(res.statusCode).toBe(200)

    const PaginatedFeedSchema = PaginatedResponseSchema(FeedItemSchema)
    const parsed = PaginatedFeedSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.items).toHaveLength(2)
    expect(parsed.data?.total).toBe(2)
  })

  it('returns 404 for unknown group', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/groups/no-such-group/feed',
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('GET /v1/groups/:groupId/leaderboard', () => {
  it('returns leaderboard matching LeaderboardResponseSchema', async () => {
    await seedBeerLog('+15551234567', '2024-06-01T10:00:00.000Z')
    await seedBeerLog('+15551234567', '2024-06-01T11:00:00.000Z')
    await seedBeerLog('+15559999999', '2024-06-01T12:00:00.000Z')
    const slug = await getGroupSlug()

    const res = await app.inject({ method: 'GET', url: `/v1/groups/${slug}/leaderboard` })
    expect(res.statusCode).toBe(200)

    const parsed = LeaderboardResponseSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.entries[0].beerCount).toBe(2)
    expect(parsed.data?.entries[0].rank).toBe(1)
  })
})

describe('GET /v1/groups/:groupId/stats', () => {
  it('returns 404 for unknown group', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/groups/no-such-group/stats' })
    expect(res.statusCode).toBe(404)
  })

  it('returns zero stats for a group with no beers', async () => {
    await seedBeerLog()
    const slug = await getGroupSlug()
    await pool.query('DELETE FROM beer_logs')

    const res = await app.inject({ method: 'GET', url: `/v1/groups/${slug}/stats` })
    expect(res.statusCode).toBe(200)

    const parsed = GroupStatsResponseSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.totalBeers).toBe(0)
    expect(parsed.data?.activeMemberCount).toBe(0)
    expect(parsed.data?.daysActive).toBe(0)
    expect(parsed.data?.peakDay).toBeNull()
  })

  it('returns correct stats for seeded beer logs', async () => {
    await seedBeerLog('+15551111111', '2024-06-01T10:00:00.000Z')
    await seedBeerLog('+15551111111', '2024-06-01T11:00:00.000Z')
    await seedBeerLog('+15552222222', '2024-06-01T12:00:00.000Z')
    const slug = await getGroupSlug()

    const res = await app.inject({ method: 'GET', url: `/v1/groups/${slug}/stats` })
    expect(res.statusCode).toBe(200)

    const parsed = GroupStatsResponseSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.totalBeers).toBe(3)
    expect(parsed.data?.activeMemberCount).toBe(2)
    expect(parsed.data?.daysActive).toBe(1)
    expect(parsed.data?.peakDay?.count).toBe(3)
  })
})

describe('GET /v1/groups/:groupId/activity', () => {
  it('returns 404 for unknown group', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/groups/no-such-group/activity' })
    expect(res.statusCode).toBe(404)
  })

  it('returns empty days for group with no beers', async () => {
    await seedBeerLog()
    const slug = await getGroupSlug()
    await pool.query('DELETE FROM beer_logs')

    const res = await app.inject({ method: 'GET', url: `/v1/groups/${slug}/activity` })
    expect(res.statusCode).toBe(200)

    const parsed = GroupActivityResponseSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.days).toHaveLength(0)
  })

  it('aggregates daily counts correctly', async () => {
    // Use recent dates so they fall within the 365-day window
    const day1 = new Date()
    day1.setDate(day1.getDate() - 10)
    const day2 = new Date()
    day2.setDate(day2.getDate() - 9)
    const ts1a = new Date(day1)
    ts1a.setUTCHours(10, 0, 0, 0)
    const ts1b = new Date(day1)
    ts1b.setUTCHours(14, 0, 0, 0)
    const ts2 = new Date(day2)
    ts2.setUTCHours(9, 0, 0, 0)
    const dateStr1 = day1.toISOString().slice(0, 10)
    const dateStr2 = day2.toISOString().slice(0, 10)

    await seedBeerLog('+15551111111', ts1a.toISOString())
    await seedBeerLog('+15552222222', ts1b.toISOString())
    await seedBeerLog('+15551111111', ts2.toISOString())
    const slug = await getGroupSlug()

    const res = await app.inject({ method: 'GET', url: `/v1/groups/${slug}/activity` })
    expect(res.statusCode).toBe(200)

    const parsed = GroupActivityResponseSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    const days = parsed.data!.days
    expect(days.find((d) => d.date === dateStr1)?.count).toBe(2)
    expect(days.find((d) => d.date === dateStr2)?.count).toBe(1)
  })
})

describe('GET /v1/groups/:groupId/hourly', () => {
  it('returns 404 for unknown group', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/groups/no-such-group/hourly' })
    expect(res.statusCode).toBe(404)
  })

  it('always returns 24 hour buckets', async () => {
    await seedBeerLog('+15551111111', '2024-06-01T10:00:00.000Z')
    const slug = await getGroupSlug()

    const res = await app.inject({ method: 'GET', url: `/v1/groups/${slug}/hourly` })
    expect(res.statusCode).toBe(200)

    const parsed = GroupHourlyResponseSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.hours).toHaveLength(24)
  })

  it('counts beers at the correct hour', async () => {
    await seedBeerLog('+15551111111', '2024-06-01T14:00:00.000Z')
    await seedBeerLog('+15552222222', '2024-06-01T14:30:00.000Z')
    const slug = await getGroupSlug()

    const res = await app.inject({ method: 'GET', url: `/v1/groups/${slug}/hourly` })
    expect(res.statusCode).toBe(200)

    const parsed = GroupHourlyResponseSchema.safeParse(res.json())
    expect(parsed.data?.hours[14].count).toBe(2)
    expect(parsed.data?.hours[0].count).toBe(0)
  })
})

describe('GET /v1/groups/:groupId/monthly', () => {
  it('returns 404 for unknown group', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/groups/no-such-group/monthly' })
    expect(res.statusCode).toBe(404)
  })

  it('returns empty months for group with no beers', async () => {
    await seedBeerLog()
    const slug = await getGroupSlug()
    await pool.query('DELETE FROM beer_logs')

    const res = await app.inject({ method: 'GET', url: `/v1/groups/${slug}/monthly` })
    expect(res.statusCode).toBe(200)

    const parsed = GroupMonthlyResponseSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.months).toHaveLength(0)
  })

  it('aggregates monthly counts correctly', async () => {
    await seedBeerLog('+15551111111', '2024-06-01T10:00:00.000Z')
    await seedBeerLog('+15552222222', '2024-06-15T10:00:00.000Z')
    await seedBeerLog('+15551111111', '2024-07-01T10:00:00.000Z')
    const slug = await getGroupSlug()

    const res = await app.inject({ method: 'GET', url: `/v1/groups/${slug}/monthly` })
    expect(res.statusCode).toBe(200)

    const parsed = GroupMonthlyResponseSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    const months = parsed.data!.months
    expect(months.find((m) => m.month === '2024-06')?.count).toBe(2)
    expect(months.find((m) => m.month === '2024-07')?.count).toBe(1)
  })
})
