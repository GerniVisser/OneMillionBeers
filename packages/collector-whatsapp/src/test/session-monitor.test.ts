import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { pino } from 'pino'

const mockListSessions = vi.fn()

vi.mock('../waha-client.js', () => ({ listSessions: mockListSessions }))
vi.mock('../config.js', () => ({ config: { WAHA_POLL_INTERVAL_MS: 300_000 } }))

function capture() {
  const lines: Array<Record<string, unknown>> = []
  const logger = pino({ level: 'debug' }, { write: (l: string) => lines.push(JSON.parse(l)) })
  const attention = () =>
    lines.filter((l) => l.msg === 'WhatsApp session requires attention').map((l) => l.session)
  return { logger, attention }
}

describe('session-monitor', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    mockListSessions.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each(['FAILED', 'SCAN_QR_CODE'])('logs the alarm line for %s', async (status) => {
    const { logger, attention } = capture()
    const { handleSessionStatusChange } = await import('../session-monitor.js')
    await handleSessionStatusChange('backup', status, logger)
    expect(attention()).toEqual(['backup'])
  })

  it.each(['WORKING', 'STARTING', 'STOPPED'])(
    'does not log the alarm line for %s',
    async (status) => {
      const { logger, attention } = capture()
      const { handleSessionStatusChange } = await import('../session-monitor.js')
      await handleSessionStatusChange('backup', status, logger)
      expect(attention()).toEqual([])
    },
  )

  it('checks every session WAHA lists at start, then on each poll', async () => {
    mockListSessions.mockResolvedValue([
      { name: 'default', status: 'WORKING' },
      { name: 'backup', status: 'FAILED' },
    ])
    const { logger, attention } = capture()
    const { startPolling } = await import('../session-monitor.js')
    const stop = startPolling(logger)
    await vi.advanceTimersByTimeAsync(0)
    expect(attention()).toEqual(['backup'])

    await vi.advanceTimersByTimeAsync(300_000)
    expect(attention()).toEqual(['backup', 'backup'])
    stop()
  })

  it('only reads from WAHA', async () => {
    mockListSessions.mockResolvedValue([{ name: 'backup', status: 'FAILED' }])
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { logger } = capture()
    const { startPolling } = await import('../session-monitor.js')
    const stop = startPolling(logger)
    await vi.advanceTimersByTimeAsync(0)
    stop()
    vi.unstubAllGlobals()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockListSessions).toHaveBeenCalledOnce()
  })

  it('survives WAHA being unreachable', async () => {
    mockListSessions.mockRejectedValue(new Error('ECONNREFUSED'))
    const { logger } = capture()
    const { startPolling } = await import('../session-monitor.js')
    const stop = startPolling(logger)
    await vi.advanceTimersByTimeAsync(300_000)
    expect(mockListSessions).toHaveBeenCalledTimes(2)
    stop()
  })
})
