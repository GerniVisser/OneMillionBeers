import { pino } from 'pino'
import { config } from './config.js'
import { startSession } from './waha-client.js'
import { buildServer } from './server.js'
import { startPolling } from './session-monitor.js'

async function main(): Promise<void> {
  const logger = pino({ name: 'collector-whatsapp', level: config.LOG_LEVEL })

  logger.info('Starting WhatsApp collector')

  // Ensure WAHA session is started (idempotent)
  try {
    await startSession()
    logger.info('WAHA session started')
  } catch (err) {
    // Non-fatal — WAHA may already be starting the session via WHATSAPP_START_SESSION env var
    logger.warn({ err }, 'Could not explicitly start WAHA session — continuing anyway')
  }

  const server = buildServer(logger)
  await server.listen({ port: config.COLLECTOR_PORT, host: '0.0.0.0' })
  logger.info({ port: config.COLLECTOR_PORT }, 'Webhook server listening')

  const stopPolling = startPolling(logger)

  const shutdown = async () => {
    logger.info('Shutting down')
    stopPolling()
    await server.close()
  }

  process.once('SIGINT', () => void shutdown())
  process.once('SIGTERM', () => void shutdown())
}

main().catch((err) => {
  console.error('Collector crashed', err)
  process.exit(1)
})
