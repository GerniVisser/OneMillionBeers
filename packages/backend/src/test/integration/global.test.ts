import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type pg from 'pg'
import { buildApp } from '../../app.js'
import { startDb, stopDb, clearTables } from '../helpers.js'
import type { FastifyInstance } from 'fastify'
import {
  GlobalCountResponseSchema,
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
