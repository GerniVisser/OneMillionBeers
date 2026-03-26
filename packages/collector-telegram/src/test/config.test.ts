import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('telegram config', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('parses valid TELEGRAM_BOT_TOKEN', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ')

    const { telegramConfig } = await import('../config.js')

    expect(telegramConfig.TELEGRAM_BOT_TOKEN).toBe('1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ')
  })

  it('calls process.exit(1) when TELEGRAM_BOT_TOKEN is missing', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })

    await expect(import('../config.js')).rejects.toThrow('process.exit called')
    expect(exitSpy).toHaveBeenCalledWith(1)
    exitSpy.mockRestore()
  })

  it('calls process.exit(1) when TELEGRAM_BOT_TOKEN is empty', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '')

    await expect(import('../config.js')).rejects.toThrow('process.exit called')
    expect(exitSpy).toHaveBeenCalledWith(1)
    exitSpy.mockRestore()
  })
})
