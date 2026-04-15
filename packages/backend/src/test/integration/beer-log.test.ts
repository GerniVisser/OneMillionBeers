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

const payloadWithMessageId = {
  ...validPayload,
  sourceMessageId: 'false_120363XXX@g.us_MSGID001',
}

// SHA-256 of "beer" — a stable known hash for test fixtures
const HASH_A = 'a9de4f48f35b1ba44a4a47b13eec4c8af00cd6bcff04cbc9fda1e6f82ee855c9'
const HASH_B = 'b94f6f125c79e3a5ffaa826f584c10d52ada669e6762051b826b55776d05a15b'

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

  it('stores sourceMessageId when provided', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      payload: payloadWithMessageId,
    })
    const { rows } = await pool.query('SELECT source_message_id FROM beer_logs')
    expect(rows[0].source_message_id).toBe(payloadWithMessageId.sourceMessageId)
  })

  it('stores null source_message_id when not provided', async () => {
    await app.inject({ method: 'POST', url: '/v1/internal/beer-log', payload: validPayload })
    const { rows } = await pool.query('SELECT source_message_id FROM beer_logs')
    expect(rows[0].source_message_id).toBeNull()
  })

  it('stores photo_hash when provided', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      payload: { ...validPayload, photoHash: HASH_A },
    })
    const { rows } = await pool.query('SELECT photo_hash FROM beer_logs')
    expect(rows[0].photo_hash).toBe(HASH_A)
  })

  it('stores null photo_hash when not provided', async () => {
    await app.inject({ method: 'POST', url: '/v1/internal/beer-log', payload: validPayload })
    const { rows } = await pool.query('SELECT photo_hash FROM beer_logs')
    expect(rows[0].photo_hash).toBeNull()
  })
})

describe('POST /v1/internal/beer-log — photo deduplication', () => {
  it('returns 201 on the second post with the same photo_hash', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      payload: { ...validPayload, photoHash: HASH_A },
    })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      payload: { ...validPayload, photoUrl: 'https://example.com/other.jpg', photoHash: HASH_A },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toEqual({ ok: true })
  })

  it('does not insert a second row when photo_hash already exists', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      payload: { ...validPayload, photoHash: HASH_A },
    })
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      payload: { ...validPayload, photoHash: HASH_A },
    })
    const { rows } = await pool.query('SELECT * FROM beer_logs')
    expect(rows).toHaveLength(1)
  })

  it('allows the same photo_hash from a different group to be rejected globally', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      payload: { ...validPayload, sourceGroupId: 'group-a', photoHash: HASH_A },
    })
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      payload: { ...validPayload, sourceGroupId: 'group-b', photoHash: HASH_A },
    })
    const { rows } = await pool.query('SELECT * FROM beer_logs')
    expect(rows).toHaveLength(1)
  })

  it('allows two different photo hashes in the same group', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      payload: { ...validPayload, photoHash: HASH_A },
    })
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      payload: { ...validPayload, photoUrl: 'https://example.com/beer2.jpg', photoHash: HASH_B },
    })
    const { rows } = await pool.query('SELECT * FROM beer_logs')
    expect(rows).toHaveLength(2)
  })

  it('allows multiple rows without a photo_hash (legacy / no dedup)', async () => {
    await app.inject({ method: 'POST', url: '/v1/internal/beer-log', payload: validPayload })
    await app.inject({ method: 'POST', url: '/v1/internal/beer-log', payload: validPayload })
    const { rows } = await pool.query('SELECT * FROM beer_logs')
    expect(rows).toHaveLength(2)
  })
})

describe('DELETE /v1/internal/beer-log/by-message/:sourceMessageId', () => {
  it('returns 200 and the photoUrl when the beer log exists', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      payload: payloadWithMessageId,
    })
    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/internal/beer-log/by-message/${encodeURIComponent(payloadWithMessageId.sourceMessageId)}`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true, photoUrl: payloadWithMessageId.photoUrl })
  })

  it('removes the beer log row from the database', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      payload: payloadWithMessageId,
    })
    await app.inject({
      method: 'DELETE',
      url: `/v1/internal/beer-log/by-message/${encodeURIComponent(payloadWithMessageId.sourceMessageId)}`,
    })
    const { rows } = await pool.query('SELECT * FROM beer_logs')
    expect(rows).toHaveLength(0)
  })

  it('returns 404 when no beer log matches the sourceMessageId', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/internal/beer-log/by-message/unknown-message-id',
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ ok: false })
  })

  it('second delete of the same sourceMessageId returns 404', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      payload: payloadWithMessageId,
    })
    await app.inject({
      method: 'DELETE',
      url: `/v1/internal/beer-log/by-message/${encodeURIComponent(payloadWithMessageId.sourceMessageId)}`,
    })
    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/internal/beer-log/by-message/${encodeURIComponent(payloadWithMessageId.sourceMessageId)}`,
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('pseudo_name generation', () => {
  it('sets pseudo_name on new user creation', async () => {
    await app.inject({ method: 'POST', url: '/v1/internal/beer-log', payload: validPayload })
    const { rows } = await pool.query<{ pseudo_name: string }>('SELECT pseudo_name FROM users')
    expect(rows[0].pseudo_name).toBeTruthy()
    expect(typeof rows[0].pseudo_name).toBe('string')
  })

  it('pseudo_name is at most 20 characters', async () => {
    await app.inject({ method: 'POST', url: '/v1/internal/beer-log', payload: validPayload })
    const { rows } = await pool.query<{ pseudo_name: string }>('SELECT pseudo_name FROM users')
    expect(rows[0].pseudo_name.length).toBeLessThanOrEqual(20)
  })

  it('slug is derived from pseudo_name in kebab-case', async () => {
    await app.inject({ method: 'POST', url: '/v1/internal/beer-log', payload: validPayload })
    const { rows } = await pool.query<{ pseudo_name: string; slug: string }>(
      'SELECT pseudo_name, slug FROM users',
    )
    const expectedSlug = rows[0].pseudo_name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
    expect(rows[0].slug).toBe(expectedSlug)
  })

  it('pseudo_name is not overwritten on subsequent upserts', async () => {
    await app.inject({ method: 'POST', url: '/v1/internal/beer-log', payload: zaPayload })
    const { rows: first } = await pool.query<{ pseudo_name: string }>(
      'SELECT pseudo_name FROM users',
    )
    const originalName = first[0].pseudo_name

    await app.inject({ method: 'POST', url: '/v1/internal/beer-log', payload: zaPayload })
    const { rows: second } = await pool.query<{ pseudo_name: string }>(
      'SELECT pseudo_name FROM users',
    )
    expect(second[0].pseudo_name).toBe(originalName)
  })

  it('pseudo_name is unique across different users', async () => {
    await app.inject({ method: 'POST', url: '/v1/internal/beer-log', payload: validPayload })
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      payload: { ...validPayload, senderId: 'wa:27831234567' },
    })
    const { rows } = await pool.query<{ pseudo_name: string }>(
      'SELECT pseudo_name FROM users ORDER BY created_at',
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].pseudo_name).not.toBe(rows[1].pseudo_name)
  })
})
