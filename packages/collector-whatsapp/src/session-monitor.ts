import { type Logger } from 'pino'
import { config } from './config.js'
import { sendReauthAlert } from './mailer.js'
import { getSessionStatus } from './waha-client.js'
import { syncAllGroups } from './group-sync.js'

// Module-level — tracks last status we sent an alert for, to avoid duplicate emails
let lastAlertedStatus: string | null = null

export async function handleSessionStatusChange(status: string, logger: Logger): Promise<void> {
  if (status === 'WORKING') {
    lastAlertedStatus = null
    logger.info({ status }, 'WhatsApp session is working')
    syncAllGroups(logger).catch((err) => logger.error({ err }, 'Startup group sync failed'))
    return
  }

  if (status === 'SCAN_QR_CODE' || status === 'FAILED') {
    if (lastAlertedStatus === status) return
    lastAlertedStatus = status
    logger.warn({ status }, 'WhatsApp session requires attention')

    if (config.ENABLE_ALERTS) {
      const statusPageUrl = `${config.PUBLIC_BASE_URL}/whatsapp/status?token=${config.STATUS_TOKEN}`
      try {
        await sendReauthAlert(statusPageUrl)
        logger.warn({ statusPageUrl }, 'Re-auth alert sent')
      } catch (err) {
        logger.error({ err }, 'Failed to send re-auth alert')
      }
    } else {
      logger.debug('Alerts disabled — skipping email')
    }
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
