import { z } from 'zod'
import { CoreConfigSchema } from '@omb/collector-core'

const WhatsAppConfigSchema = CoreConfigSchema.extend({
  WAHA_BASE_URL: z.string().url(),
  WAHA_API_KEY: z.string().min(1),
  // Webhooks report status changes; the poll catches any missed while we were down.
  WAHA_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(300_000),
  // Slower than the status poll: NOWEB's group listing is rate-limited.
  WAHA_GROUP_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(1_800_000),
  COLLECTOR_PORT: z.coerce.number().int().positive().default(8080),
})

const result = WhatsAppConfigSchema.safeParse(process.env)
if (!result.success) {
  console.error('Invalid environment variables:')
  for (const issue of result.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`)
  }
  process.exit(1)
}

export const config = result.data
