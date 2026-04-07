import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const REQUIRED_ENV = {
  BACKEND_URL: 'http://backend:3000',
  STORAGE_ENDPOINT: 'http://minio:9000',
  STORAGE_PUBLIC_URL: 'http://localhost:9000',
  STORAGE_BUCKET: 'omb-photos',
  STORAGE_REGION: 'auto',
  WAHA_BASE_URL: 'http://waha:3000',
  WAHA_API_KEY: 'test-api-key',
  WAHA_WEBHOOK_URL: 'http://collector:8080/webhook',
  PUBLIC_BASE_URL: 'http://localhost:8080',
  STATUS_TOKEN: 'test-token',
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
    expect(config.STATUS_TOKEN).toBe('test-token')
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

  it('calls process.exit(1) when STATUS_TOKEN is missing', async () => {
    vi.stubEnv('STATUS_TOKEN', '')
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

  it('defaults WAHA_POLL_INTERVAL_MS to 300000', async () => {
    const { config } = await import('../config.js')
    expect(config.WAHA_POLL_INTERVAL_MS).toBe(300_000)
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
})
