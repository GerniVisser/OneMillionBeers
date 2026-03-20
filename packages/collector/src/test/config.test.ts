import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('shared config', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function stubValidEnv() {
    vi.stubEnv('BACKEND_URL', 'http://localhost:3000')
    vi.stubEnv('STORAGE_ENDPOINT', 'http://localhost:9000')
    vi.stubEnv('STORAGE_PUBLIC_URL', 'http://localhost:9000')
    vi.stubEnv('STORAGE_BUCKET', 'omb-photos')
    vi.stubEnv('STORAGE_KEY', 'key')
    vi.stubEnv('STORAGE_SECRET', 'secret')
    // STORAGE_REGION is optional (defaults to 'auto') — not stubbed here intentionally
  }

  it('parses valid environment and exports config', async () => {
    stubValidEnv()
    vi.stubEnv('LOG_LEVEL', 'debug')

    const { config } = await import('../config.js')

    expect(config.BACKEND_URL).toBe('http://localhost:3000')
    expect(config.STORAGE_BUCKET).toBe('omb-photos')
    expect(config.LOG_LEVEL).toBe('debug')
  })

  it('defaults COLLECTOR to telegram and LOG_LEVEL to info when not set', async () => {
    stubValidEnv()

    const { config } = await import('../config.js')

    expect(config.COLLECTOR).toBe('telegram')
    expect(config.LOG_LEVEL).toBe('info')
  })

  it('calls process.exit(1) when BACKEND_URL is missing', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })
    // Omit BACKEND_URL intentionally
    vi.stubEnv('STORAGE_ENDPOINT', 'http://localhost:9000')
    vi.stubEnv('STORAGE_BUCKET', 'omb-photos')
    vi.stubEnv('STORAGE_KEY', 'key')
    vi.stubEnv('STORAGE_SECRET', 'secret')

    await expect(import('../config.js')).rejects.toThrow('process.exit called')
    expect(exitSpy).toHaveBeenCalledWith(1)
    exitSpy.mockRestore()
  })

  it('calls process.exit(1) when STORAGE_ENDPOINT is not a valid URL', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })
    vi.stubEnv('BACKEND_URL', 'http://localhost:3000')
    vi.stubEnv('STORAGE_ENDPOINT', 'not-a-url')
    vi.stubEnv('STORAGE_BUCKET', 'omb-photos')
    vi.stubEnv('STORAGE_KEY', 'key')
    vi.stubEnv('STORAGE_SECRET', 'secret')

    await expect(import('../config.js')).rejects.toThrow('process.exit called')
    expect(exitSpy).toHaveBeenCalledWith(1)
    exitSpy.mockRestore()
  })
})
