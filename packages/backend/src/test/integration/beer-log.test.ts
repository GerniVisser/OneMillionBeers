import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type pg from 'pg'
import { buildApp } from '../../app.js'
import { startDb, stopDb, clearTables, internalHeaders, INTERNAL_TEST_TOKEN } from '../helpers.js'
import type { FastifyInstance } from 'fastify'

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

const validPayload = {
  sourceGroupId: 'group-tg-1',
  groupName: 'Test Group',
  senderId: '123456789',
  timestamp: '2024-06-01T12:00:00.000Z',
  photoUrl: 'https://example.com/beer.jpg',
  sourceMessageId: 'MSGID001',
}

/** A distinct message in the same group — i.e. a genuinely different beer. */
const anotherMessage = (sourceMessageId: string) => ({ ...validPayload, sourceMessageId })

const post = (payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/v1/internal/beer-log', headers: internalHeaders, payload })

const revoke = (sourceMessageId: string, sourceGroupId = validPayload.sourceGroupId) =>
  app.inject({
    method: 'DELETE',
    url:
      `/v1/internal/beer-log/by-message/${encodeURIComponent(sourceMessageId)}` +
      `?sourceGroupId=${encodeURIComponent(sourceGroupId)}`,
    headers: internalHeaders,
  })

const countLogs = async () => (await pool.query('SELECT * FROM beer_logs')).rows.length

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
      headers: internalHeaders,
      payload: validPayload,
    })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toEqual({ ok: true, outcome: 'created' })
  })

  it('upserts group and user, inserts beer log', async () => {
    await post(validPayload)
    await post(anotherMessage('MSGID002'))

    const { rows: groups } = await pool.query('SELECT * FROM groups')
    const { rows: users } = await pool.query('SELECT * FROM users')
    const { rows: logs } = await pool.query('SELECT * FROM beer_logs')

    expect(groups).toHaveLength(1)
    expect(users).toHaveLength(1)
    expect(logs).toHaveLength(2)
  })

  it('hashes the sender identity — never stores plaintext', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: validPayload,
    })
    const { rows } = await pool.query('SELECT identity_hash FROM users')
    expect(rows[0].identity_hash).not.toBe(validPayload.senderId)
    expect(rows[0].identity_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('stores phone_number stripped of wa: prefix', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: zaPayload,
    })
    const { rows } = await pool.query('SELECT phone_number FROM users')
    expect(rows[0].phone_number).toBe('27831234567')
  })

  it('stores null phone_number for senderId without wa: prefix', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: validPayload,
    })
    const { rows } = await pool.query('SELECT phone_number FROM users')
    expect(rows[0].phone_number).toBeNull()
  })

  it('stores push_name when provided', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: { ...zaPayload, pushName: 'Marco Wouda' },
    })
    const { rows } = await pool.query('SELECT push_name FROM users')
    expect(rows[0].push_name).toBe('Marco Wouda')
  })

  it('stores null push_name when not provided', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: zaPayload,
    })
    const { rows } = await pool.query('SELECT push_name FROM users')
    expect(rows[0].push_name).toBeNull()
  })

  it('backfills phone_number and push_name on second log from existing user', async () => {
    // First log: no phone_number or push_name (simulates an existing hashed-only user)
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: validPayload,
    })
    // Second log: same sender via wa: prefix, with push_name
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: { ...anotherMessage('MSGID002'), senderId: 'wa:27831234567', pushName: 'Test User' },
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
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: zaPayload,
    })
    const { rows } = await pool.query('SELECT country_code FROM users')
    expect(rows[0].country_code).toBe('ZA')
  })

  it('sets country code once and does not overwrite it', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: zaPayload,
    })
    // Second log with same sender — country_code must remain 'ZA'
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: { ...zaPayload, sourceMessageId: 'MSGID002' },
    })
    const { rows } = await pool.query('SELECT country_code FROM users')
    expect(rows).toHaveLength(1)
    expect(rows[0].country_code).toBe('ZA')
  })

  it('stores null country code for unparseable senderId', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: validPayload,
    })
    const { rows } = await pool.query('SELECT country_code FROM users')
    expect(rows[0].country_code).toBeNull()
  })

  it('returns 400 on invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: { sourceGroupId: 'x' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('stores sourceMessageId when provided', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: validPayload,
    })
    const { rows } = await pool.query('SELECT source_message_id FROM beer_logs')
    expect(rows[0].source_message_id).toBe(validPayload.sourceMessageId)
  })

  it('rejects a request without a sourceMessageId', async () => {
    // (group, sourceMessageId) is the key that makes ingestion idempotent, so a
    // request that omits it could be inserted twice.
    const withoutId: Record<string, unknown> = { ...validPayload }
    delete withoutId.sourceMessageId
    const res = await post(withoutId)
    expect(res.statusCode).toBe(400)
  })

  it('stores photo_hash when provided', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: { ...validPayload, photoHash: HASH_A },
    })
    const { rows } = await pool.query('SELECT photo_hash FROM beer_logs')
    expect(rows[0].photo_hash).toBe(HASH_A)
  })

  it('stores null photo_hash when not provided', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: validPayload,
    })
    const { rows } = await pool.query('SELECT photo_hash FROM beer_logs')
    expect(rows[0].photo_hash).toBeNull()
  })
})

describe('POST /v1/internal/beer-log — idempotency', () => {
  // Several WhatsApp numbers run in each group for redundancy, so the same
  // message arrives several times: usually milliseconds apart, but after an
  // outage WhatsApp replays a backlog and a number can be days behind.
  it('reports created then duplicate for the same message from two bots', async () => {
    const first = await post(validPayload)
    const second = await post({ ...validPayload, photoUrl: 'https://example.com/bot-two.jpg' })

    expect(first.json()).toEqual({ ok: true, outcome: 'created' })
    expect(second.json()).toEqual({ ok: true, outcome: 'duplicate' })
    expect(await countLogs()).toBe(1)
  })

  it('keeps the first bot photo URL when a second bot reports the same message', async () => {
    // Both bots derive the same S3 key, so the surviving row must point at an
    // object that exists — and the loser must not overwrite the winner's URL.
    await post(validPayload)
    await post({ ...validPayload, photoUrl: 'https://example.com/bot-two.jpg' })
    const { rows } = await pool.query('SELECT photo_url FROM beer_logs')
    expect(rows[0].photo_url).toBe(validPayload.photoUrl)
  })

  it('creates exactly one row when two bots post concurrently', async () => {
    // Two pooled connections racing on the unique index, as happens when both
    // numbers deliver within the measured 16 ms.
    const [a, b] = await Promise.all([
      post(validPayload),
      post({ ...validPayload, photoUrl: 'https://example.com/bot-two.jpg' }),
    ])
    expect([a.json().outcome, b.json().outcome].sort()).toEqual(['created', 'duplicate'])
    expect(await countLogs()).toBe(1)
  })

  it('still deduplicates a redelivery that arrives days later', async () => {
    await post(validPayload)
    const late = await post({
      ...validPayload,
      timestamp: '2024-06-04T12:00:00.000Z',
      photoUrl: 'https://example.com/much-later.jpg',
    })
    expect(late.json().outcome).toBe('duplicate')
    expect(await countLogs()).toBe(1)
  })

  it('treats a redelivery whose photo hashes differently as a duplicate, not an error', async () => {
    // The old insert conflicted on photo_hash alone, so this raised an uncaught
    // 23505: the backend 500'd, the beer was lost and its S3 object orphaned.
    await post({ ...validPayload, photoHash: HASH_A })
    const res = await post({ ...validPayload, photoHash: HASH_B })
    expect(res.statusCode).toBe(201)
    expect(res.json().outcome).toBe('duplicate')
    expect(await countLogs()).toBe(1)
  })

  it('counts two different messages in the same group separately', async () => {
    await post(validPayload)
    await post(anotherMessage('MSGID002'))
    expect(await countLogs()).toBe(2)
  })

  it('counts the same message id in two different groups separately', async () => {
    await post(validPayload)
    await post({ ...validPayload, sourceGroupId: 'group-tg-2' })
    expect(await countLogs()).toBe(2)
  })
})

describe('DELETE /v1/internal/beer-log/by-message/:sourceMessageId', () => {
  it('returns 200 and the photoUrl when the beer log exists', async () => {
    await post(validPayload)
    const res = await revoke(validPayload.sourceMessageId)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true, photoUrl: validPayload.photoUrl })
  })

  it('removes the beer log row from the database', async () => {
    await post(validPayload)
    await revoke(validPayload.sourceMessageId)
    expect(await countLogs()).toBe(0)
  })

  it('records a tombstone whether or not a beer log existed', async () => {
    await revoke('never-logged')
    const { rows } = await pool.query('SELECT * FROM beer_log_revocations')
    expect(rows).toHaveLength(1)
    expect(rows[0].source_message_id).toBe('never-logged')
  })

  it('returns 200 with no photoUrl when the revoke matched no beer log', async () => {
    const res = await revoke('never-logged')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
  })

  it('is idempotent — a second revoke is a no-op', async () => {
    await post(validPayload)
    await revoke(validPayload.sourceMessageId)
    const second = await revoke(validPayload.sourceMessageId)
    expect(second.statusCode).toBe(200)
    expect(second.json()).toEqual({ ok: true })
    const { rows } = await pool.query('SELECT * FROM beer_log_revocations')
    expect(rows).toHaveLength(1)
  })

  it('refuses a message that arrives after its own revoke', async () => {
    // WhatsApp delivers the revoke first often enough that the lab caught it
    // twice in a day, the message following up to 13 s later.
    await revoke(validPayload.sourceMessageId)
    const res = await post(validPayload)
    expect(res.json()).toEqual({ ok: true, outcome: 'revoked' })
    expect(await countLogs()).toBe(0)
  })

  it('still refuses a late copy from a second bot after a revoke', async () => {
    // The second number can be days behind after an outage, long after the
    // first copy was revoked and deleted. An in-memory guard cannot catch this.
    await post(validPayload)
    await revoke(validPayload.sourceMessageId)
    const late = await post({ ...validPayload, photoUrl: 'https://example.com/bot-two.jpg' })
    expect(late.json().outcome).toBe('revoked')
    expect(await countLogs()).toBe(0)
  })

  it('only affects the group it names', async () => {
    await post(validPayload)
    await post({ ...validPayload, sourceGroupId: 'group-tg-2' })
    await revoke(validPayload.sourceMessageId, 'group-tg-2')

    const { rows } = await pool.query(
      `SELECT g.source_group_id FROM beer_logs bl JOIN groups g ON g.id = bl.group_id`,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].source_group_id).toBe('group-tg-1')
  })

  it('returns 400 when sourceGroupId is absent', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/internal/beer-log/by-message/MSGID001',
      headers: internalHeaders,
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('pseudo_name generation', () => {
  it('sets pseudo_name on new user creation', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: validPayload,
    })
    const { rows } = await pool.query<{ pseudo_name: string }>('SELECT pseudo_name FROM users')
    expect(rows[0].pseudo_name).toBeTruthy()
    expect(typeof rows[0].pseudo_name).toBe('string')
  })

  it('pseudo_name is at most 20 characters', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: validPayload,
    })
    const { rows } = await pool.query<{ pseudo_name: string }>('SELECT pseudo_name FROM users')
    expect(rows[0].pseudo_name.length).toBeLessThanOrEqual(20)
  })

  it('slug is derived from pseudo_name in kebab-case', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: validPayload,
    })
    const { rows } = await pool.query<{ pseudo_name: string; slug: string }>(
      'SELECT pseudo_name, slug FROM users',
    )
    const expectedSlug = rows[0].pseudo_name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
    expect(rows[0].slug).toBe(expectedSlug)
  })

  it('pseudo_name is not overwritten on subsequent upserts', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: zaPayload,
    })
    const { rows: first } = await pool.query<{ pseudo_name: string }>(
      'SELECT pseudo_name FROM users',
    )
    const originalName = first[0].pseudo_name

    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: zaPayload,
    })
    const { rows: second } = await pool.query<{ pseudo_name: string }>(
      'SELECT pseudo_name FROM users',
    )
    expect(second[0].pseudo_name).toBe(originalName)
  })

  it('pseudo_name is unique across different users', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: validPayload,
    })
    await app.inject({
      method: 'POST',
      url: '/v1/internal/beer-log',
      headers: internalHeaders,
      payload: { ...validPayload, senderId: 'wa:27831234567' },
    })
    const { rows } = await pool.query<{ pseudo_name: string }>(
      'SELECT pseudo_name FROM users ORDER BY created_at',
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].pseudo_name).not.toBe(rows[1].pseudo_name)
  })
})

describe('schema: group-scoped dedup key and revocation tombstones', () => {
  async function makeGroup(sourceGroupId: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO groups (source_group_id, name, slug) VALUES ($1, $2, $3) RETURNING id`,
      [sourceGroupId, sourceGroupId, sourceGroupId],
    )
    return rows[0]!.id
  }

  async function makeUser(): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (identity_hash, slug) VALUES ($1, 'u') RETURNING id`,
      ['a'.repeat(64)],
    )
    return rows[0]!.id
  }

  const insertLog = (userId: string, groupId: string, sourceMessageId: string | null) =>
    pool.query(
      `INSERT INTO beer_logs (user_id, group_id, photo_url, logged_at, source_message_id)
       VALUES ($1, $2, 'https://example.com/b.jpg', now(), $3)`,
      [userId, groupId, sourceMessageId],
    )

  it('rejects the same message id twice in one group', async () => {
    const [userId, groupId] = [await makeUser(), await makeGroup('wa:a@g.us')]
    await insertLog(userId, groupId, 'MSG1')
    await expect(insertLog(userId, groupId, 'MSG1')).rejects.toMatchObject({ code: '23505' })
  })

  it('allows the same message id in two different groups', async () => {
    const userId = await makeUser()
    await insertLog(userId, await makeGroup('wa:a@g.us'), 'MSG1')
    await insertLog(userId, await makeGroup('wa:b@g.us'), 'MSG1')
    const { rows } = await pool.query('SELECT * FROM beer_logs')
    expect(rows).toHaveLength(2)
  })

  it('allows multiple legacy rows with a NULL source_message_id', async () => {
    const [userId, groupId] = [await makeUser(), await makeGroup('wa:a@g.us')]
    await insertLog(userId, groupId, null)
    await insertLog(userId, groupId, null)
    const { rows } = await pool.query('SELECT * FROM beer_logs')
    expect(rows).toHaveLength(2)
  })

  it('records a tombstone for a message no beer log has ever referenced', async () => {
    await pool.query(
      `INSERT INTO beer_log_revocations (source_group_id, source_message_id) VALUES ($1, $2)`,
      ['wa:never-seen@g.us', 'MSG1'],
    )
    const { rows } = await pool.query('SELECT * FROM beer_log_revocations')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.revoked_at).toBeInstanceOf(Date)
  })

  it('keys tombstones by group so the same message id can be revoked in each', async () => {
    const insertTomb = (group: string) =>
      pool.query(
        `INSERT INTO beer_log_revocations (source_group_id, source_message_id) VALUES ($1, 'MSG1')`,
        [group],
      )
    await insertTomb('wa:a@g.us')
    await insertTomb('wa:b@g.us')
    await expect(insertTomb('wa:a@g.us')).rejects.toMatchObject({ code: '23505' })
    const { rows } = await pool.query('SELECT * FROM beer_log_revocations')
    expect(rows).toHaveLength(2)
  })
})
