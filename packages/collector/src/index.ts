import { pino } from 'pino'
import { config } from './config.js'

const logger = pino({ name: 'collector', level: config.LOG_LEVEL })

async function main(): Promise<void> {
  logger.info({ collector: config.COLLECTOR }, 'Starting collector')

  if (config.COLLECTOR === 'telegram') {
    const { createTelegramBot } = await import('./collectors/telegram/index.js')
    const bot = createTelegramBot()

    // bot.stop() resolves the bot.start() promise — void silences the floating-promise lint warning
    process.once('SIGINT', () => void bot.stop())
    process.once('SIGTERM', () => void bot.stop())

    await bot.start()
    logger.info('Telegram bot stopped gracefully')
  }
}

main().catch((err) => {
  logger.error({ err }, 'Collector crashed')
  process.exit(1)
})
