import { z } from 'zod'

const TelegramConfigSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
})

const result = TelegramConfigSchema.safeParse(process.env)
if (!result.success) {
  console.error('Invalid Telegram environment variables:')
  for (const issue of result.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`)
  }
  process.exit(1)
}

export const telegramConfig = result.data
