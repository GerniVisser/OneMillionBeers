import { Bot, type Context } from 'grammy'
import { hydrateFiles, type FileFlavor } from '@grammyjs/files'
import { pino } from 'pino'
import { telegramConfig } from './config.js'
import { uploadPhoto } from '../../uploader.js'
import { forwardBeerLog } from '../../forwarder.js'
import { config } from '../../config.js'

type MyContext = FileFlavor<Context>

const logger = pino({ name: 'telegram', level: config.LOG_LEVEL })

export function createTelegramBot(): Bot<MyContext> {
  const bot = new Bot<MyContext>(telegramConfig.TELEGRAM_BOT_TOKEN)

  // Use grammY's own HTTP client for file downloads (avoids opening new TCP connections)
  bot.api.config.use(hydrateFiles(telegramConfig.TELEGRAM_BOT_TOKEN))

  bot.on('message:photo', async (ctx) => {
    // Only process group and supergroup messages
    if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
      return
    }

    // Anonymous group admins have no ctx.from — scope fallback per group to avoid identity collisions
    const rawSenderId = ctx.from?.id?.toString() ?? `anonymous:${ctx.chat.id}`
    const senderId = `tg:${rawSenderId}`
    const sourceGroupId = `tg:${ctx.chat.id}`
    const groupName = ctx.chat.title
    // message.date is Unix seconds — convert to ISO 8601
    const timestamp = new Date(ctx.message.date * 1000).toISOString()

    // Highest-resolution photo is always last in the array
    const photo = ctx.message.photo.at(-1)!
    const key = `photos/${ctx.chat.id}/${photo.file_unique_id}.jpg`

    // Step 1: Download via grammY's async iterator (yields raw bytes; download() returns a path string)
    let buffer: Buffer
    try {
      const file = await ctx.getFile()
      const chunks: Uint8Array[] = []
      for await (const chunk of file) {
        chunks.push(chunk)
      }
      buffer = Buffer.concat(chunks)
    } catch (err) {
      logger.error(
        { err, sourceGroupId, fileUniqueId: photo.file_unique_id },
        'Failed to download photo',
      )
      return
    }

    // Step 2: Upload to S3-compatible storage
    let photoUrl: string
    try {
      photoUrl = await uploadPhoto(key, buffer)
    } catch (err) {
      logger.error({ err, key }, 'Failed to upload photo to S3 — discarding')
      return
    }

    // Step 3: Forward metadata to backend
    try {
      await forwardBeerLog({ sourceGroupId, groupName, senderId, timestamp, photoUrl })
      logger.info({ sourceGroupId, senderId, key }, 'Beer log forwarded')
    } catch (err) {
      logger.error({ err, sourceGroupId }, 'Failed to forward beer log to backend')
    }
  })

  return bot
}
