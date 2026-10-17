import Fastify from 'fastify'
import { type Logger } from 'pino'
import { config } from './config.js'
import { handleWebhookEvent, RetryLater } from './webhook.js'
import { getSessionStatus, getQrCodePng } from './waha-client.js'

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

  server.get('/status', async (req, reply) => {
    const { token, session = config.WAHA_SESSIONS[0]! } = req.query as {
      token?: string
      session?: string
    }
    if (token !== config.STATUS_TOKEN) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
    // The name goes into a WAHA URL path, so only configured names are allowed.
    if (!config.WAHA_SESSIONS.includes(session)) {
      return reply.status(404).send({ error: 'Unknown session' })
    }

    const status = await getSessionStatus(session)

    if (status === 'SCAN_QR_CODE') {
      let qrHtml: string
      try {
        const qrBuf = await getQrCodePng(session)
        const qrBase64 = qrBuf.toString('base64')
        qrHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="15">
  <title>OMB WhatsApp — Re-authentication Required</title>
  <style>body{font-family:sans-serif;text-align:center;padding:2rem}</style>
</head>
<body>
  <h1>WhatsApp Re-authentication Required</h1>
  <p>Scan this QR code with your phone. Page refreshes automatically every 15 seconds.</p>
  <img src="data:image/png;base64,${qrBase64}" alt="QR Code" style="max-width:300px">
  <p><small>Session status: SCAN_QR_CODE</small></p>
</body>
</html>`
      } catch {
        qrHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="10">
  <title>OMB WhatsApp — Re-authentication Required</title>
  <style>body{font-family:sans-serif;text-align:center;padding:2rem}</style>
</head>
<body>
  <h1>WhatsApp Re-authentication Required</h1>
  <p>Could not load QR code. Page refreshes automatically.</p>
  <p><small>Session status: SCAN_QR_CODE</small></p>
</body>
</html>`
      }
      return reply.type('text/html').send(qrHtml)
    }

    const statusHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="30">
  <title>OMB WhatsApp — Session Status</title>
  <style>body{font-family:sans-serif;text-align:center;padding:2rem}</style>
</head>
<body>
  <h1>WhatsApp Session Status</h1>
  <p>Current status: <strong>${status}</strong></p>
  <p><small>Page refreshes every 30 seconds.</small></p>
</body>
</html>`
    return reply.type('text/html').send(statusHtml)
  })

  server.get('/health', async (_req, reply) => {
    return reply.send({ status: 'ok' })
  })

  return server
}
