// WAHA lab recorder: a webhook sink for every lab session plus a dashboard that
// compares what each WhatsApp number saw. Zero dependencies — runs on plain
// Node 24 (type stripping + node:sqlite), so there is nothing to install.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { openDb } from './db.ts'
import {
  HMAC_KEY,
  ensureSessions,
  listGroups,
  listSessions,
  rewriteMediaUrl,
  waha,
} from './waha.ts'

const PORT = Number(process.env.PORT ?? 3201)
const DB_PATH = process.env.DB_PATH ?? './data/lab.db'
const KEEP_MEDIA = process.env.KEEP_MEDIA === 'true'
const MEDIA_DIR = DB_PATH.replace(/[^/]+$/, 'media')
const LAB_SESSIONS = (process.env.LAB_SESSIONS ?? 'personal,prod')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

// The bot's groups: everything the primary (production) number is in. Only these
// are recorded — other sessions may be personal numbers in hundreds of unrelated
// groups. Null until the first group sync has run; nothing is recorded before.
const LAB_PRIMARY = process.env.LAB_PRIMARY ?? 'prod'
let scopeGroups: Set<string> | null = null

const db = openDb(DB_PATH)
const dashboard = readFileSync(new URL('./dashboard.html', import.meta.url), 'utf8')

// Fraction of webhook deliveries to answer with 500, to exercise WAHA's retries.
let failRate = 0

const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`)

type Json = Record<string, unknown>

// ---------------------------------------------------------------- recording

const insertEvent = db.prepare(
  `INSERT INTO events (received_at, session, event, event_id, hmac_ok, failed, body)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
)
const upsertMessage = db.prepare(`
  INSERT INTO messages (session, chat_id, key_id, msg_id, from_me, participant, participant_alt,
                        sender, push_name, wa_ts, received_at, has_media, mimetype)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (session, chat_id, key_id) DO UPDATE SET deliveries = deliveries + 1
  RETURNING deliveries`)
const setMedia = db.prepare(`
  UPDATE messages SET media_sha256 = ?, media_bytes = ?, media_error = ?, download_ms = ?
  WHERE session = ? AND chat_id = ? AND key_id = ?`)
const insertRevoke = db.prepare(
  `INSERT INTO revokes (session, chat_id, key_id, received_at) VALUES (?, ?, ?, ?)`,
)
const insertStatus = db.prepare(
  `INSERT INTO status_changes (session, status, source, me, at) VALUES (?, ?, ?, ?, ?)`,
)
const lastStatus = db.prepare(
  `SELECT status FROM status_changes WHERE session = ? ORDER BY at DESC, rowid DESC LIMIT 1`,
)
const upsertGroup = db.prepare(`
  INSERT INTO groups (chat_id, subject, sessions, updated_at) VALUES (?, ?, ?, ?)
  ON CONFLICT (chat_id) DO UPDATE SET subject = excluded.subject, sessions = excluded.sessions,
                                      updated_at = excluded.updated_at`)

const insertReaction = db.prepare(`
  INSERT INTO reactions (session, chat_id, target_key, reactor, from_me, emoji, wa_ts, received_at, raw_target)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
function recordStatus(session: string, status: string, source: string, me?: string | null) {
  const prev = lastStatus.get(session) as { status: string } | undefined
  if (prev?.status === status) return
  insertStatus.run(session, status, source, me ?? null, Date.now())
  log(`[${session}] status ${prev?.status ?? '-'} -> ${status} (${source})`)
}

function verifyHmac(raw: Buffer, header: string | undefined): number | null {
  if (!header) return null
  const expected = createHmac('sha512', HMAC_KEY).update(raw).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(header)
  return a.length === b.length && timingSafeEqual(a, b) ? 1 : 0
}

// Session events are always kept; message and group events only for the bot's
// groups. DMs, status updates and unrelated groups are acknowledged but not stored.
function inScope(event: string, payload: Json, raw: Buffer): boolean {
  if (event === 'session.status') return true
  if (!scopeGroups) return false
  if (event.startsWith('message')) {
    const chat = messageChat(payload)
    // A revoke without a cached `before` has no chat; keep it, it only holds ids.
    return chat === undefined ? event === 'message.revoked' : scopeGroups.has(chat)
  }
  const text = raw.toString('utf8')
  return [...scopeGroups].some((id) => text.includes(id))
}

// Chat a message event belongs to. message.revoked/edited carry it on `before`.
function messageChat(payload: Json): string | undefined {
  const msg = (payload.before ?? payload) as Json
  const key = ((msg._data as Json | undefined)?.key ?? {}) as Json
  const fromMe = Boolean(msg.fromMe ?? key.fromMe)
  return (msg.chatId ?? (fromMe ? msg.to : msg.from) ?? key.remoteJid) as string | undefined
}

// The sender a message would be attributed to, resolved exactly as production
// webhook.ts does, so the dashboard shows whether two numbers agree.
function resolveSender(payload: Json): string | null {
  const key = ((payload._data as Json | undefined)?.key ?? {}) as Json
  const participant = payload.participant as string | undefined
  const participantAlt = key.participantAlt as string | undefined
  const senderJid = (
    participant?.endsWith('@lid') && participantAlt ? participantAlt : (participant ?? payload.from)
  ) as string | undefined
  return senderJid?.replace('@s.whatsapp.net', '').replace('@lid', '') ?? null
}

function handleReaction(session: string, payload: Json, receivedAt: number) {
  const reaction = (payload.reaction ?? {}) as Json
  const target = (reaction.messageId as string | undefined) ?? null
  // NOWEB serialises ids as {fromMe}_{chat}_{keyId}[_{participant}].
  const targetKey = target?.split('_')[2] ?? null
  insertReaction.run(
    session,
    messageChat(payload) ?? '',
    targetKey,
    resolveSender(payload),
    payload.fromMe ? 1 : 0,
    (reaction.text as string | undefined) ?? '',
    (payload.timestamp as number | undefined) ?? null,
    receivedAt,
    target,
  )
}

async function handleMessage(session: string, payload: Json, receivedAt: number) {
  const data = (payload._data ?? {}) as Json
  const key = (data.key ?? {}) as Json
  const fromMe = Boolean(payload.fromMe ?? key.fromMe)
  const chatId = messageChat(payload)
  const keyId = (key.id ?? payload.id) as string | undefined
  if (!chatId || !keyId) return

  const participant = payload.participant as string | undefined
  const participantAlt = key.participantAlt as string | undefined
  const sender = resolveSender(payload)

  const media = payload.media as Json | undefined | null
  const mimetype = (media?.mimetype as string | undefined) ?? null
  const row = upsertMessage.get(
    session,
    chatId,
    keyId,
    (payload.id as string) ?? null,
    fromMe ? 1 : 0,
    participant ?? null,
    participantAlt ?? null,
    sender,
    (data.pushName as string | undefined) ?? null,
    (payload.timestamp as number | undefined) ?? null,
    receivedAt,
    payload.hasMedia ? 1 : 0,
    mimetype,
  ) as { deliveries: number }
  if (row.deliveries > 1) return // redelivery; media already handled

  if (!payload.hasMedia || !mimetype?.startsWith('image/')) return
  const started = Date.now()
  try {
    if (media?.error) throw new Error(`WAHA media error: ${JSON.stringify(media.error)}`)
    if (!media?.url) throw new Error('no media.url')
    const res = await fetch(rewriteMediaUrl(media.url as string), {
      headers: { 'x-api-key': process.env.WAHA_API_KEY ?? '' },
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new Error(`media fetch ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const sha = createHash('sha256').update(buf).digest('hex')
    if (KEEP_MEDIA) {
      mkdirSync(MEDIA_DIR, { recursive: true })
      writeFileSync(`${MEDIA_DIR}/${sha}.${mimetype.split('/')[1] ?? 'bin'}`, buf)
    }
    setMedia.run(sha, buf.length, null, Date.now() - started, session, chatId, keyId)
  } catch (err) {
    setMedia.run(null, null, (err as Error).message, Date.now() - started, session, chatId, keyId)
    log(`[${session}] media download failed for ${keyId}: ${(err as Error).message}`)
  }
}

async function handleWebhook(session: string, raw: Buffer, req: IncomingMessage) {
  const receivedAt = Date.now()
  const hmacOk = verifyHmac(raw, req.headers['x-webhook-hmac'] as string | undefined)
  let body: Json
  try {
    body = JSON.parse(raw.toString('utf8')) as Json
  } catch {
    insertEvent.run(receivedAt, session, 'invalid-json', null, hmacOk, 0, raw.toString('utf8'))
    return 200
  }
  const payload = (body.payload ?? {}) as Json
  // Only groups are in scope, as in production. DMs and status updates of the
  // paired numbers are acknowledged but not stored or downloaded.
  const offScope = !inScope(String(body.event), payload, raw)

  const failed = Math.random() < failRate
  insertEvent.run(
    receivedAt,
    session,
    (body.event as string) ?? null,
    (body.id as string) ?? null,
    hmacOk,
    failed ? 1 : 0,
    offScope ? '{"redacted":"out of scope"}' : raw.toString('utf8'),
  )
  if (failed) return 500
  if (offScope) return 200

  switch (body.event) {
    case 'session.status': {
      const me = (body.me as Json | undefined)?.id as string | undefined
      recordStatus(session, payload.status as string, 'webhook', me)
      break
    }
    case 'message.any':
      handleMessage(session, payload, receivedAt).catch((err) =>
        log(`[${session}] handleMessage: ${(err as Error).message}`),
      )
      break
    case 'message.reaction':
      handleReaction(session, payload, receivedAt)
      break
    case 'message.revoked': {
      const before = (payload.before ?? {}) as Json
      const beforeKey = ((before._data as Json | undefined)?.key ?? {}) as Json
      insertRevoke.run(
        session,
        (before.from as string | undefined) ?? (beforeKey.remoteJid as string | undefined) ?? null,
        (payload.revokedMessageId as string | undefined) ??
          (beforeKey.id as string | undefined) ??
          null,
        receivedAt,
      )
      break
    }
  }
  return 200
}

// ------------------------------------------------------------------ polling

async function pollSessions() {
  try {
    for (const s of await listSessions()) recordStatus(s.name, s.status, 'poll', s.me?.id)
  } catch (err) {
    recordStatus('_waha', 'UNREACHABLE', 'poll')
    log(`poll failed: ${(err as Error).message}`)
    return
  }
  recordStatus('_waha', 'UP', 'poll')
}

// Which lab sessions are in which of the bot's groups, and their subjects.
// Polled rarely: on NOWEB this lists every group from WhatsApp, which is rate
// limited (see production webhook.ts).
async function syncGroups() {
  try {
    const working = (await listSessions()).filter((s) => s.status === 'WORKING')
    if (!working.some((s) => s.name === LAB_PRIMARY)) {
      log(`group sync: primary session ${LAB_PRIMARY} not WORKING, keeping previous scope`)
      return
    }
    const members = new Map<string, Set<string>>()
    const subjects = new Map<string, string | undefined>()
    for (const s of working) {
      for (const g of await listGroups(s.name)) {
        if (!g.id) continue
        members.set(g.id, (members.get(g.id) ?? new Set()).add(s.name))
        subjects.set(g.id, g.subject)
      }
    }
    scopeGroups = new Set([...members].filter(([, m]) => m.has(LAB_PRIMARY)).map(([id]) => id))
    for (const id of scopeGroups) {
      upsertGroup.run(
        id,
        subjects.get(id) ?? null,
        [...members.get(id)!].sort().join(','),
        Date.now(),
      )
    }
    log(`group sync: ${scopeGroups.size} groups in scope`)
  } catch (err) {
    log(`group sync failed: ${(err as Error).message}`)
  }
}

// Restore the last known scope so a recorder restart does not drop events
// while the first sync runs.
{
  const known = db.prepare(`SELECT chat_id FROM groups`).all() as { chat_id: string }[]
  if (known.length) scopeGroups = new Set(known.map((g) => g.chat_id))
}

// ---------------------------------------------------------------- summaries

interface MsgRow {
  session: string
  chat_id: string
  key_id: string
  from_me: number
  sender: string | null
  push_name: string | null
  wa_ts: number | null
  received_at: number
  deliveries: number
  has_media: number
  mimetype: string | null
  media_sha256: string | null
  media_error: string | null
  download_ms: number | null
}

function summary(limit: number) {
  const sessions = db
    .prepare(
      `SELECT s.session, s.status, s.me, s.at,
              (SELECT MAX(received_at) FROM events e WHERE e.session = s.session) AS last_event_at
       FROM status_changes s
       WHERE s.at = (SELECT MAX(at) FROM status_changes x WHERE x.session = s.session)
       ORDER BY s.session`,
    )
    .all()

  const timeline = db
    .prepare(`SELECT session, status, source, at FROM status_changes ORDER BY at DESC LIMIT 60`)
    .all()

  // Group messages only — that is all production ingests.
  const keys = db
    .prepare(
      `SELECT chat_id, key_id, MIN(received_at) AS first_at
       FROM messages WHERE chat_id LIKE '%@g.us'
       GROUP BY chat_id, key_id ORDER BY first_at DESC LIMIT ?`,
    )
    .all(limit) as { chat_id: string; key_id: string; first_at: number }[]

  const rowsByKey = new Map<string, MsgRow[]>()
  if (keys.length) {
    const oldest = keys[keys.length - 1].first_at
    const rows = db
      .prepare(`SELECT * FROM messages WHERE chat_id LIKE '%@g.us' AND received_at >= ?`)
      .all(oldest - 3_600_000) as unknown as MsgRow[]
    for (const r of rows) {
      const k = `${r.chat_id}|${r.key_id}`
      rowsByKey.set(k, [...(rowsByKey.get(k) ?? []), r])
    }
  }
  const groupNames = new Map(
    (
      db.prepare(`SELECT chat_id, subject FROM groups`).all() as {
        chat_id: string
        subject: string
      }[]
    ).map((g) => [g.chat_id, g.subject]),
  )

  const coverage = keys.map((k) => {
    const rows = rowsByKey.get(`${k.chat_id}|${k.key_id}`) ?? []
    const first = rows[0]
    const hashes = new Set(rows.map((r) => r.media_sha256).filter(Boolean))
    const senders = new Set(rows.map((r) => r.sender).filter(Boolean))
    return {
      chat: k.chat_id,
      group: groupNames.get(k.chat_id) ?? null,
      key: k.key_id,
      firstAt: k.first_at,
      pushName: rows.find((r) => r.push_name)?.push_name ?? null,
      image: rows.some((r) => r.mimetype?.startsWith('image/')),
      divergent: hashes.size > 1 || senders.size > 1,
      bySession: Object.fromEntries(
        rows.map((r) => [
          r.session,
          {
            delayMs: r.received_at - k.first_at,
            fromMe: !!r.from_me,
            deliveries: r.deliveries,
            sender: r.sender,
            sha: r.media_sha256?.slice(0, 10) ?? null,
            mediaError: r.media_error,
            downloadMs: r.download_ms,
          },
        ]),
      ),
      waTs: first?.wa_ts ?? null,
    }
  })

  const groups = db.prepare(`SELECT chat_id, subject, sessions FROM groups ORDER BY subject`).all()

  // Latest reaction per (target, reactor, session); removed reactions drop out.
  const reactions = db
    .prepare(
      `SELECT r.chat_id, g.subject, r.target_key, r.reactor, r.emoji, r.session, r.received_at,
              (SELECT m.push_name FROM messages m WHERE m.chat_id = r.chat_id AND m.key_id = r.target_key
               LIMIT 1) AS target_author
       FROM reactions r LEFT JOIN groups g ON g.chat_id = r.chat_id
       WHERE r.rowid = (SELECT x.rowid FROM reactions x WHERE x.session = r.session
                          AND x.chat_id = r.chat_id AND x.target_key IS r.target_key
                          AND x.reactor IS r.reactor ORDER BY x.received_at DESC, x.rowid DESC LIMIT 1)
       ORDER BY r.received_at DESC LIMIT 60`,
    )
    .all()

  return {
    now: Date.now(),
    failRate,
    groups,
    reactions,
    labSessions: LAB_SESSIONS,
    sessions,
    timeline,
    coverage,
    stats: stats(),
  }
}

// Per-session miss counts over all time. A session only counts as having missed a
// message if it was in that chat (has seen any message there) and the message
// came after the session's first recorded message there.
function stats() {
  const rows = db
    .prepare(
      `WITH keys AS (
         SELECT chat_id, key_id, MIN(received_at) AS first_at, COUNT(*) AS seen_by,
                COUNT(DISTINCT media_sha256) AS hashes, COUNT(DISTINCT sender) AS senders
         FROM messages WHERE chat_id LIKE '%@g.us' GROUP BY chat_id, key_id),
       -- Measured from the first arrival (by any session) of the earliest message
       -- this session saw, so its own first message counts even if it was late.
       membership AS (
         SELECT m.session, m.chat_id, MIN(k.first_at) AS since
         FROM messages m JOIN keys k ON k.chat_id = m.chat_id AND k.key_id = m.key_id
         GROUP BY m.session, m.chat_id)
       SELECT m.session,
              COUNT(*) AS expected,
              SUM(CASE WHEN x.key_id IS NOT NULL THEN 1 ELSE 0 END) AS seen,
              SUM(CASE WHEN x.key_id IS NULL THEN 1 ELSE 0 END) AS missed,
              SUM(CASE WHEN x.from_me = 1 THEN 1 ELSE 0 END) AS from_me,
              SUM(CASE WHEN x.media_error IS NOT NULL THEN 1 ELSE 0 END) AS media_errors,
              SUM(CASE WHEN x.deliveries > 1 THEN 1 ELSE 0 END) AS redelivered,
              SUM(CASE WHEN k.hashes > 1 OR k.senders > 1 THEN 1 ELSE 0 END) AS divergent
       FROM membership m
       JOIN keys k ON k.chat_id = m.chat_id AND k.first_at >= m.since
       LEFT JOIN messages x ON x.session = m.session AND x.chat_id = k.chat_id AND x.key_id = k.key_id
       GROUP BY m.session ORDER BY m.session`,
    )
    .all()
  const events = db
    .prepare(
      `SELECT session, COUNT(*) AS deliveries, COUNT(DISTINCT event_id) AS unique_events,
              SUM(failed) AS forced_failures, SUM(CASE WHEN hmac_ok = 0 THEN 1 ELSE 0 END) AS bad_hmac
       FROM events GROUP BY session ORDER BY session`,
    )
    .all()
  return { sessions: rows, events }
}

// ------------------------------------------------------------------- server

function send(res: ServerResponse, status: number, body: unknown, type = 'application/json') {
  res.writeHead(status, { 'content-type': type })
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body, null, 2))
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return Buffer.concat(chunks)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x')
  const path = url.pathname
  try {
    if (req.method === 'POST' && path.startsWith('/webhook/')) {
      const raw = await readBody(req)
      const status = await handleWebhook(decodeURIComponent(path.slice(9)), raw, req)
      return send(res, status, '', 'text/plain')
    }
    if (req.method === 'GET' && path === '/') return send(res, 200, dashboard, 'text/html')
    if (req.method === 'GET' && path === '/api/summary') {
      return send(res, 200, summary(Number(url.searchParams.get('limit') ?? 100)))
    }
    if (req.method === 'GET' && path === '/api/stats') return send(res, 200, stats())
    if (req.method === 'GET' && path === '/api/events') {
      const session = url.searchParams.get('session')
      const rows = db
        .prepare(
          `SELECT id, received_at, session, event, event_id, hmac_ok, failed, body FROM events
           WHERE (?1 IS NULL OR session = ?1) ORDER BY id DESC LIMIT ?2`,
        )
        .all(session, Number(url.searchParams.get('limit') ?? 50))
      return send(res, 200, rows)
    }
    if (req.method === 'GET' && path.startsWith('/qr/')) {
      const r = await waha(`/api/${path.slice(4)}/auth/qr?format=image`, {
        headers: { accept: 'image/png' },
      })
      return send(res, r.status, Buffer.from(await r.arrayBuffer()), 'image/png')
    }
    if (req.method === 'POST' && path === '/control/fail-rate') {
      failRate = Math.min(1, Math.max(0, Number(url.searchParams.get('rate') ?? 0)))
      log(`fail rate set to ${failRate}`)
      return send(res, 200, { failRate })
    }
    const lifecycle = path.match(/^\/control\/session\/([^/]+)\/(start|stop|restart)$/)
    if (req.method === 'POST' && lifecycle) {
      const r = await waha(`/api/sessions/${lifecycle[1]}/${lifecycle[2]}`, { method: 'POST' })
      log(`[${lifecycle[1]}] ${lifecycle[2]} from dashboard: ${r.status}`)
      return send(res, r.status, await r.text())
    }
    if (req.method === 'POST' && path === '/control/sync-groups') {
      await syncGroups()
      return send(res, 200, { ok: true })
    }
    send(res, 404, { error: 'not found' })
  } catch (err) {
    log(`${req.method} ${path}: ${(err as Error).stack}`)
    send(res, 500, { error: (err as Error).message })
  }
})

server.listen(PORT, () => log(`recorder on :${PORT}, sessions: ${LAB_SESSIONS.join(', ')}`))
await ensureSessions(LAB_SESSIONS, log)
await pollSessions()
setInterval(pollSessions, 15_000)
await syncGroups()
setInterval(syncGroups, 30 * 60_000)
