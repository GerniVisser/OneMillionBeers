import Fastify from 'fastify'
import { type Logger } from 'pino'
import { handleWebhookEvent } from './webhook.js'
import { registerAdminRoutes } from './admin.js'

export function buildServer(logger: Logger) {
  const server = Fastify({ logger: false })

  server.post('/webhook', async (req, reply) => {
    // Respond immediately — WAHA retries on timeout, which causes duplicate processing.
    // handleWebhookEvent never throws (errors are caught and logged internally).
    reply.send({ ok: true })
    handleWebhookEvent(req.body, logger).catch((err) => {
      logger.error({ err }, 'Unhandled error in webhook handler')
    })
  })

  server.get('/health', async (_req, reply) => {
    return reply.send({ status: 'ok' })
  })

  // Operator page. Authentication is the gateway's job — see admin.ts.
  registerAdminRoutes(server, logger)

  return server
}
