import { type Logger } from 'pino'
import { config } from './config.js'
import { sendReauthAlert } from './mailer.js'
import { getSessionStatus, restartSession } from './waha-client.js'

interface SessionState {
  alerted: boolean
  alertedAt: number
  restartAttempts: number
  lastRestartAt: number
}

const states = new Map<string, SessionState>()

function stateFor(session: string): SessionState {
  let state = states.get(session)
  if (!state) {
    state = { alerted: false, alertedAt: 0, restartAttempts: 0, lastRestartAt: 0 }
    states.set(session, state)
  }
  return state
}

export function resetSessionMonitorState(): void {
  states.clear()
}

/**
 * A FAILED session never recovers on its own — WAHA leaves it failed until
 * something calls restart. Most failures are transient (WhatsApp sends a
 * stream:error 503), so restarting recovers automatically. Credentials that
 * WhatsApp has de-authorized will not recover, which is why attempts are
 * capped: past the cap only the alert fires, since re-pairing needs a human.
 */
async function tryAutoRestart(session: string, logger: Logger): Promise<boolean> {
  const state = stateFor(session)
  const now = Date.now()

  if (now - state.lastRestartAt > config.WAHA_RESTART_RESET_MS) {
    state.restartAttempts = 0
  }

  if (state.restartAttempts >= config.WAHA_MAX_RESTART_ATTEMPTS) {
    logger.warn(
      { session, restartAttempts: state.restartAttempts },
      'Auto-restart limit reached — session needs manual re-authentication',
    )
    return false
  }

  state.restartAttempts += 1
  state.lastRestartAt = now

  try {
    await restartSession(session)
    logger.warn(
      { session, restartAttempts: state.restartAttempts },
      'Requested WAHA session restart after FAILED status',
    )
    return true
  } catch (err) {
    logger.error(
      { err, session, restartAttempts: state.restartAttempts },
      'Failed to restart WAHA session',
    )
    return false
  }
}

// De-duped across statuses: an unpaired session keeps flipping SCAN_QR_CODE <-> FAILED.
async function maybeAlert(session: string, status: string, logger: Logger): Promise<void> {
  const state = stateFor(session)
  const now = Date.now()
  if (state.alerted && now - state.alertedAt < config.ALERT_REPEAT_INTERVAL_MS) return

  state.alerted = true
  state.alertedAt = now

  if (!config.ENABLE_ALERTS) {
    logger.debug({ session }, 'Alerts disabled — skipping email')
    return
  }

  const statusPageUrl = `${config.PUBLIC_BASE_URL}/whatsapp/status?token=${config.STATUS_TOKEN}&session=${encodeURIComponent(session)}`
  try {
    await sendReauthAlert(session, status, statusPageUrl)
    logger.warn({ session, statusPageUrl }, 'Re-auth alert sent')
  } catch (err) {
    // Reset so the next poll retries rather than staying silent for the full
    // repeat interval — a bad SES config previously silenced alerts entirely.
    state.alertedAt = 0
    logger.error({ err, session }, 'Failed to send re-auth alert')
  }
}

export async function handleSessionStatusChange(
  session: string,
  status: string,
  logger: Logger,
): Promise<void> {
  const state = stateFor(session)

  if (status === 'WORKING') {
    state.alerted = false
    state.alertedAt = 0
    state.restartAttempts = 0
    logger.info({ session, status }, 'WhatsApp session is working')
    return
  }

  if (status === 'FAILED') {
    // Matched literally by infra/alerts.tf: changing the text silences the alarm.
    logger.warn({ session, status }, 'WhatsApp session requires attention')
    // Try to self-heal first; alert regardless, so a silent restart loop is visible.
    await tryAutoRestart(session, logger)
    await maybeAlert(session, status, logger)
    return
  }

  if (status === 'SCAN_QR_CODE') {
    // Credentials are gone — restarting cannot help, only a QR scan can.
    // Matched literally by infra/alerts.tf.
    logger.warn({ session, status }, 'WhatsApp session requires attention')
    await maybeAlert(session, status, logger)
    return
  }

  logger.debug({ session, status }, 'WhatsApp session status update')
}

export function startPolling(logger: Logger): () => void {
  const timer = setInterval(async () => {
    for (const session of config.WAHA_SESSIONS) {
      try {
        const status = await getSessionStatus(session)
        if (status !== 'WORKING') {
          await handleSessionStatusChange(session, status, logger)
        }
      } catch (err) {
        logger.warn({ err, session }, 'Failed to poll WAHA session status')
      }
    }
  }, config.WAHA_POLL_INTERVAL_MS)

  return () => clearInterval(timer)
}
