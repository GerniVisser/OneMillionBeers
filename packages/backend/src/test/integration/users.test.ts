import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type pg from 'pg'
import { buildApp } from '../../app.js'
import { startDb, stopDb, clearTables } from '../helpers.js'
import type { FastifyInstance } from 'fastify'
import { UserProfileResponseSchema, UserStatsResponseSchema } from '@omb/shared'

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
