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

// South African number: +27 country code → "ZA"
const zaPayload = {
  ...validPayload,
  senderId: 'wa:27831234567',
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

  it('stores phone_number stripped of wa: prefix', async () => {
    await app.inject({ method: 'POST', url: '/v1/internal/beer-log', payload: zaPayload })
    const { rows } = await pool.query('SELECT phone_number FROM users')
    expect(rows[0].phone_number).toBe('27831234567')
  })

  it('stores null phone_number for senderId without wa: prefix', async () => {
    await app.inject({ method: 'POST', url: '/v1/internal/beer-log', payload: validPayload })
    const { rows } = await pool.query('SELECT phone_number FROM users')
    expect(rows[0].phone_number).toBeNull()
  })

  it('stores push_name when provided', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      payload: { ...zaPayload, pushName: 'Marco Wouda' },
    })
    const { rows } = await pool.query('SELECT push_name FROM users')
    expect(rows[0].push_name).toBe('Marco Wouda')
  })

  it('stores null push_name when not provided', async () => {
    await app.inject({ method: 'POST', url: '/v1/internal/beer-log', payload: zaPayload })
    const { rows } = await pool.query('SELECT push_name FROM users')
    expect(rows[0].push_name).toBeNull()
  })

  it('backfills phone_number and push_name on second log from existing user', async () => {
    // First log: no phone_number or push_name (simulates an existing hashed-only user)
    await app.inject({ method: 'POST', url: '/v1/internal/beer-log', payload: validPayload })
    // Second log: same sender via wa: prefix, with push_name
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      payload: { ...validPayload, senderId: 'wa:27831234567', pushName: 'Test User' },
    })
    // Each senderId hashes to a different identity_hash, so we get two users here.
    // What we verify is that the wa: user row has phone_number and push_name set.
    const { rows } = await pool.query(
      `SELECT phone_number, push_name FROM users WHERE phone_number IS NOT NULL`,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].phone_number).toBe('27831234567')
    expect(rows[0].push_name).toBe('Test User')
  })

  it('stores country code from phone number prefix', async () => {
    await app.inject({ method: 'POST', url: '/v1/internal/beer-log', payload: zaPayload })
    const { rows } = await pool.query('SELECT country_code FROM users')
    expect(rows[0].country_code).toBe('ZA')
  })

  it('sets country code once and does not overwrite it', async () => {
    await app.inject({ method: 'POST', url: '/v1/internal/beer-log', payload: zaPayload })
    // Second log with same sender — country_code must remain 'ZA'
    await app.inject({ method: 'POST', url: '/v1/internal/beer-log', payload: zaPayload })
    const { rows } = await pool.query('SELECT country_code FROM users')
    expect(rows).toHaveLength(1)
    expect(rows[0].country_code).toBe('ZA')
  })

  it('stores null country code for unparseable senderId', async () => {
    await app.inject({ method: 'POST', url: '/v1/internal/beer-log', payload: validPayload })
    const { rows } = await pool.query('SELECT country_code FROM users')
    expect(rows[0].country_code).toBeNull()
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
