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
