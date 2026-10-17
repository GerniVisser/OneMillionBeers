import { pino } from 'pino'
import { config } from './config.js'
import { reconcileSession } from './waha-client.js'
import { buildServer } from './server.js'
import { startPolling, handleSessionStatusChange } from './session-monitor.js'
import { startGroupPolling } from './group-sync.js'

async function main(): Promise<void> {
  const logger = pino({ name: 'collector-whatsapp', level: config.LOG_LEVEL })

  logger.info('Starting WhatsApp collector')

  // Start the webhook server before touching WAHA, so any session.status events
  // triggered by the config update below land on a live listener.
  const server = buildServer(logger)
  await server.listen({ port: config.COLLECTOR_PORT, host: '0.0.0.0' })
  logger.info({ port: config.COLLECTOR_PORT }, 'Webhook server listening')

  // Per session and non-fatal: one unreachable number must not stop the others.
  await Promise.all(
    config.WAHA_SESSIONS.map(async (session) => {
      try {
        const result = await reconcileSession(session)
        if (result.action === 'created') {
          logger.info({ session }, 'WAHA session created')
          return
        }
        if (result.action === 'updated') {
          logger.info({ session }, 'Applied WAHA session config — session restarting')
        }
        // A change made while we were down sent no webhook, so check it now.
        await handleSessionStatusChange(session, result.status, logger)
      } catch (err) {
        logger.warn({ err, session }, 'Could not reconcile WAHA session — continuing anyway')
      }
    }),
  )

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
