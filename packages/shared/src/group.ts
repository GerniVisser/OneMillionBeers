import { z } from 'zod'
import { UuidSchema, IsoDatetimeSchema, SlugSchema } from './primitives.js'

export const GroupSchema = z.object({
  id: UuidSchema,
  sourceGroupId: z.string().min(1),
  name: z.string().min(1).max(512),
  slug: SlugSchema,
  createdAt: IsoDatetimeSchema,
})
export type Group = z.infer<typeof GroupSchema>

// Embedded in feed items and leaderboard — excludes sourceGroupId (internal)
export const GroupSummarySchema = z.object({
  id: UuidSchema,
  name: z.string(),
  slug: SlugSchema,
})
export type GroupSummary = z.infer<typeof GroupSummarySchema>

// GET /v1/groups/:groupId
export const GroupProfileResponseSchema = GroupSchema.extend({
  totalBeers: z.number().int().nonnegative(),
})
export type GroupProfileResponse = z.infer<typeof GroupProfileResponseSchema>
