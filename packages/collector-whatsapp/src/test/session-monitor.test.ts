import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { pino } from 'pino'

const mockSendReauthAlert = vi.fn()
const mockGetSessionStatus = vi.fn()

vi.mock('../mailer.js', () => ({ sendReauthAlert: mockSendReauthAlert }))
vi.mock('../waha-client.js', () => ({ getSessionStatus: mockGetSessionStatus }))

// Mutable config — mutate per test
const testConfig = {
  ENABLE_ALERTS: true,
  PUBLIC_BASE_URL: 'https://example.com',
  STATUS_TOKEN: 'mytoken',
  WAHA_POLL_INTERVAL_MS: 300_000,
}

vi.mock('../config.js', () => ({
  get config() {
    return testConfig
  },
}))

const logger = pino({ level: 'silent' })

describe('session-monitor', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    mockSendReauthAlert.mockReset()
    mockGetSessionStatus.mockReset()
    testConfig.ENABLE_ALERTS = true
    testConfig.PUBLIC_BASE_URL = 'https://example.com'
    testConfig.STATUS_TOKEN = 'mytoken'
    testConfig.WAHA_POLL_INTERVAL_MS = 300_000
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('handleSessionStatusChange', () => {
    it('calls sendReauthAlert with correct URL when SCAN_QR_CODE and ENABLE_ALERTS=true', async () => {
      mockSendReauthAlert.mockResolvedValue(undefined)
      const { handleSessionStatusChange } = await import('../session-monitor.js')
      await handleSessionStatusChange('SCAN_QR_CODE', logger)
      expect(mockSendReauthAlert).toHaveBeenCalledOnce()
      expect(mockSendReauthAlert).toHaveBeenCalledWith(
        'https://example.com/whatsapp/status?token=mytoken',
      )
    })

    it('does not call sendReauthAlert when ENABLE_ALERTS=false', async () => {
      testConfig.ENABLE_ALERTS = false
      const { handleSessionStatusChange } = await import('../session-monitor.js')
      await handleSessionStatusChange('SCAN_QR_CODE', logger)
      expect(mockSendReauthAlert).not.toHaveBeenCalled()
    })

    it('deduplicates: sendReauthAlert called only once for repeated SCAN_QR_CODE', async () => {
      mockSendReauthAlert.mockResolvedValue(undefined)
      const { handleSessionStatusChange } = await import('../session-monitor.js')
      await handleSessionStatusChange('SCAN_QR_CODE', logger)
      await handleSessionStatusChange('SCAN_QR_CODE', logger)
      expect(mockSendReauthAlert).toHaveBeenCalledOnce()
    })

    it('calls sendReauthAlert for FAILED status', async () => {
      mockSendReauthAlert.mockResolvedValue(undefined)
      const { handleSessionStatusChange } = await import('../session-monitor.js')
      await handleSessionStatusChange('FAILED', logger)
      expect(mockSendReauthAlert).toHaveBeenCalledOnce()
    })

    it('WORKING status resets dedup so next SCAN_QR_CODE sends again', async () => {
      mockSendReauthAlert.mockResolvedValue(undefined)
      const { handleSessionStatusChange } = await import('../session-monitor.js')
      await handleSessionStatusChange('SCAN_QR_CODE', logger)
      await handleSessionStatusChange('WORKING', logger)
      await handleSessionStatusChange('SCAN_QR_CODE', logger)
      expect(mockSendReauthAlert).toHaveBeenCalledTimes(2)
    })

    it('does not rethrow when sendReauthAlert throws', async () => {
      mockSendReauthAlert.mockRejectedValue(new Error('SES error'))
      const { handleSessionStatusChange } = await import('../session-monitor.js')
      await expect(handleSessionStatusChange('SCAN_QR_CODE', logger)).resolves.toBeUndefined()
    })
  })

  describe('startPolling', () => {
    it('calls sendReauthAlert when getSessionStatus returns SCAN_QR_CODE', async () => {
      mockGetSessionStatus.mockResolvedValue('SCAN_QR_CODE')
      mockSendReauthAlert.mockResolvedValue(undefined)
      const { startPolling } = await import('../session-monitor.js')
      const stop = startPolling(logger)
      await vi.advanceTimersByTimeAsync(300_000)
      expect(mockSendReauthAlert).toHaveBeenCalledOnce()
      stop()
    })

    it('does not crash when getSessionStatus throws', async () => {
      mockGetSessionStatus.mockRejectedValue(new Error('network error'))
      const { startPolling } = await import('../session-monitor.js')
      const stop = startPolling(logger)
      await expect(vi.advanceTimersByTimeAsync(300_000)).resolves.not.toThrow()
      stop()
    })

    it('stop function prevents further polls', async () => {
      testConfig.ENABLE_ALERTS = false
      mockGetSessionStatus.mockResolvedValue('SCAN_QR_CODE')
      const { startPolling } = await import('../session-monitor.js')
      const stop = startPolling(logger)
      stop()
      await vi.advanceTimersByTimeAsync(600_000)
      expect(mockGetSessionStatus).not.toHaveBeenCalled()
    })
  })
})
