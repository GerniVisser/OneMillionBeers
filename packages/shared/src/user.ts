import { z } from 'zod'
import { UuidSchema, IsoDatetimeSchema, SlugSchema, Sha256HexSchema } from './primitives.js'

export const UserSchema = z.object({
  id: UuidSchema,
  identityHash: Sha256HexSchema,
  displayName: z.string().min(1).max(256).nullable(),
  slug: SlugSchema,
  createdAt: IsoDatetimeSchema,
})
export type User = z.infer<typeof UserSchema>

// Embedded in feed items and leaderboard — excludes identityHash (sensitive)
export const UserSummarySchema = z.object({
  id: UuidSchema,
  displayName: z.string().nullable(),
  slug: SlugSchema,
})
export type UserSummary = z.infer<typeof UserSummarySchema>

// GET /v1/users/:userId — identityHash never exposed publicly
export const UserProfileResponseSchema = UserSchema.omit({ identityHash: true })
export type UserProfileResponse = z.infer<typeof UserProfileResponseSchema>
