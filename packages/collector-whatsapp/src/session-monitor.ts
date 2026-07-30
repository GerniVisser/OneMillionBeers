import { type Logger } from 'pino'
import { config } from './config.js'
import { sendReauthAlert } from './mailer.js'
import { getSessionStatus, restartSession } from './waha-client.js'

// Module-level — tracks last status we alerted for, and when, so a persistent
// failure re-alerts periodically instead of going quiet after the first email.
let lastAlertedStatus: string | null = null
let lastAlertedAt = 0

// Tracks consecutive auto-restart attempts so a session WhatsApp refuses to
// re-authenticate (stale credentials) stops being restarted in a tight loop.
let restartAttempts = 0
let lastRestartAt = 0

export function resetSessionMonitorState(): void {
  lastAlertedStatus = null
  lastAlertedAt = 0
  restartAttempts = 0
  lastRestartAt = 0
}

/**
 * A FAILED session never recovers on its own — WAHA leaves it failed until
 * something calls restart. Most failures are transient (WhatsApp sends a
 * stream:error 503), so restarting recovers automatically. Credentials that
 * WhatsApp has de-authorized will not recover, which is why attempts are
 * capped: past the cap only the alert fires, since re-pairing needs a human.
 */
async function tryAutoRestart(logger: Logger): Promise<boolean> {
  const now = Date.now()

  if (now - lastRestartAt > config.WAHA_RESTART_RESET_MS) {
    restartAttempts = 0
  }

  if (restartAttempts >= config.WAHA_MAX_RESTART_ATTEMPTS) {
    logger.warn(
      { restartAttempts },
      'Auto-restart limit reached — session needs manual re-authentication',
    )
    return false
  }

  restartAttempts += 1
  lastRestartAt = now

  try {
    await restartSession()
    logger.warn({ restartAttempts }, 'Requested WAHA session restart after FAILED status')
    return true
  } catch (err) {
    logger.error({ err, restartAttempts }, 'Failed to restart WAHA session')
    return false
  }
}

async function maybeAlert(status: string, logger: Logger): Promise<void> {
  const now = Date.now()
  const isRepeat = lastAlertedStatus === status
  if (isRepeat && now - lastAlertedAt < config.ALERT_REPEAT_INTERVAL_MS) return

  lastAlertedStatus = status
  lastAlertedAt = now

  if (!config.ENABLE_ALERTS) {
    logger.debug('Alerts disabled — skipping email')
    return
  }

  const statusPageUrl = `${config.PUBLIC_BASE_URL}/whatsapp/status?token=${config.STATUS_TOKEN}`
  try {
    await sendReauthAlert(statusPageUrl)
    logger.warn({ statusPageUrl }, 'Re-auth alert sent')
  } catch (err) {
    // Reset so the next poll retries rather than staying silent for the full
    // repeat interval — a bad SES config previously silenced alerts entirely.
    lastAlertedAt = 0
    logger.error({ err }, 'Failed to send re-auth alert')
  }
}

export async function handleSessionStatusChange(status: string, logger: Logger): Promise<void> {
  if (status === 'WORKING') {
    lastAlertedStatus = null
    lastAlertedAt = 0
    restartAttempts = 0
    logger.info({ status }, 'WhatsApp session is working')
    return
  }

  if (status === 'FAILED') {
    logger.warn({ status }, 'WhatsApp session requires attention')
    // Try to self-heal first; alert regardless, so a silent restart loop is visible.
    await tryAutoRestart(logger)
    await maybeAlert(status, logger)
    return
  }

  if (status === 'SCAN_QR_CODE') {
    // Credentials are gone — restarting cannot help, only a QR scan can.
    logger.warn({ status }, 'WhatsApp session requires attention')
    await maybeAlert(status, logger)
    return
  }

  logger.debug({ status }, 'WhatsApp session status update')
}

export function startPolling(logger: Logger): () => void {
  const timer = setInterval(async () => {
    try {
      const status = await getSessionStatus()
      if (status !== 'WORKING') {
        await handleSessionStatusChange(status, logger)
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to poll WAHA session status')
    }
  }, config.WAHA_POLL_INTERVAL_MS)

  return () => clearInterval(timer)
}
