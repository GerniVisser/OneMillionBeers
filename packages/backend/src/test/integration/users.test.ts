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

async function seedBeerLog(phone = '+15551234567', ts = '2024-06-01T12:00:00.000Z') {
  return app.inject({
    method: 'POST',
    url: '/v1/internal/beer-log',
    payload: {
      whatsappGroupId: 'group-wa-1',
      groupName: 'Test Group',
      senderPhone: phone,
      timestamp: ts,
      photoUrl: 'https://example.com/beer.jpg',
    },
  })
}

async function getUserId(): Promise<string> {
  const { rows } = await pool.query('SELECT id FROM users LIMIT 1')
  return rows[0].id
}

describe('GET /v1/users/:userId', () => {
  it('returns 404 for unknown user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/users/00000000-0000-0000-0000-000000000000',
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns user profile without phoneHash', async () => {
    await seedBeerLog()
    const userId = await getUserId()

    const res = await app.inject({ method: 'GET', url: `/v1/users/${userId}` })
    expect(res.statusCode).toBe(200)

    const body = res.json()
    expect(body.phoneHash).toBeUndefined()

    const parsed = UserProfileResponseSchema.safeParse(body)
    expect(parsed.success).toBe(true)
  })
})

describe('GET /v1/users/:userId/stats', () => {
  it('returns 404 for unknown user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/users/00000000-0000-0000-0000-000000000000/stats',
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns stats matching UserStatsResponseSchema', async () => {
    await seedBeerLog('+15551234567', '2024-06-01T12:00:00.000Z')
    await seedBeerLog('+15551234567', '2024-06-02T12:00:00.000Z')
    await seedBeerLog('+15551234567', '2024-06-03T12:00:00.000Z')
    const userId = await getUserId()

    const res = await app.inject({ method: 'GET', url: `/v1/users/${userId}/stats` })
    expect(res.statusCode).toBe(200)

    const parsed = UserStatsResponseSchema.safeParse(res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.totalBeers).toBe(3)
    expect(parsed.data?.userId).toBe(userId)
  })
})
