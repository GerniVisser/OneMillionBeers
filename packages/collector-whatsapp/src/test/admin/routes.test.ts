import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { pino } from 'pino'
import { hashPassword } from '../../admin/password.js'

const mockListSessions = vi.fn()
const mockGetServerInfo = vi.fn()
const mockSessionAction = vi.fn()
const mockRequestPairingCode = vi.fn()
const mockRestartServer = vi.fn()
const mockGetQrCodePng = vi.fn()

vi.mock('../../waha-client.js', () => ({
  listSessions: mockListSessions,
  getServerInfo: mockGetServerInfo,
  sessionAction: mockSessionAction,
  requestPairingCode: mockRequestPairingCode,
  restartServer: mockRestartServer,
  getQrCodePng: mockGetQrCodePng,
}))

const ORIGIN = 'https://omb.example'
const testConfig: Record<string, unknown> = {}
vi.mock('../../config.js', () => ({
  get config() {
    return testConfig
  },
}))

const PASSWORD = 'a-long-password-from-a-manager'
const API_TOKEN = 'r'.repeat(40)
let passwordHash: string
const logger = pino({ level: 'silent' })

const JSON_POST = { origin: ORIGIN, 'content-type': 'application/json' }

async function build(): Promise<FastifyInstance> {
  const { registerAdminRoutes } = await import('../../admin/routes.js')
  const server = Fastify()
  registerAdminRoutes(server, logger)
  await server.ready()
  return server
}

async function login(server: FastifyInstance, ip = '203.0.113.7'): Promise<string> {
  const res = await server.inject({
    method: 'POST',
    url: '/admin/api/login',
    headers: { ...JSON_POST, 'x-real-ip': ip },
    payload: { username: 'gerni', password: PASSWORD },
  })
  expect(res.statusCode).toBe(200)
  return String(res.headers['set-cookie']).split(';')[0]
}

describe('admin routes', () => {
  beforeAll(async () => {
    passwordHash = await hashPassword(PASSWORD, { N: 2 ** 14, r: 8, p: 1 })
  })

  beforeEach(async () => {
    vi.resetModules()
    Object.assign(testConfig, {
      WAHA_SESSION: 'default',
      PUBLIC_BASE_URL: ORIGIN,
      ADMIN_USERNAME: 'gerni',
      ADMIN_PASSWORD_HASH: passwordHash,
      ADMIN_SESSION_SECRET: 's'.repeat(32),
      ADMIN_API_TOKEN: API_TOKEN,
    })
    for (const m of [
      mockListSessions,
      mockGetServerInfo,
      mockSessionAction,
      mockRequestPairingCode,
      mockRestartServer,
      mockGetQrCodePng,
    ]) {
      m.mockReset()
    }
    mockListSessions.mockResolvedValue([
      { name: 'default', status: 'WORKING', me: { id: '27733514583@c.us', pushName: 'OMB' } },
      { name: 'backup', status: 'FAILED', me: null },
    ])
    mockGetServerInfo.mockResolvedValue({
      version: '2026.9.2',
      engine: 'NOWEB',
      startedAt: 1,
      uptimeMs: 2,
    })
    mockSessionAction.mockResolvedValue(undefined)
    mockRestartServer.mockResolvedValue(undefined)
    mockRequestPairingCode.mockResolvedValue('ABCD-1234')
    mockGetQrCodePng.mockResolvedValue(Buffer.from('png'))
  })

  describe('when not configured', () => {
    it('serves no admin page at all', async () => {
      testConfig.ADMIN_PASSWORD_HASH = undefined
      const server = await build()
      expect((await server.inject('/admin')).statusCode).toBe(404)
      expect((await server.inject('/admin/api/overview')).statusCode).toBe(404)
    })
  })

  describe('page', () => {
    it('serves the page with strict security headers', async () => {
      const server = await build()
      const res = await server.inject('/admin')
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('text/html')
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'")
      expect(res.headers['content-security-policy']).toContain("script-src 'self'")
      expect(res.headers['x-frame-options']).toBe('DENY')
      expect(res.headers['cache-control']).toBe('no-store')
      expect(res.body).toContain('/admin/app.js')
    })

    it('serves the script and stylesheet', async () => {
      const server = await build()
      expect((await server.inject('/admin/app.js')).headers['content-type']).toContain('javascript')
      expect((await server.inject('/admin/app.css')).headers['content-type']).toContain('text/css')
    })
  })

  describe('login', () => {
    it('sets a locked-down session cookie for the right credentials', async () => {
      const server = await build()
      const res = await server.inject({
        method: 'POST',
        url: '/admin/api/login',
        headers: JSON_POST,
        payload: { username: 'gerni', password: PASSWORD },
      })
      expect(res.statusCode).toBe(200)
      const cookie = String(res.headers['set-cookie'])
      expect(cookie).toMatch(/^omb_admin=[^;]+\./)
      for (const flag of [
        'HttpOnly',
        'Secure',
        'SameSite=Strict',
        'Path=/admin',
        'Max-Age=2592000',
      ]) {
        expect(cookie).toContain(flag)
      }
    })

    it.each([
      ['wrong password', { username: 'gerni', password: 'nope' }],
      ['wrong username', { username: 'admin', password: PASSWORD }],
      ['missing fields', {}],
      ['oversized password', { username: 'gerni', password: 'x'.repeat(5000) }],
    ])('rejects %s with one generic message', async (_label, payload) => {
      const server = await build()
      const res = await server.inject({
        method: 'POST',
        url: '/admin/api/login',
        headers: JSON_POST,
        payload,
      })
      expect(res.statusCode).toBe(401)
      expect(res.json()).toEqual({ error: 'Wrong username or password' })
      expect(res.headers['set-cookie']).toBeUndefined()
    })

    it('rejects a login posted from another site', async () => {
      const server = await build()
      const res = await server.inject({
        method: 'POST',
        url: '/admin/api/login',
        headers: { ...JSON_POST, origin: 'https://evil.example' },
        payload: { username: 'gerni', password: PASSWORD },
      })
      expect(res.statusCode).toBe(403)
    })

    it('locks the client IP out after 5 failures, then also refuses the right password', async () => {
      const server = await build()
      const attempt = (password: string, ip = '198.51.100.1') =>
        server.inject({
          method: 'POST',
          url: '/admin/api/login',
          headers: { ...JSON_POST, 'x-real-ip': ip },
          payload: { username: 'gerni', password },
        })
      for (let i = 0; i < 5; i++) expect((await attempt('wrong')).statusCode).toBe(401)
      const locked = await attempt(PASSWORD)
      expect(locked.statusCode).toBe(429)
      expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0)
      // Another address is unaffected.
      expect((await attempt(PASSWORD, '198.51.100.2')).statusCode).toBe(200)
    })

    it('logs failed and successful logins to the audit trail', async () => {
      const server = await build()
      await server.inject({
        method: 'POST',
        url: '/admin/api/login',
        headers: { ...JSON_POST, 'x-real-ip': '192.0.2.9' },
        payload: { username: 'gerni', password: 'nope' },
      })
      const cookie = await login(server, '192.0.2.9')
      const audit = (
        await server.inject({ url: '/admin/api/overview', headers: { cookie } })
      ).json().audit
      expect(audit.slice(0, 2)).toMatchObject([
        { action: 'login', ok: true, actor: 'gerni', ip: '192.0.2.9' },
        { action: 'login', ok: false, ip: '192.0.2.9' },
      ])
    })
  })

  describe('session', () => {
    it('requires a login for the overview', async () => {
      const server = await build()
      expect((await server.inject('/admin/api/overview')).statusCode).toBe(401)
      expect((await server.inject('/admin/api/me')).statusCode).toBe(401)
    })

    it('rejects a forged cookie', async () => {
      const server = await build()
      const cookie = await login(server)
      const forged = cookie.slice(0, -2) + (cookie.endsWith('AA') ? 'BB' : 'AA')
      const res = await server.inject({ url: '/admin/api/overview', headers: { cookie: forged } })
      expect(res.statusCode).toBe(401)
    })

    it('logs out: the old cookie stops working', async () => {
      const server = await build()
      const cookie = await login(server)
      const out = await server.inject({
        method: 'POST',
        url: '/admin/api/logout',
        headers: { ...JSON_POST, cookie },
        payload: {},
      })
      expect(String(out.headers['set-cookie'])).toContain('Max-Age=0')
      const res = await server.inject({ url: '/admin/api/overview', headers: { cookie } })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('overview', () => {
    it('combines WAHA status with collector activity', async () => {
      const server = await build()
      const cookie = await login(server)
      const res = await server.inject({ url: '/admin/api/overview', headers: { cookie } })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.readOnly).toBe(false)
      expect(body.waha).toMatchObject({ reachable: true, version: '2026.9.2' })
      expect(body.sessions.map((s: { name: string }) => s.name)).toEqual(['backup', 'default'])
      expect(body.sessions[1]).toMatchObject({
        name: 'default',
        status: 'WORKING',
        ingests: true,
        activity: { lastKnownMe: '27733514583@c.us' },
      })
    })

    it('still answers when WAHA is down', async () => {
      mockGetServerInfo.mockRejectedValue(new Error('connect ECONNREFUSED'))
      mockListSessions.mockRejectedValue(new Error('connect ECONNREFUSED'))
      const server = await build()
      const cookie = await login(server)
      const body = (await server.inject({ url: '/admin/api/overview', headers: { cookie } })).json()
      expect(body.waha).toEqual({ reachable: false, error: 'connect ECONNREFUSED' })
      expect(body.sessions).toMatchObject([{ name: 'default', status: 'UNKNOWN' }])
    })
  })

  describe('read-only API token', () => {
    const bearer = { authorization: `Bearer ${API_TOKEN}` }

    it('reads the overview', async () => {
      const server = await build()
      const res = await server.inject({ url: '/admin/api/overview', headers: bearer })
      expect(res.statusCode).toBe(200)
      expect(res.json().readOnly).toBe(true)
    })

    it('rejects a wrong token', async () => {
      const server = await build()
      const res = await server.inject({
        url: '/admin/api/overview',
        headers: { authorization: `Bearer ${'x'.repeat(40)}` },
      })
      expect(res.statusCode).toBe(401)
    })

    it('can never act, nor see a QR or pairing code', async () => {
      const server = await build()
      const calls = [
        { method: 'POST' as const, url: '/admin/api/sessions/default/restart', payload: {} },
        { method: 'POST' as const, url: '/admin/api/server/restart', payload: {} },
        {
          method: 'POST' as const,
          url: '/admin/api/sessions/default/pairing-code',
          payload: { phoneNumber: '27733514583' },
        },
        { method: 'GET' as const, url: '/admin/api/sessions/default/qr' },
      ]
      for (const call of calls) {
        const res = await server.inject({ ...call, headers: { ...JSON_POST, ...bearer } })
        expect(res.statusCode, call.url).toBe(403)
      }
      expect(mockSessionAction).not.toHaveBeenCalled()
      expect(mockRestartServer).not.toHaveBeenCalled()
      expect(mockRequestPairingCode).not.toHaveBeenCalled()
      expect(mockGetQrCodePng).not.toHaveBeenCalled()
    })

    it('is not accepted when no token is configured', async () => {
      testConfig.ADMIN_API_TOKEN = undefined
      const server = await build()
      const res = await server.inject({ url: '/admin/api/overview', headers: bearer })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('actions', () => {
    it.each(['start', 'stop', 'restart', 'logout'])('runs %s on a session', async (action) => {
      const server = await build()
      const cookie = await login(server)
      const res = await server.inject({
        method: 'POST',
        url: `/admin/api/sessions/backup/${action}`,
        headers: { ...JSON_POST, cookie },
        payload: {},
      })
      expect(res.statusCode).toBe(200)
      expect(mockSessionAction).toHaveBeenCalledWith('backup', action)
    })

    it('restarts WAHA', async () => {
      const server = await build()
      const cookie = await login(server)
      const res = await server.inject({
        method: 'POST',
        url: '/admin/api/server/restart',
        headers: { ...JSON_POST, cookie },
        payload: {},
      })
      expect(res.statusCode).toBe(200)
      expect(mockRestartServer).toHaveBeenCalledOnce()
    })

    it('refuses an action without the site origin, even when logged in', async () => {
      const server = await build()
      const cookie = await login(server)
      for (const headers of [
        { 'content-type': 'application/json', cookie },
        { origin: 'https://evil.example', 'content-type': 'application/json', cookie },
      ]) {
        const res = await server.inject({
          method: 'POST',
          url: '/admin/api/sessions/default/logout',
          headers,
          payload: {},
        })
        expect(res.statusCode).toBe(403)
      }
      expect(mockSessionAction).not.toHaveBeenCalled()
    })

    it('rejects unknown actions and unsafe session names', async () => {
      const server = await build()
      const cookie = await login(server)
      const post = (url: string) =>
        server.inject({ method: 'POST', url, headers: { ...JSON_POST, cookie }, payload: {} })
      expect((await post('/admin/api/sessions/default/delete')).statusCode).toBe(404)
      expect((await post('/admin/api/sessions/a%2F..%2Fserver/restart')).statusCode).toBe(400)
      expect(mockSessionAction).not.toHaveBeenCalled()
    })

    it('reports a WAHA failure and audits it', async () => {
      mockSessionAction.mockRejectedValue(new Error('WAHA restart session returned 500'))
      const server = await build()
      const cookie = await login(server)
      const res = await server.inject({
        method: 'POST',
        url: '/admin/api/sessions/default/restart',
        headers: { ...JSON_POST, cookie },
        payload: {},
      })
      expect(res.statusCode).toBe(502)
      const audit = (
        await server.inject({ url: '/admin/api/overview', headers: { cookie } })
      ).json().audit
      expect(audit[0]).toMatchObject({ action: 'restart', target: 'default', ok: false })
    })
  })

  describe('linking', () => {
    it('returns a pairing code for a normalised phone number, without logging the code', async () => {
      const server = await build()
      const cookie = await login(server)
      const res = await server.inject({
        method: 'POST',
        url: '/admin/api/sessions/backup/pairing-code',
        headers: { ...JSON_POST, cookie },
        payload: { phoneNumber: '+27 73 351-4583' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ code: 'ABCD-1234' })
      expect(mockRequestPairingCode).toHaveBeenCalledWith('backup', '27733514583')
      const overview = await server.inject({ url: '/admin/api/overview', headers: { cookie } })
      expect(overview.body).not.toContain('ABCD-1234')
    })

    it('rejects a local number with a leading 0 and says how to fix it', async () => {
      const server = await build()
      const cookie = await login(server)
      const res = await server.inject({
        method: 'POST',
        url: '/admin/api/sessions/backup/pairing-code',
        headers: { ...JSON_POST, cookie },
        payload: { phoneNumber: '073 351 4583' },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toContain('without the leading 0')
      expect(mockRequestPairingCode).not.toHaveBeenCalled()
    })

    it.each(['', '123', 'abc', '1'.repeat(16)])('rejects phone number %j', async (phoneNumber) => {
      const server = await build()
      const cookie = await login(server)
      const res = await server.inject({
        method: 'POST',
        url: '/admin/api/sessions/backup/pairing-code',
        headers: { ...JSON_POST, cookie },
        payload: { phoneNumber },
      })
      expect(res.statusCode).toBe(400)
      expect(mockRequestPairingCode).not.toHaveBeenCalled()
    })

    it('serves the QR code uncached', async () => {
      const server = await build()
      const cookie = await login(server)
      const res = await server.inject({ url: '/admin/api/sessions/backup/qr', headers: { cookie } })
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toBe('image/png')
      expect(res.headers['cache-control']).toBe('no-store')
      expect(mockGetQrCodePng).toHaveBeenCalledWith('backup')
    })

    it('answers 409 when the session has no QR code', async () => {
      mockGetQrCodePng.mockRejectedValue(new Error('WAHA getQrCodePng returned 422'))
      const server = await build()
      const cookie = await login(server)
      const res = await server.inject({
        url: '/admin/api/sessions/default/qr',
        headers: { cookie },
      })
      expect(res.statusCode).toBe(409)
    })
  })
})
