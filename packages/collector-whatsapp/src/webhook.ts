import { type Logger } from 'pino'
import { uploadPhoto, forwardBeerLog } from '@omb/collector-core'
import { handleSessionStatusChange } from './session-monitor.js'
import { getGroupName } from './waha-client.js'
import { config } from './config.js'

const MAX_MEDIA_BYTES = 20 * 1024 * 1024 // 20 MB

let firstMessage = true

// Guards against duplicate webhook deliveries for the same message.
// WAHA retries when the collector doesn't respond within its timeout window;
// without this, both deliveries race through and insert two DB rows.
const processingMsgIds = new Set<string>()

export async function handleWebhookEvent(body: unknown, logger: Logger): Promise<void> {
  const event = (body as Record<string, unknown>)?.event
  if (typeof event !== 'string') return

  if (event === 'session.status') {
    const status = ((body as Record<string, unknown>).payload as Record<string, unknown>)?.status
    if (typeof status === 'string') {
      await handleSessionStatusChange(status, logger)
    }
    return
  }

  if (event === 'message') {
    await handleMessage(body as Record<string, unknown>, logger)
    return
  }

  // Unknown event — ignore silently
}

async function handleMessage(body: Record<string, unknown>, logger: Logger): Promise<void> {
  const payload = body.payload as Record<string, unknown>
  if (!payload) return

  if (firstMessage) {
    logger.debug({ payload }, 'First WAHA message payload — verifying field names')
    firstMessage = false
  }

  const chatId = (payload.chatId ?? payload.to) as string | undefined
  if (!chatId?.endsWith('@g.us')) return

  const hasMedia = payload.hasMedia
  const media = payload.media as Record<string, unknown> | undefined
  const mimetype = media?.mimetype as string | undefined
  if (!hasMedia || !mimetype?.startsWith('image/')) return

  const msgId = payload.id as string
  if (!msgId) {
    logger.warn({ chatId }, 'Message has no ID — discarding')
    return
  }

  if (processingMsgIds.has(msgId)) {
    logger.warn({ msgId, chatId }, 'Duplicate webhook delivery for message — discarding')
    return
  }
  processingMsgIds.add(msgId)

  try {
    logger.warn({ chatId }, 'Processing photo from WhatsApp group')

    // WhatsApp's newer LID protocol uses a device-linked identifier (ends in @lid)
    // as the primary participant field instead of a phone number. Fall back to
    // _data.key.participantAlt which always carries the real phone JID.
    const participantRaw = payload.participant as string | undefined
    const isLid = participantRaw?.endsWith('@lid')
    const dataKey = (payload._data as Record<string, unknown> | undefined)?.key as
      | Record<string, unknown>
      | undefined
    const participantAlt = dataKey?.participantAlt as string | undefined
    const senderJid = (
      isLid && participantAlt ? participantAlt : (participantRaw ?? payload.from)
    ) as string
    const senderId = 'wa:' + senderJid.replace('@s.whatsapp.net', '').replace('@lid', '')
    const sourceGroupId = 'wa:' + chatId
    const groupName = await getGroupName(chatId)
    const timestamp = new Date((payload.timestamp as number) * 1000).toISOString()
    const mediaUrl = media!.url as string

    if (!mediaUrl) {
      logger.warn({ chatId }, 'Media URL absent — discarding')
      return
    }

    // WAHA may return media URLs with its own internal origin (e.g. http://localhost:3000)
    // rather than the configured WAHA_BASE_URL. Rewrite to always fetch via the configured base.
    let fetchUrl: string
    try {
      const parsed = new URL(mediaUrl)
      const base = new URL(config.WAHA_BASE_URL)
      parsed.protocol = base.protocol
      parsed.host = base.host
      fetchUrl = parsed.toString()
    } catch {
      logger.warn({ chatId, mediaUrl }, 'Media URL invalid — discarding')
      return
    }

    let buffer: Buffer
    try {
      const res = await fetch(fetchUrl, {
        signal: AbortSignal.timeout(30_000),
        headers: { 'x-api-key': config.WAHA_API_KEY },
      })
      if (!res.ok) throw new Error(`Media fetch returned ${res.status}`)
      const contentLength = Number(res.headers.get('content-length') ?? 0)
      if (contentLength > MAX_MEDIA_BYTES) {
        logger.warn({ chatId, contentLength }, 'Media response too large — discarding')
        return
      }
      const contentType = res.headers.get('content-type') ?? ''
      if (!contentType.startsWith('image/')) {
        logger.warn({ chatId, contentType }, 'Media response is not an image — discarding')
        return
      }
      buffer = Buffer.from(await res.arrayBuffer())
    } catch (err) {
      logger.error({ err, mediaUrl }, 'Failed to download media — discarding')
      return
    }

    const key = `photos/${chatId.replace('@g.us', '')}/${msgId}.jpg`

    let photoUrl: string
    try {
      photoUrl = await uploadPhoto(key, buffer)
    } catch (err) {
      logger.error({ err, key }, 'Failed to upload photo — discarding')
      return
    }

    try {
      await forwardBeerLog({ sourceGroupId, groupName, senderId, timestamp, photoUrl })
      logger.info({ sourceGroupId, senderId, key }, 'Beer log forwarded')
    } catch (err) {
      logger.error({ err, sourceGroupId }, 'Failed to forward beer log')
    }
  } finally {
    processingMsgIds.delete(msgId)
  }
}
