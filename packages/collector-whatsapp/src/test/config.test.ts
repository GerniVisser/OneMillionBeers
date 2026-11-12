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

  it('defaults COLLECTOR_PORT to 8080', async () => {
    const { config } = await import('../config.js')
    expect(config.COLLECTOR_PORT).toBe(8080)
  })

  it('defaults WAHA_POLL_INTERVAL_MS to five minutes', async () => {
    const { config } = await import('../config.js')
    expect(config.WAHA_POLL_INTERVAL_MS).toBe(300_000)
  })

  it('defaults WAHA_GROUP_SYNC_INTERVAL_MS to thirty minutes', async () => {
    const { config } = await import('../config.js')
    expect(config.WAHA_GROUP_SYNC_INTERVAL_MS).toBe(1_800_000)
  })
})
