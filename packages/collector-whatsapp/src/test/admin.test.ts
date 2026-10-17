import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { pino } from 'pino'

const mockListSessions = vi.fn()
const mockSessionAction = vi.fn()
const mockGetQrCodePng = vi.fn()
const mockRequestPairingCode = vi.fn()

vi.mock('../waha-client.js', () => ({
  listSessions: mockListSessions,
  sessionAction: mockSessionAction,
  getQrCodePng: mockGetQrCodePng,
  requestPairingCode: mockRequestPairingCode,
}))

const testConfig = { WAHA_SESSIONS: ['prod', 'backup'] }
vi.mock('../config.js', () => ({
  get config() {
    return testConfig
  },
}))

const logger = pino({ level: 'silent' })

async function buildAdmin() {
  const Fastify = (await import('fastify')).default
  const { registerAdminRoutes } = await import('../admin.js')
  const server = Fastify({ logger: false })
  registerAdminRoutes(server, logger)
  await server.ready()
  return server
}

describe('admin', () => {
  beforeEach(() => {
    vi.resetModules()
    mockListSessions.mockReset()
    mockSessionAction.mockReset()
    mockGetQrCodePng.mockReset()
    mockRequestPairingCode.mockReset()
    mockSessionAction.mockResolvedValue(undefined)
    testConfig.WAHA_SESSIONS = ['prod', 'backup']
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('GET /admin/api/overview', () => {
    it('lists the configured sessions in order with their linked number', async () => {
      mockListSessions.mockResolvedValue([
        { name: 'backup', status: 'WORKING', phone: '27820000002', pushName: 'B' },
        { name: 'prod', status: 'SCAN_QR_CODE', phone: null, pushName: null },
      ])
      const server = await buildAdmin()
      const res = await server.inject({ method: 'GET', url: '/admin/api/overview' })

      expect(res.json().sessions.map((s: { name: string }) => s.name)).toEqual(['prod', 'backup'])
      expect(res.json().sessions[1]).toMatchObject({ phone: '27820000002', status: 'WORKING' })
      await server.close()
    })

    it('reports a configured session WAHA has never heard of as MISSING', async () => {
      mockListSessions.mockResolvedValue([
        { name: 'prod', status: 'WORKING', phone: '1', pushName: null },
      ])
      const server = await buildAdmin()
      const res = await server.inject({ method: 'GET', url: '/admin/api/overview' })

      expect(res.json().sessions[1]).toMatchObject({ name: 'backup', status: 'MISSING' })
      await server.close()
    })

    it('reports sessions WAHA has that we do not manage', async () => {
      mockListSessions.mockResolvedValue([
        { name: 'prod', status: 'WORKING', phone: '1', pushName: null },
        { name: 'backup', status: 'WORKING', phone: '2', pushName: null },
        { name: 'leftover', status: 'STOPPED', phone: null, pushName: null },
      ])
      const server = await buildAdmin()
      const res = await server.inject({ method: 'GET', url: '/admin/api/overview' })

      expect(res.json().unmanaged).toEqual(['leftover'])
      await server.close()
    })

    it('says WAHA is unreachable rather than failing the page', async () => {
      mockListSessions.mockRejectedValue(new Error('connect ECONNREFUSED'))
      const server = await buildAdmin()
      const res = await server.inject({ method: 'GET', url: '/admin/api/overview' })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ wahaReachable: false, sessions: [], unmanaged: [] })
      await server.close()
    })
  })

  describe('session actions', () => {
    it.each(['start', 'stop', 'restart', 'logout'])('performs %s', async (action) => {
      const server = await buildAdmin()
      const res = await server.inject({ method: 'POST', url: `/admin/api/sessions/prod/${action}` })

      expect(res.statusCode).toBe(200)
      expect(mockSessionAction).toHaveBeenCalledWith('prod', action)
      await server.close()
    })

    it('refuses a session that is not configured', async () => {
      const server = await buildAdmin()
      const res = await server.inject({
        method: 'POST',
        url: '/admin/api/sessions/..%2F..%2Fserver%2Fstop/restart',
      })

      expect(res.statusCode).toBe(404)
      expect(mockSessionAction).not.toHaveBeenCalled()
      await server.close()
    })

    it('refuses an action that is not in the list', async () => {
      const server = await buildAdmin()
      const res = await server.inject({ method: 'POST', url: '/admin/api/sessions/prod/delete' })

      expect(res.statusCode).toBe(400)
      expect(mockSessionAction).not.toHaveBeenCalled()
      await server.close()
    })

    it('reports a WAHA failure as 502 rather than throwing', async () => {
      mockSessionAction.mockRejectedValue(new Error('WAHA restart returned 500'))
      const server = await buildAdmin()
      const res = await server.inject({ method: 'POST', url: '/admin/api/sessions/prod/restart' })

      expect(res.statusCode).toBe(502)
      await server.close()
    })
  })

  describe('pairing', () => {
    it('returns the code WAHA issued', async () => {
      mockRequestPairingCode.mockResolvedValue({ ok: true, code: 'ABCD1234' })
      const server = await buildAdmin()
      const res = await server.inject({
        method: 'POST',
        url: '/admin/api/sessions/prod/pair',
        payload: { phoneNumber: '27820000001' },
      })

      expect(res.json()).toEqual({ code: 'ABCD1234' })
      expect(mockRequestPairingCode).toHaveBeenCalledWith('prod', '27820000001')
      await server.close()
    })

    it.each(['', '+27 82 000 0001', '123', 'abcdefghij', '1234567890123456'])(
      'rejects the phone number %j before calling WAHA',
      async (phoneNumber) => {
        const server = await buildAdmin()
        const res = await server.inject({
          method: 'POST',
          url: '/admin/api/sessions/prod/pair',
          payload: { phoneNumber },
        })

        expect(res.statusCode).toBe(400)
        expect(mockRequestPairingCode).not.toHaveBeenCalled()
        await server.close()
      },
    )

    it("surfaces WAHA's reason when it refuses", async () => {
      mockRequestPairingCode.mockResolvedValue({
        ok: false,
        message: 'Can request code only in SCAN_QR_CODE status',
      })
      const server = await buildAdmin()
      const res = await server.inject({
        method: 'POST',
        url: '/admin/api/sessions/prod/pair',
        payload: { phoneNumber: '27820000001' },
      })

      expect(res.statusCode).toBe(502)
      expect(res.json().error).toContain('SCAN_QR_CODE')
      await server.close()
    })

    it('never logs the pairing code', async () => {
      const lines: string[] = []
      const capturing = pino({ level: 'trace' }, { write: (l: string) => lines.push(l) })
      mockRequestPairingCode.mockResolvedValue({ ok: true, code: 'SECRET42' })
      const Fastify = (await import('fastify')).default
      const { registerAdminRoutes } = await import('../admin.js')
      const server = Fastify({ logger: false })
      registerAdminRoutes(server, capturing)
      await server.inject({
        method: 'POST',
        url: '/admin/api/sessions/prod/pair',
        payload: { phoneNumber: '27820000001' },
      })

      expect(lines.join('')).not.toContain('SECRET42')
      await server.close()
    })
  })

  describe('QR', () => {
    it('proxies the PNG so the WAHA API key is never exposed', async () => {
      mockGetQrCodePng.mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      const server = await buildAdmin()
      const res = await server.inject({ method: 'GET', url: '/admin/api/sessions/backup/qr' })

      expect(res.headers['content-type']).toBe('image/png')
      expect(mockGetQrCodePng).toHaveBeenCalledWith('backup')
      await server.close()
    })

    it('refuses a session that is not configured', async () => {
      const server = await buildAdmin()
      const res = await server.inject({ method: 'GET', url: '/admin/api/sessions/other/qr' })

      expect(res.statusCode).toBe(404)
      expect(mockGetQrCodePng).not.toHaveBeenCalled()
      await server.close()
    })
  })

  it('serves the page', async () => {
    const server = await buildAdmin()
    const res = await server.inject({ method: 'GET', url: '/admin' })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.body).toContain('WhatsApp numbers')
    await server.close()
  })
})
