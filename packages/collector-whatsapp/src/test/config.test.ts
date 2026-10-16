import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const REQUIRED_ENV = {
  BACKEND_URL: 'http://backend:3000',
  INTERNAL_API_TOKEN: 'test-internal-token-at-least-32-chars-long',
  STORAGE_ENDPOINT: 'http://minio:9000',
  STORAGE_PUBLIC_URL: 'http://localhost:9000',
  STORAGE_BUCKET: 'omb-photos',
  STORAGE_REGION: 'auto',
  WAHA_BASE_URL: 'http://waha:3000',
  WAHA_API_KEY: 'test-api-key',
  WAHA_WEBHOOK_URL: 'http://collector:8080/webhook',
  PUBLIC_BASE_URL: 'http://localhost:8080',
}

describe('config', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    for (const [k, v] of Object.entries(REQUIRED_ENV)) {
      vi.stubEnv(k, v)
    }
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('parses all required vars without throwing', async () => {
    const { config } = await import('../config.js')
    expect(config.WAHA_BASE_URL).toBe('http://waha:3000')
    expect(config.WAHA_API_KEY).toBe('test-api-key')
  })

  it('calls process.exit(1) when WAHA_BASE_URL is missing', async () => {
    vi.stubEnv('WAHA_BASE_URL', '')
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })
    await expect(import('../config.js')).rejects.toThrow('process.exit called')
    expect(exitSpy).toHaveBeenCalledWith(1)
    exitSpy.mockRestore()
  })

  it('defaults WAHA_SESSION to "default"', async () => {
    const { config } = await import('../config.js')
    expect(config.WAHA_SESSION).toBe('default')
  })

  it('defaults COLLECTOR_PORT to 8080', async () => {
    const { config } = await import('../config.js')
    expect(config.COLLECTOR_PORT).toBe(8080)
  })

  it('defaults WAHA_POLL_INTERVAL_MS to 1800000', async () => {
    const { config } = await import('../config.js')
    expect(config.WAHA_POLL_INTERVAL_MS).toBe(1_800_000)
  })

  it('defaults ENABLE_ALERTS to false', async () => {
    const { config } = await import('../config.js')
    expect(config.ENABLE_ALERTS).toBe(false)
  })

  it('allows ALERT_EMAIL, SES_FROM_EMAIL, AWS_REGION to be absent when ENABLE_ALERTS=false', async () => {
    const { config } = await import('../config.js')
    expect(config.ALERT_EMAIL).toBeUndefined()
    expect(config.SES_FROM_EMAIL).toBeUndefined()
    expect(config.AWS_REGION).toBeUndefined()
  })

  it('allows ALERT_EMAIL, SES_FROM_EMAIL, AWS_REGION to be absent even when ENABLE_ALERTS=true', async () => {
    vi.stubEnv('ENABLE_ALERTS', 'true')
    const { config } = await import('../config.js')
    expect(config.ENABLE_ALERTS).toBe(true)
    expect(config.ALERT_EMAIL).toBeUndefined()
  })

  describe('admin page settings', () => {
    const ADMIN = {
      ADMIN_USERNAME: 'gerni',
      ADMIN_PASSWORD_HASH:
        'scrypt:32768:8:1:c2FsdHNhbHRzYWx0c2FsdA:a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2U',
      ADMIN_SESSION_SECRET: 'x'.repeat(32),
    }

    function expectExit() {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called')
      })
      return {
        async check() {
          await expect(import('../config.js')).rejects.toThrow('process.exit called')
          expect(exitSpy).toHaveBeenCalledWith(1)
          exitSpy.mockRestore()
        },
      }
    }

    it('leaves the admin page disabled when none are set', async () => {
      const { config } = await import('../config.js')
      expect(config.ADMIN_USERNAME).toBeUndefined()
      expect(config.ADMIN_PASSWORD_HASH).toBeUndefined()
    })

    it('treats empty strings (unset compose variables) as absent', async () => {
      for (const k of [...Object.keys(ADMIN), 'ADMIN_API_TOKEN']) vi.stubEnv(k, '')
      const { config } = await import('../config.js')
      expect(config.ADMIN_USERNAME).toBeUndefined()
      expect(config.ADMIN_API_TOKEN).toBeUndefined()
    })

    it('accepts all three together, with an optional API token', async () => {
      for (const [k, v] of Object.entries(ADMIN)) vi.stubEnv(k, v)
      vi.stubEnv('ADMIN_API_TOKEN', 't'.repeat(32))
      const { config } = await import('../config.js')
      expect(config.ADMIN_USERNAME).toBe('gerni')
      expect(config.ADMIN_API_TOKEN).toBe('t'.repeat(32))
    })

    it('exits when only some of the three are set', async () => {
      vi.stubEnv('ADMIN_USERNAME', 'gerni')
      await expectExit().check()
    })

    it('exits when the password hash is not a scrypt hash', async () => {
      for (const [k, v] of Object.entries(ADMIN)) vi.stubEnv(k, v)
      vi.stubEnv('ADMIN_PASSWORD_HASH', 'plaintext-password')
      await expectExit().check()
    })

    it('exits when the session secret is shorter than 32 characters', async () => {
      for (const [k, v] of Object.entries(ADMIN)) vi.stubEnv(k, v)
      vi.stubEnv('ADMIN_SESSION_SECRET', 'short')
      await expectExit().check()
    })

    it('exits when the API token is shorter than 32 characters', async () => {
      vi.stubEnv('ADMIN_API_TOKEN', 'short')
      await expectExit().check()
    })
  })
})
