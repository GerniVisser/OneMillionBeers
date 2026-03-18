import { z } from 'zod'
import { UuidSchema, IsoDatetimeSchema, SlugSchema, Sha256HexSchema } from './primitives.js'

export const UserSchema = z.object({
  id: UuidSchema,
  phoneHash: Sha256HexSchema,
  displayName: z.string().min(1).max(256).nullable(),
  slug: SlugSchema,
  createdAt: IsoDatetimeSchema,
})
export type User = z.infer<typeof UserSchema>

// Embedded in feed items and leaderboard — excludes phoneHash (sensitive)
export const UserSummarySchema = z.object({
  id: UuidSchema,
  displayName: z.string().nullable(),
  slug: SlugSchema,
})
export type UserSummary = z.infer<typeof UserSummarySchema>

// GET /v1/users/:userId — phoneHash never exposed publicly
export const UserProfileResponseSchema = UserSchema.omit({ phoneHash: true })
export type UserProfileResponse = z.infer<typeof UserProfileResponseSchema>
