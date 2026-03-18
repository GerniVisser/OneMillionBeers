import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type pg from 'pg'
import { buildApp } from '../../app.js'
import { startDb, stopDb, clearTables } from '../helpers.js'
import type { FastifyInstance } from 'fastify'

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

const validPayload = {
  sourceGroupId: 'group-tg-1',
  groupName: 'Test Group',
  senderId: '123456789',
  timestamp: '2024-06-01T12:00:00.000Z',
  photoUrl: 'https://example.com/beer.jpg',
}

describe('POST /v1/internal/beer-log', () => {
  it('returns 201 on valid request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      payload: validPayload,
    })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toEqual({ ok: true })
  })

  it('upserts group and user, inserts beer log', async () => {
    await app.inject({ method: 'POST', url: '/v1/internal/beer-log', payload: validPayload })
    await app.inject({ method: 'POST', url: '/v1/internal/beer-log', payload: validPayload })

    const { rows: groups } = await pool.query('SELECT * FROM groups')
    const { rows: users } = await pool.query('SELECT * FROM users')
    const { rows: logs } = await pool.query('SELECT * FROM beer_logs')

    expect(groups).toHaveLength(1)
    expect(users).toHaveLength(1)
    expect(logs).toHaveLength(2)
  })

  it('hashes the sender identity — never stores plaintext', async () => {
    await app.inject({ method: 'POST', url: '/v1/internal/beer-log', payload: validPayload })
    const { rows } = await pool.query('SELECT identity_hash FROM users')
    expect(rows[0].identity_hash).not.toBe(validPayload.senderId)
    expect(rows[0].identity_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns 400 on invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      payload: { sourceGroupId: 'x' },
    })
    expect(res.statusCode).toBe(400)
  })
})
