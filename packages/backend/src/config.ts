import { z } from 'zod'

const ConfigSchema = z.object({
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Shared secret the collector presents on /v1/internal/*. Required — the
  // backend must not start without it, or ingestion would be open to anyone
  // who can reach the container.
  INTERNAL_API_TOKEN: z.string().min(32),
})

const result = ConfigSchema.safeParse(process.env)
if (!result.success) {
  console.error('Invalid environment variables:')
  for (const issue of result.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`)
  }
  process.exit(1)
}

export const config = result.data
