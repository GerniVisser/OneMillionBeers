import { z } from 'zod'
import { UuidSchema, IsoDatetimeSchema, SlugSchema, Sha256HexSchema } from './primitives.js'

export const UserSchema = z.object({
  id: UuidSchema,
  identityHash: Sha256HexSchema,
  phoneNumber: z.string().nullable(),
  pushName: z.string().nullable(),
  displayName: z.string().min(1).max(256).nullable(),
  pseudoName: z.string().min(1).max(20).nullable(),
  slug: SlugSchema,
  countryCode: z.string().length(2).nullable(),
  active: z.boolean(),
  public: z.boolean(),
  createdAt: IsoDatetimeSchema,
})
export type User = z.infer<typeof UserSchema>

// Embedded in feed items and leaderboard — excludes all internal/sensitive fields
export const UserSummarySchema = z.object({
  id: UuidSchema,
  displayName: z.string().nullable(),
  pseudoName: z.string().nullable(),
  slug: SlugSchema,
  countryCode: z.string().length(2).nullable(),
})
export type UserSummary = z.infer<typeof UserSummarySchema>

// GET /v1/users/:userId — internal fields never exposed publicly
export const UserProfileResponseSchema = UserSchema.omit({
  identityHash: true,
  phoneNumber: true,
  pushName: true,
  active: true,
  public: true,
})
export type UserProfileResponse = z.infer<typeof UserProfileResponseSchema>
