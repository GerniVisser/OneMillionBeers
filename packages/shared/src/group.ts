import { z } from 'zod'
import { UuidSchema, IsoDatetimeSchema, SlugSchema } from './primitives.js'

export const GroupSchema = z.object({
  id: UuidSchema,
  sourceGroupId: z.string().min(1),
  name: z.string().min(1).max(512),
  slug: SlugSchema,
  avatarUrl: z.string().url().nullable().optional(),
  createdAt: IsoDatetimeSchema,
})
export type Group = z.infer<typeof GroupSchema>

// Embedded in feed items and leaderboard — excludes sourceGroupId (internal)
export const GroupSummarySchema = z.object({
  id: UuidSchema,
  name: z.string(),
  slug: SlugSchema,
  avatarUrl: z.string().url().nullable().optional(),
})
export type GroupSummary = z.infer<typeof GroupSummarySchema>

// GET /v1/groups/:groupId
export const GroupProfileResponseSchema = GroupSchema.extend({
  totalBeers: z.number().int().nonnegative(),
})
export type GroupProfileResponse = z.infer<typeof GroupProfileResponseSchema>

// GET /v1/groups — list item (summary + derived member count)
export const GroupListItemSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  slug: SlugSchema,
  avatarUrl: z.string().url().nullable().optional(),
  memberCount: z.number().int().nonnegative(),
})
export type GroupListItem = z.infer<typeof GroupListItemSchema>

// PUT /v1/internal/groups/:sourceGroupId — collector group metadata sync
export const GroupSyncRequestSchema = z.object({
  name: z.string().min(1).max(512),
  avatarUrl: z.string().url().nullable(),
})
export type GroupSyncRequest = z.infer<typeof GroupSyncRequestSchema>
