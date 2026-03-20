import { Bot, type Context } from 'grammy'
import { hydrateFiles, type FileFlavor } from '@grammyjs/files'
import { autoRetry } from '@grammyjs/auto-retry'
import { pino } from 'pino'
import { telegramConfig } from './config.js'
import { uploadPhoto } from '../../uploader.js'
import { forwardBeerLog } from '../../forwarder.js'
import { config } from '../../config.js'

type MyContext = FileFlavor<Context>

const logger = pino({ name: 'telegram', level: config.LOG_LEVEL })

export function createTelegramBot(): Bot<MyContext> {
  const bot = new Bot<MyContext>(telegramConfig.TELEGRAM_BOT_TOKEN)

  // Retry Telegram API calls (getFile, etc.) on transient network errors with exponential backoff
  bot.api.config.use(autoRetry({ maxRetryAttempts: 5, maxDelaySeconds: 60 }))

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

    // Step 1: Download via grammY's async iterator with retry (ETIMEDOUT is common on Telegram CDN)
    let buffer: Buffer | undefined
    const maxAttempts = 3
    let lastErr: unknown
    let downloaded = false
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const file = await ctx.getFile()
        const chunks: Uint8Array[] = []
        for await (const chunk of file) {
          chunks.push(chunk)
        }
        buffer = Buffer.concat(chunks)
        downloaded = true
        break
      } catch (err) {
        lastErr = err
        if (attempt < maxAttempts) {
          const delay = 1000 * 2 ** (attempt - 1) // 1s, 2s
          logger.warn(
            { err, sourceGroupId, fileUniqueId: photo.file_unique_id, attempt, delay },
            'Download attempt failed — retrying',
          )
          await new Promise((r) => setTimeout(r, delay))
        }
      }
    }
    if (!downloaded) {
      logger.error(
        { err: lastErr, sourceGroupId, fileUniqueId: photo.file_unique_id },
        'Failed to download photo after retries',
      )
      return
    }

    // Step 2: Upload to S3-compatible storage
    let photoUrl: string
    try {
      photoUrl = await uploadPhoto(key, buffer!)
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
