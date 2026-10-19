import Fastify from 'fastify'
import { type Logger } from 'pino'
import { handleWebhookEvent, RetryLater } from './webhook.js'
import { registerAdminRoutes } from './admin.js'

export function buildServer(logger: Logger) {
  const server = Fastify({ logger: false })

  // Answered only once the event is stored: any non-2xx makes WAHA deliver it
  // again, on the `retries` schedule in waha-client.ts.
  server.post('/webhook', async (req, reply) => {
    try {
      await handleWebhookEvent(req.body, logger)
      return reply.send({ ok: true })
    } catch (err) {
      if (!(err instanceof RetryLater)) logger.error({ err }, 'Unhandled error in webhook handler')
      return reply.status(503).send({ ok: false })
    }
  })

  server.get('/health', async (_req, reply) => {
    return reply.send({ status: 'ok' })
  })

  // No auth here: the gateway protects /admin.
  registerAdminRoutes(server, logger)

  return server
}
