import { pino } from 'pino'
import { coreConfig } from '@omb/collector-core'
import { createTelegramBot } from './bot.js'

const logger = pino({ name: 'collector-telegram', level: coreConfig.LOG_LEVEL })

async function main(): Promise<void> {
  logger.info('Starting Telegram collector')
  const bot = createTelegramBot()

  // bot.stop() resolves the bot.start() promise — void silences the floating-promise lint warning
  process.once('SIGINT', () => void bot.stop())
  process.once('SIGTERM', () => void bot.stop())

  await bot.start()
  logger.info('Telegram bot stopped gracefully')
}

main().catch((err) => {
  logger.error({ err }, 'Collector crashed')
  process.exit(1)
})
