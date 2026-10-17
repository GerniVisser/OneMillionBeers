import { z } from 'zod'
import { CoreConfigSchema } from '@omb/collector-core'

const WhatsAppConfigSchema = CoreConfigSchema.extend({
  WAHA_BASE_URL: z.string().url(),
  WAHA_API_KEY: z.string().min(1),
  // Comma-separated session names, one per WhatsApp number. The FIRST is the
  // primary: it owns group sync, because every number is in the same groups and
  // syncing from each one would multiply a rate-limited WAHA call for nothing.
  // The others exist purely for redundancy. Ingestion is idempotent on
  // (group, message), so adding a name here cannot double-count.
  WAHA_SESSIONS: z
    .string()
    .min(1)
    .default('default')
    .transform((s) => [
      ...new Set(
        s
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean),
      ),
    ])
    .refine((names) => names.length > 0, 'WAHA_SESSIONS must name at least one session'),
  WAHA_WEBHOOK_URL: z.string().url(),
  // Status polling. The session.status webhook already reports transitions
  // within seconds; this catches a status that changed while the collector was
  // down, or a session wedged without emitting an event.
  WAHA_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(300_000),
  // Group sync is separate and much slower: WAHA NOWEB backs listAllGroups with
  // groupFetchAllParticipating, which rate-limits if called every few minutes.
  WAHA_GROUP_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(1_800_000),
  // Auto-recovery for a FAILED session. Capped, because a de-authorized device
  // never recovers by restarting and would otherwise loop forever.
  WAHA_MAX_RESTART_ATTEMPTS: z.coerce.number().int().positive().default(3),
  // Consecutive-attempt counter resets after this long without a restart.
  WAHA_RESTART_RESET_MS: z.coerce.number().int().positive().default(21_600_000),
  // How often a still-broken session re-alerts, so an outage cannot go quiet.
  ALERT_REPEAT_INTERVAL_MS: z.coerce.number().int().positive().default(21_600_000),
  COLLECTOR_PORT: z.coerce.number().int().positive().default(8080),
  PUBLIC_BASE_URL: z.string().url(),
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
