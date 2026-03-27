import { z } from 'zod'
import { CoreConfigSchema } from '@omb/collector-core'

const WhatsAppConfigSchema = CoreConfigSchema.extend({
  WAHA_BASE_URL: z.string().url(),
  WAHA_API_KEY: z.string().min(1),
  WAHA_SESSION: z.string().min(1).default('default'),
  WAHA_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(300_000),
  COLLECTOR_PORT: z.coerce.number().int().positive().default(8080),
  PUBLIC_BASE_URL: z.string().url(),
  STATUS_TOKEN: z.string().min(1),
  // Alert feature — disabled by default (dev). Set ENABLE_ALERTS=true in production.
  ENABLE_ALERTS: z.coerce.boolean().default(false),
  ALERT_EMAIL: z.string().email().optional(),
  SES_FROM_EMAIL: z.string().email().optional(),
  AWS_REGION: z.string().min(1).optional(),
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
