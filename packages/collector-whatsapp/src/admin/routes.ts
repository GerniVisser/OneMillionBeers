import { createHash, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import { type Logger } from 'pino'
import { config } from '../config.js'
import { getActivity, getAudit, getCollectorStartedAt, recordAudit, recordMe } from '../activity.js'
import {
  getQrCodePng,
  getServerInfo,
  listSessions,
  requestPairingCode,
  restartServer,
  sessionAction,
  type SessionAction,
} from '../waha-client.js'
import { verifyPassword } from './password.js'
import { checkLogin, recordFailure, recordSuccess } from './login-limiter.js'
import {
  SESSION_TTL_MS,
  issueSession,
  revokeSession,
  verifySession,
  type AdminSession,
} from './session-cookie.js'

// Admin page for the WhatsApp sessions: health, re-linking (pairing code or QR)
// and lifecycle actions. Served by the collector because it already holds the
// WAHA API key; WAHA itself is never exposed.
//
// Who can do what:
// - Logged-in admin (cookie): everything.
// - ADMIN_API_TOKEN bearer: read-only overview, for diagnostics. It can never
//   fetch a QR or pairing code — either one links a device to the number.

const COOKIE = 'omb_admin'
const SESSION_NAME = /^[A-Za-z0-9_-]{1,64}$/
const ACTIONS: ReadonlySet<string> = new Set<SessionAction>(['start', 'stop', 'restart', 'logout'])

const asset = (name: string) => readFileSync(new URL(`./static/${name}`, import.meta.url))
const PAGE = asset('index.html')
const SCRIPT = asset('app.js')
const STYLES = asset('app.css')

const SECURITY_HEADERS = {
  'cache-control': 'no-store',
  'content-security-policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
    "connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
}

type Actor = { kind: 'admin'; session: AdminSession } | { kind: 'token' }

interface AdminSecrets {
  username: string
  passwordHash: string
  sessionSecret: string
  apiToken: string | undefined
}

function adminSecrets(): AdminSecrets | null {
  const { ADMIN_USERNAME, ADMIN_PASSWORD_HASH, ADMIN_SESSION_SECRET, ADMIN_API_TOKEN } = config
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD_HASH || !ADMIN_SESSION_SECRET) return null
  return {
    username: ADMIN_USERNAME,
    passwordHash: ADMIN_PASSWORD_HASH,
    sessionSecret: ADMIN_SESSION_SECRET,
    apiToken: ADMIN_API_TOKEN,
  }
}

// Compares digests so neither length nor content leaks through timing.
function safeEqual(a: string, b: string): boolean {
  const da = createHash('sha256').update(a).digest()
  const db = createHash('sha256').update(b).digest()
  return timingSafeEqual(da, db)
}

// nginx overwrites X-Real-IP with the connecting address, and the collector is
// only reachable through nginx (or the internal network), so it can be trusted.
function clientIp(req: FastifyRequest): string {
  const real = req.headers['x-real-ip']
  return typeof real === 'string' && real ? real : req.ip
}

function readCookie(req: FastifyRequest, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return undefined
}

function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${COOKIE}=${token}; Path=/admin; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Strict`
}

export function registerAdminRoutes(server: FastifyInstance, logger: Logger): void {
  const secrets = adminSecrets()
  if (!secrets) {
    logger.warn('ADMIN_* not configured — admin page disabled')
    server.get('/admin', async (_req, reply) =>
      reply.status(404).type('text/plain').send('Admin page is not configured.'),
    )
    return
  }
  const s = secrets
  const allowedOrigin = new URL(config.PUBLIC_BASE_URL).origin

  function actorOf(req: FastifyRequest): Actor | null {
    const session = verifySession(readCookie(req, COOKIE), s.sessionSecret, s.passwordHash)
    if (session) return { kind: 'admin', session }
    const auth = req.headers.authorization
    if (s.apiToken && auth?.startsWith('Bearer ') && safeEqual(auth.slice(7), s.apiToken)) {
      return { kind: 'token' }
    }
    return null
  }

  function audit(
    req: FastifyRequest,
    actor: string,
    action: string,
    target: string | null,
    ok: boolean,
    detail?: string,
  ) {
    const entry = recordAudit({ actor, ip: clientIp(req), action, target, ok, detail })
    logger.info({ admin: entry }, 'Admin audit')
  }

  // Cross-site request forgery: state-changing requests must come from this
  // site's own page and carry JSON, which a plain cross-site form cannot send.
  function rejectCrossSite(req: FastifyRequest, reply: FastifyReply): boolean {
    const contentType = req.headers['content-type'] ?? ''
    if (req.headers.origin !== allowedOrigin) {
      reply.status(403).send({ error: 'Forbidden origin' })
      return true
    }
    if (!contentType.startsWith('application/json')) {
      reply.status(415).send({ error: 'Expected application/json' })
      return true
    }
    return false
  }

  function requireAdmin(req: FastifyRequest, reply: FastifyReply): AdminSession | null {
    const actor = actorOf(req)
    if (actor?.kind !== 'admin') {
      reply.status(actor ? 403 : 401).send({ error: actor ? 'Read-only token' : 'Not logged in' })
      return null
    }
    return actor.session
  }

  function sessionParam(req: FastifyRequest, reply: FastifyReply): string | null {
    const { name } = req.params as { name: string }
    if (!SESSION_NAME.test(name)) {
      reply.status(400).send({ error: 'Invalid session name' })
      return null
    }
    return name
  }

  // ---------------------------------------------------------------- page

  server.get('/admin', async (_req, reply) =>
    reply.headers(SECURITY_HEADERS).type('text/html; charset=utf-8').send(PAGE),
  )
  server.get('/admin/app.js', async (_req, reply) =>
    reply.headers(SECURITY_HEADERS).type('text/javascript; charset=utf-8').send(SCRIPT),
  )
  server.get('/admin/app.css', async (_req, reply) =>
    reply.headers(SECURITY_HEADERS).type('text/css; charset=utf-8').send(STYLES),
  )

  // ---------------------------------------------------------------- auth

  server.post('/admin/api/login', async (req, reply) => {
    if (rejectCrossSite(req, reply)) return
    const ip = clientIp(req)
    const limit = checkLogin(ip)
    if (!limit.allowed) {
      audit(req, 'anonymous', 'login', null, false, 'rate limited')
      return reply
        .status(429)
        .header('retry-after', Math.ceil(limit.retryAfterMs / 1000))
        .send({ error: 'Too many failed attempts. Try again later.' })
    }

    const body = (req.body ?? {}) as { username?: unknown; password?: unknown }
    const username = typeof body.username === 'string' ? body.username : ''
    const password = typeof body.password === 'string' ? body.password : ''
    // Always run the hash, so a wrong username takes as long as a wrong password.
    const passwordOk =
      password.length > 0 && password.length <= 1024
        ? await verifyPassword(password, s.passwordHash)
        : false
    if (!(safeEqual(username, s.username) && passwordOk)) {
      recordFailure(ip)
      audit(req, username.slice(0, 64) || 'anonymous', 'login', null, false)
      return reply.status(401).send({ error: 'Wrong username or password' })
    }

    recordSuccess(ip)
    const { token } = issueSession(s.username, s.sessionSecret, s.passwordHash)
    audit(req, s.username, 'login', null, true)
    return reply
      .header('set-cookie', sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000)))
      .send({ username: s.username })
  })

  server.post('/admin/api/logout', async (req, reply) => {
    if (rejectCrossSite(req, reply)) return
    const actor = actorOf(req)
    if (actor?.kind === 'admin') {
      revokeSession(actor.session)
      audit(req, actor.session.username, 'logout', null, true)
    }
    return reply.header('set-cookie', sessionCookie('', 0)).send({ ok: true })
  })

  server.get('/admin/api/me', async (req, reply) => {
    const actor = actorOf(req)
    if (!actor) return reply.status(401).send({ error: 'Not logged in' })
    return actor.kind === 'admin'
      ? { username: actor.session.username, readOnly: false }
      : { username: 'api-token', readOnly: true }
  })

  // ------------------------------------------------------------ overview

  server.get('/admin/api/overview', async (req, reply) => {
    const actor = actorOf(req)
    if (!actor) return reply.status(401).send({ error: 'Not logged in' })

    const [serverResult, sessionsResult] = await Promise.allSettled([
      getServerInfo(),
      listSessions(),
    ])
    const sessions = sessionsResult.status === 'fulfilled' ? sessionsResult.value : []
    for (const session of sessions) recordMe(session.name, session.me?.id)

    // Sessions the collector has seen activity for but WAHA no longer lists
    // (deleted) still show, so their history is not silently lost.
    const names = new Set([config.WAHA_SESSION, ...sessions.map((x) => x.name)])
    return {
      now: Date.now(),
      readOnly: actor.kind === 'token',
      collector: { startedAt: getCollectorStartedAt(), session: config.WAHA_SESSION },
      waha:
        serverResult.status === 'fulfilled'
          ? { reachable: true, ...serverResult.value }
          : {
              reachable: false,
              error: String(serverResult.reason?.message ?? serverResult.reason),
            },
      sessionsError:
        sessionsResult.status === 'rejected' ? String(sessionsResult.reason?.message) : null,
      sessions: [...names].sort().map((name) => {
        const live = sessions.find((x) => x.name === name)
        return {
          name,
          status: live?.status ?? 'UNKNOWN',
          me: live?.me ?? null,
          ingests: name === config.WAHA_SESSION,
          activity: getActivity(name),
        }
      }),
      audit: getAudit().slice(0, 50),
    }
  })

  // ------------------------------------------------------------- linking

  server.get('/admin/api/sessions/:name/qr', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const name = sessionParam(req, reply)
    if (!name) return
    try {
      const png = await getQrCodePng(name)
      return reply.headers({ 'cache-control': 'no-store' }).type('image/png').send(png)
    } catch (err) {
      logger.warn({ err, session: name }, 'Admin QR fetch failed')
      return reply
        .status(409)
        .send({ error: 'No QR code available — is the session waiting to pair?' })
    }
  })

  server.post('/admin/api/sessions/:name/pairing-code', async (req, reply) => {
    if (rejectCrossSite(req, reply)) return
    const admin = requireAdmin(req, reply)
    if (!admin) return
    const name = sessionParam(req, reply)
    if (!name) return

    const raw = (req.body as { phoneNumber?: unknown } | undefined)?.phoneNumber
    const phoneNumber = typeof raw === 'string' ? raw.replace(/[\s()+-]/g, '') : ''
    if (!/^\d{8,15}$/.test(phoneNumber)) {
      return reply
        .status(400)
        .send({ error: 'Phone number in international format, e.g. 27821234567' })
    }
    try {
      const code = await requestPairingCode(name, phoneNumber)
      // The code itself is never logged: it links a device to the number.
      audit(req, admin.username, 'pairing-code', name, true, phoneNumber)
      return { code }
    } catch (err) {
      audit(req, admin.username, 'pairing-code', name, false, (err as Error).message)
      return reply.status(502).send({ error: (err as Error).message })
    }
  })

  // -------------------------------------------------------------- actions

  server.post('/admin/api/sessions/:name/:action', async (req, reply) => {
    if (rejectCrossSite(req, reply)) return
    const admin = requireAdmin(req, reply)
    if (!admin) return
    const name = sessionParam(req, reply)
    if (!name) return
    const { action } = req.params as { action: string }
    if (!ACTIONS.has(action)) return reply.status(404).send({ error: 'Unknown action' })

    try {
      await sessionAction(name, action as SessionAction)
      audit(req, admin.username, action, name, true)
      return { ok: true }
    } catch (err) {
      audit(req, admin.username, action, name, false, (err as Error).message)
      return reply.status(502).send({ error: (err as Error).message })
    }
  })

  server.post('/admin/api/server/restart', async (req, reply) => {
    if (rejectCrossSite(req, reply)) return
    const admin = requireAdmin(req, reply)
    if (!admin) return
    try {
      await restartServer()
      audit(req, admin.username, 'restart-waha', null, true)
      return { ok: true }
    } catch (err) {
      audit(req, admin.username, 'restart-waha', null, false, (err as Error).message)
      return reply.status(502).send({ error: (err as Error).message })
    }
  })
}
