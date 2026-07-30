import { z } from 'zod'
import { CoreConfigSchema } from '@omb/collector-core'

const WhatsAppConfigSchema = CoreConfigSchema.extend({
  WAHA_BASE_URL: z.string().url(),
  WAHA_API_KEY: z.string().min(1),
  WAHA_SESSION: z.string().min(1).default('default'),
  WAHA_WEBHOOK_URL: z.string().url(),
  WAHA_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1_800_000),
  // Auto-recovery for a FAILED session. Capped, because a de-authorized device
  // never recovers by restarting and would otherwise loop forever.
  WAHA_MAX_RESTART_ATTEMPTS: z.coerce.number().int().positive().default(3),
  // Consecutive-attempt counter resets after this long without a restart.
  WAHA_RESTART_RESET_MS: z.coerce.number().int().positive().default(21_600_000),
  // How often a still-broken session re-alerts, so an outage cannot go quiet.
  ALERT_REPEAT_INTERVAL_MS: z.coerce.number().int().positive().default(21_600_000),
  COLLECTOR_PORT: z.coerce.number().int().positive().default(8080),
  PUBLIC_BASE_URL: z.string().url(),
  STATUS_TOKEN: z.string().min(1),
  // Alert feature — disabled by default (dev). Set ENABLE_ALERTS=true in production.
  // NOTE: not z.coerce.boolean() — that treats any non-empty string as true,
  // so the literal "false" would enable alerts.
  ENABLE_ALERTS: z
    .enum(['true', 'false', '1', '0'])
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
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
