import { type Logger } from 'pino'
import { config } from './config.js'
import { listSessions } from './waha-client.js'

// Observes only. Recovering a session is WAHA's job, or the operator's in the dashboard.
export async function handleSessionStatusChange(
  session: string,
  status: string,
  logger: Logger,
): Promise<void> {
  if (status === 'WORKING') {
    logger.info({ session, status }, 'WhatsApp session is working')
    return
  }

  if (status === 'FAILED' || status === 'SCAN_QR_CODE') {
    // Matched literally by infra/alerts.tf: changing the text silences the alarm.
    logger.warn({ session, status }, 'WhatsApp session requires attention')
    return
  }

  logger.debug({ session, status }, 'WhatsApp session status update')
}

// Logs every session that is not WORKING, so the alarm keeps firing while one stays broken.
async function poll(logger: Logger): Promise<void> {
  try {
    for (const { name, status } of await listSessions()) {
      if (status !== 'WORKING') await handleSessionStatusChange(name, status, logger)
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to poll WAHA sessions')
  }
}

export function startPolling(logger: Logger): () => void {
  void poll(logger)
  const timer = setInterval(() => void poll(logger), config.WAHA_POLL_INTERVAL_MS)
  return () => clearInterval(timer)
}
