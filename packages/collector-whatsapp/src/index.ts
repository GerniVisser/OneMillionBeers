import { pino } from 'pino'
import { config } from './config.js'
import { buildServer } from './server.js'
import { startPolling } from './session-monitor.js'
import { startGroupPolling } from './group-sync.js'

async function main(): Promise<void> {
  const logger = pino({ name: 'collector-whatsapp', level: config.LOG_LEVEL })

  logger.info('Starting WhatsApp collector')

  const server = buildServer(logger)
  await server.listen({ port: config.COLLECTOR_PORT, host: '0.0.0.0' })
  logger.info({ port: config.COLLECTOR_PORT }, 'Webhook server listening')

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
