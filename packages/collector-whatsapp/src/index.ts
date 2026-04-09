import { pino } from 'pino'
import { config } from './config.js'
import { startSession, ensureWebhookConfigured } from './waha-client.js'
import { buildServer } from './server.js'
import { startPolling } from './session-monitor.js'
import { startGroupPolling } from './group-sync.js'

async function main(): Promise<void> {
  const logger = pino({ name: 'collector-whatsapp', level: config.LOG_LEVEL })

  logger.info('Starting WhatsApp collector')

  // Start the webhook server before touching WAHA, so any session.status events
  // triggered by the config update below land on a live listener.
  const server = buildServer(logger)
  await server.listen({ port: config.COLLECTOR_PORT, host: '0.0.0.0' })
  logger.info({ port: config.COLLECTOR_PORT }, 'Webhook server listening')

  // Ensure WAHA session is started (idempotent). Includes webhook config in the
  // start body — required since WAHA 2026.x no longer reads WAHA_WEBHOOK_URL env var.
  try {
    await startSession()
    logger.info('WAHA session started')
  } catch (err) {
    // Non-fatal — WAHA may already be running the session via WHATSAPP_START_SESSION env var
    logger.warn({ err }, 'Could not explicitly start WAHA session — continuing anyway')
  }

  // If session was already running (startSession returned 422), it may have no webhook
  // config (WAHA 2026.x broke env-var-based webhook config). Configure it now via PUT,
  // which restarts the session briefly. The server is already up so the WORKING event lands.
  let webhookConfigured = false
  try {
    webhookConfigured = await ensureWebhookConfigured()
    if (webhookConfigured) {
      logger.info('Applied WAHA webhook config — session restarting')
    }
  } catch (err) {
    logger.warn({ err }, 'Could not configure WAHA webhook')
  }

  const stopPolling = startPolling(logger)
  const stopGroupPolling = startGroupPolling(logger)

  const shutdown = async () => {
    logger.info('Shutting down')
    stopPolling()
    stopGroupPolling()
    await server.close()
  }

  process.once('SIGINT', () => void shutdown())
  process.once('SIGTERM', () => void shutdown())
}

main().catch((err) => {
  console.error('Collector crashed', err)
  process.exit(1)
})
