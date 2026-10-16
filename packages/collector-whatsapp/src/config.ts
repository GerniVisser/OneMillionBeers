import { z } from 'zod'
import { CoreConfigSchema } from '@omb/collector-core'

// Compose passes unset variables through as empty strings; treat those as absent.
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional())

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
  // Admin page at /admin. All three must be set together; without them the page
  // is disabled rather than the collector refusing to start, so a deploy that
  // lands before the SSM parameters exist cannot take ingestion down.
  // ADMIN_PASSWORD_HASH comes from `pnpm --filter @omb/collector-whatsapp admin:hash-password`.
  ADMIN_USERNAME: optional(z.string().min(1)),
  ADMIN_PASSWORD_HASH: optional(z.string().regex(/^scrypt:/, 'must be a scrypt:… hash')),
  ADMIN_SESSION_SECRET: optional(z.string().min(32)),
  // Read-only bearer token for diagnostics (e.g. Claude). Never grants actions,
  // QR codes or pairing codes.
  ADMIN_API_TOKEN: optional(z.string().min(32)),
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
}).superRefine((c, ctx) => {
  const admin = [c.ADMIN_USERNAME, c.ADMIN_PASSWORD_HASH, c.ADMIN_SESSION_SECRET]
  if (admin.some(Boolean) && !admin.every(Boolean)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ADMIN_USERNAME'],
      message: 'ADMIN_USERNAME, ADMIN_PASSWORD_HASH and ADMIN_SESSION_SECRET must be set together',
    })
  }
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
