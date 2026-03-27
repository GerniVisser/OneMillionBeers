import { z } from 'zod'

export const CoreConfigSchema = z.object({
  BACKEND_URL: z.string().url(),
  STORAGE_ENDPOINT: z.string().url(),
  STORAGE_PUBLIC_URL: z.string().url(),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_KEY: z.string().optional(),
  STORAGE_SECRET: z.string().optional(),
  STORAGE_REGION: z.string().min(1).default('auto'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
})

const result = CoreConfigSchema.safeParse(process.env)
if (!result.success) {
  console.error('Invalid environment variables:')
  for (const issue of result.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`)
  }
  process.exit(1)
}

export const config = result.data
