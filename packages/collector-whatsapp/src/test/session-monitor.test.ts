import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { pino } from 'pino'

const mockSendReauthAlert = vi.fn()
const mockGetSessionStatus = vi.fn()
const mockRestartSession = vi.fn()

vi.mock('../mailer.js', () => ({ sendReauthAlert: mockSendReauthAlert }))
vi.mock('../waha-client.js', () => ({
  getSessionStatus: mockGetSessionStatus,
  restartSession: mockRestartSession,
}))

// Mutable config — mutate per test
const testConfig = {
  ENABLE_ALERTS: true,
  PUBLIC_BASE_URL: 'https://example.com',
  STATUS_TOKEN: 'mytoken',
  WAHA_POLL_INTERVAL_MS: 300_000,
  WAHA_MAX_RESTART_ATTEMPTS: 3,
  WAHA_RESTART_RESET_MS: 21_600_000,
  ALERT_REPEAT_INTERVAL_MS: 21_600_000,
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
    mockRestartSession.mockReset()
    mockRestartSession.mockResolvedValue(undefined)
    testConfig.ENABLE_ALERTS = true
    testConfig.PUBLIC_BASE_URL = 'https://example.com'
    testConfig.STATUS_TOKEN = 'mytoken'
    testConfig.WAHA_POLL_INTERVAL_MS = 300_000
    testConfig.WAHA_MAX_RESTART_ATTEMPTS = 3
    testConfig.WAHA_RESTART_RESET_MS = 21_600_000
    testConfig.ALERT_REPEAT_INTERVAL_MS = 21_600_000
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

    it('restarts the session on FAILED', async () => {
      const { handleSessionStatusChange } = await import('../session-monitor.js')
      await handleSessionStatusChange('FAILED', logger)
      expect(mockRestartSession).toHaveBeenCalledOnce()
    })

    it('does not restart on SCAN_QR_CODE — only a QR scan can recover it', async () => {
      const { handleSessionStatusChange } = await import('../session-monitor.js')
      await handleSessionStatusChange('SCAN_QR_CODE', logger)
      expect(mockRestartSession).not.toHaveBeenCalled()
    })

    it('caps consecutive restart attempts', async () => {
      testConfig.WAHA_MAX_RESTART_ATTEMPTS = 2
      const { handleSessionStatusChange } = await import('../session-monitor.js')
      for (let i = 0; i < 5; i++) await handleSessionStatusChange('FAILED', logger)
      expect(mockRestartSession).toHaveBeenCalledTimes(2)
    })

    it('resets the restart cap after WAHA_RESTART_RESET_MS elapses', async () => {
      testConfig.WAHA_MAX_RESTART_ATTEMPTS = 1
      const { handleSessionStatusChange } = await import('../session-monitor.js')
      await handleSessionStatusChange('FAILED', logger)
      await handleSessionStatusChange('FAILED', logger)
      expect(mockRestartSession).toHaveBeenCalledOnce()

      vi.advanceTimersByTime(testConfig.WAHA_RESTART_RESET_MS + 1000)
      await handleSessionStatusChange('FAILED', logger)
      expect(mockRestartSession).toHaveBeenCalledTimes(2)
    })

    it('WORKING resets the restart cap', async () => {
      testConfig.WAHA_MAX_RESTART_ATTEMPTS = 1
      const { handleSessionStatusChange } = await import('../session-monitor.js')
      await handleSessionStatusChange('FAILED', logger)
      await handleSessionStatusChange('WORKING', logger)
      await handleSessionStatusChange('FAILED', logger)
      expect(mockRestartSession).toHaveBeenCalledTimes(2)
    })

    it('re-alerts once ALERT_REPEAT_INTERVAL_MS has elapsed', async () => {
      mockSendReauthAlert.mockResolvedValue(undefined)
      const { handleSessionStatusChange } = await import('../session-monitor.js')
      await handleSessionStatusChange('SCAN_QR_CODE', logger)
      await handleSessionStatusChange('SCAN_QR_CODE', logger)
      expect(mockSendReauthAlert).toHaveBeenCalledOnce()

      vi.advanceTimersByTime(testConfig.ALERT_REPEAT_INTERVAL_MS + 1000)
      await handleSessionStatusChange('SCAN_QR_CODE', logger)
      expect(mockSendReauthAlert).toHaveBeenCalledTimes(2)
    })

    it('retries the alert on the next status change when sending failed', async () => {
      mockSendReauthAlert.mockRejectedValueOnce(new Error('SES rejected'))
      mockSendReauthAlert.mockResolvedValue(undefined)
      const { handleSessionStatusChange } = await import('../session-monitor.js')
      await handleSessionStatusChange('SCAN_QR_CODE', logger)
      await handleSessionStatusChange('SCAN_QR_CODE', logger)
      expect(mockSendReauthAlert).toHaveBeenCalledTimes(2)
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
