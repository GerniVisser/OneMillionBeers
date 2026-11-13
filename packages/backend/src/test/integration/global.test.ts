import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type pg from 'pg'
import { buildApp } from '../../app.js'
import {
  startDb,
  stopDb,
  clearTables,
  internalHeaders,
  INTERNAL_TEST_TOKEN,
  nextMessageId,
} from '../helpers.js'
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
  BeerOfTheWeekResponseSchema,
  GlobalHighlightsResponseSchema,
} from '@omb/shared'

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

async function seedBeerLogWithCountry(senderId: string, ts = '2024-06-01T12:00:00.000Z') {
  return app.inject({
    method: 'POST',
    url: '/v1/internal/beer-log',
    headers: internalHeaders,
    payload: {
      sourceGroupId: 'group-tg-1',
      groupName: 'Test Group',
      senderId,
      timestamp: ts,
      photoUrl: 'https://example.com/beer.jpg',
      sourceMessageId: nextMessageId(),
    },
  })
}

async function seedBeerLog(senderId = '123456789', ts = '2024-06-01T12:00:00.000Z') {
  return app.inject({
    method: 'POST',
    url: '/v1/internal/beer-log',
    headers: internalHeaders,
    payload: {
      sourceGroupId: 'group-tg-1',
      groupName: 'Test Group',
      senderId,
      timestamp: ts,
      photoUrl: 'https://example.com/beer.jpg',
      sourceMessageId: nextMessageId(),
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

describe('GET /v1/global/beer-of-the-week', () => {
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

  async function postBeer(sourceMessageId: string, loggedAt: string, sourceGroupId = 'group-tg-1') {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: {
        sourceGroupId,
        groupName: 'Test Group',
        senderId: 'wa:27831234567',
        timestamp: loggedAt,
        photoUrl: `https://example.com/${sourceMessageId}.jpg`,
        sourceMessageId,
      },
    })
  }

  async function react(
    sourceMessageId: string,
    reactors: string[],
    emoji: string | null = '🍻',
    sourceGroupId = 'group-tg-1',
  ) {
    for (const reactorId of reactors) {
      await app.inject({
        method: 'POST',
        url: '/v1/internal/beer-log/reaction',
        headers: internalHeaders,
        payload: { sourceGroupId, sourceMessageId, reactorId, emoji, timestamp: daysAgo(0) },
      })
    }
  }

  const winner = async () =>
    (await app.inject({ method: 'GET', url: '/v1/global/beer-of-the-week' })).json().beer

  it('returns null when no recent beer has a reaction', async () => {
    await postBeer('QUIET', daysAgo(1))
    const res = await app.inject({ method: 'GET', url: '/v1/global/beer-of-the-week' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ beer: null })
  })

  it('returns the beer with the most reactions, with its reaction summary', async () => {
    await postBeer('LIKED', daysAgo(2))
    await postBeer('LOVED', daysAgo(3))
    await react('LIKED', ['wa:1'])
    await react('LOVED', ['wa:1', 'wa:2'], '❤️')
    await react('LOVED', ['wa:3'], '🔥')

    const res = await app.inject({ method: 'GET', url: '/v1/global/beer-of-the-week' })
    const parsed = BeerOfTheWeekResponseSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.beer?.photoUrl).toBe('https://example.com/LOVED.jpg')
    expect(parsed.data?.beer?.reactions).toEqual([
      { emoji: '❤️', count: 2 },
      { emoji: '🔥', count: 1 },
    ])
  })

  it('ignores beers posted more than 7 days ago', async () => {
    await postBeer('OLD', daysAgo(8))
    await postBeer('NEW', daysAgo(1))
    await react('OLD', ['wa:1', 'wa:2', 'wa:3'])
    await react('NEW', ['wa:1'])
    expect((await winner()).photoUrl).toBe('https://example.com/NEW.jpg')
  })

  it('does not count removed reactions', async () => {
    await postBeer('FADED', daysAgo(1))
    await postBeer('STEADY', daysAgo(1))
    await react('FADED', ['wa:1', 'wa:2'])
    await react('FADED', ['wa:1', 'wa:2'], null)
    await react('STEADY', ['wa:1'])
    expect((await winner()).photoUrl).toBe('https://example.com/STEADY.jpg')
  })

  it('gives a tie to the newer beer', async () => {
    await postBeer('OLDER', daysAgo(3))
    await postBeer('NEWER', daysAgo(1))
    await react('OLDER', ['wa:1'])
    await react('NEWER', ['wa:1'])
    expect((await winner()).photoUrl).toBe('https://example.com/NEWER.jpg')
  })

  it('skips beers in disabled groups', async () => {
    await postBeer('HIDDEN', daysAgo(1), 'group-hidden')
    await react('HIDDEN', ['wa:1', 'wa:2'], '🍻', 'group-hidden')
    await pool.query(`UPDATE groups SET disabled = TRUE WHERE source_group_id = 'group-hidden'`)
    expect(await winner()).toBeNull()
  })
})

describe('GET /v1/global/highlights', () => {
  async function post(sourceGroupId: string, sourceMessageId: string) {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: {
        sourceGroupId,
        groupName: sourceGroupId,
        senderId: `wa:2783${sourceMessageId.length}${sourceGroupId.length}00000`,
        timestamp: '2024-06-01T12:00:00.000Z',
        photoUrl: 'https://example.com/beer.jpg',
        sourceMessageId,
      },
    })
  }

  const highlights = async () =>
    (await app.inject({ method: 'GET', url: '/v1/global/highlights' })).json()

  it('is empty before anything is logged', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/global/highlights' })
    expect(res.statusCode).toBe(200)
    expect(GlobalHighlightsResponseSchema.safeParse(res.json()).success).toBe(true)
    expect(res.json()).toEqual({ topGroups: [] })
  })

  it('ranks groups by beers logged', async () => {
    await post('group-small', 'S1')
    await post('group-big', 'B1')
    await post('group-big', 'B2')
    const body = await highlights()
    expect(body.topGroups.map((g: { name: string }) => g.name)).toEqual([
      'group-big',
      'group-small',
    ])
    expect(body.topGroups[0].totalBeers).toBe(2)
  })

  it('leaves out hidden and disabled groups', async () => {
    await post('group-hidden', 'H1')
    await post('group-off', 'O1')
    await pool.query(`UPDATE groups SET hidden = TRUE WHERE source_group_id = 'group-hidden'`)
    await pool.query(`UPDATE groups SET disabled = TRUE WHERE source_group_id = 'group-off'`)
    expect((await highlights()).topGroups).toEqual([])
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
    sseApp = await buildApp(pool, 'silent', 'test', INTERNAL_TEST_TOKEN)
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
      headers: internalHeaders,
      payload: {
        sourceGroupId: 'group-tg-sse',
        groupName: 'SSE Group',
        senderId: '333333333',
        timestamp: '2024-06-01T12:00:00.000Z',
        photoUrl: 'https://example.com/beer.jpg',
        sourceMessageId: nextMessageId(),
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
      headers: internalHeaders,
      payload: {
        sourceGroupId: 'group-tg-2',
        groupName: 'Second Group',
        senderId: '333333333',
        timestamp: '2024-06-01T14:00:00.000Z',
        photoUrl: 'https://example.com/beer.jpg',
        sourceMessageId: nextMessageId(),
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

describe('disabled group data suppression', () => {
  async function seedGroupWithFlag(
    sourceGroupId: string,
    name: string,
    disabled: boolean,
  ): Promise<string> {
    const slug = name.toLowerCase().replace(/\s+/g, '-')
    await pool.query(
      `INSERT INTO groups (source_group_id, name, slug, disabled)
       VALUES ($1, $2, $3, $4)`,
      [sourceGroupId, name, slug, disabled],
    )
    const { rows } = await pool.query('SELECT id FROM groups WHERE source_group_id = $1', [
      sourceGroupId,
    ])
    return rows[0].id as string
  }

  async function seedUserAndBeerLog(groupId: string, senderId: string) {
    const { rows: userRows } = await pool.query(
      `INSERT INTO users (identity_hash, push_name, slug)
       VALUES ($1, $2, $3)
       ON CONFLICT (identity_hash) DO UPDATE SET push_name = EXCLUDED.push_name
       RETURNING id`,
      [senderId, 'Test User', senderId],
    )
    await pool.query(
      `INSERT INTO beer_logs (user_id, group_id, photo_url, logged_at)
       VALUES ($1, $2, 'https://example.com/beer.jpg', NOW())`,
      [userRows[0].id, groupId],
    )
  }

  it('excludes disabled group logs from GET /v1/global/feed and reduces total', async () => {
    await seedBeerLog('sender-visible')
    const disabledGroupId = await seedGroupWithFlag('group-disabled', 'Disabled Group', true)
    await seedUserAndBeerLog(disabledGroupId, 'sender-disabled')

    const res = await app.inject({ method: 'GET', url: '/v1/global/feed' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.total).toBe(1)
    const groupNames = body.items.map((item: { group: { name: string } }) => item.group.name)
    expect(groupNames).not.toContain('Disabled Group')
  })

  it('excludes disabled group logs from GET /v1/global/count', async () => {
    await seedBeerLog('sender-visible')
    const disabledGroupId = await seedGroupWithFlag('group-disabled2', 'Disabled Group 2', true)
    await seedUserAndBeerLog(disabledGroupId, 'sender-disabled2')

    const res = await app.inject({ method: 'GET', url: '/v1/global/count' })
    expect(res.statusCode).toBe(200)
    expect(res.json().count).toBe(1)
  })

  it('hidden group logs still appear in GET /v1/global/feed', async () => {
    const hiddenGroupId = await seedGroupWithFlag('group-hidden', 'Hidden Group', false)
    await pool.query(`UPDATE groups SET hidden = TRUE WHERE id = $1`, [hiddenGroupId])
    await seedUserAndBeerLog(hiddenGroupId, 'sender-hidden')

    const res = await app.inject({ method: 'GET', url: '/v1/global/feed' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.total).toBe(1)
  })
})
