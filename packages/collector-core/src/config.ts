import { z } from 'zod'

// Compose passes a variable that is not set as an empty string.
const emptyAsUnset = (value: unknown) => (value === '' ? undefined : value)

export const CoreConfigSchema = z.object({
  BACKEND_URL: z.string().url(),
  INTERNAL_API_TOKEN: z.string().min(32),
  STORAGE_ENDPOINT: z.string().url(),
  STORAGE_PUBLIC_URL: z.string().url(),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_KEY: z.string().optional(),
  STORAGE_SECRET: z.string().optional(),
  STORAGE_REGION: z.string().min(1).default('auto'),
  // When set, new photo URLs point at the CDN instead of STORAGE_PUBLIC_URL.
  STORAGE_CDN_URL: z.preprocess(emptyAsUnset, z.string().url().optional()),
  // When set, deleting a photo also purges it from the CDN.
  STORAGE_CDN_DISTRIBUTION_ID: z.preprocess(emptyAsUnset, z.string().optional()),
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
