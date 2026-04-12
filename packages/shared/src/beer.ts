import { z } from 'zod'
import { UuidSchema, IsoDatetimeSchema } from './primitives.js'
import { UserSummarySchema } from './user.js'
import { GroupSummarySchema } from './group.js'

export const BeerLogSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  groupId: UuidSchema,
  photoUrl: z.string().url(),
  loggedAt: IsoDatetimeSchema,
  createdAt: IsoDatetimeSchema,
})
export type BeerLog = z.infer<typeof BeerLogSchema>

// POST /v1/internal/beer-log (Collector → Backend)
// groupName included so group name stays current via upsert (no separate sync needed)
// senderId is an opaque string — the collector hashes whatever identity the platform provides
// pushName is optional for backward compatibility during rolling deploys
export const BeerLogRequestSchema = z.object({
  sourceGroupId: z.string().min(1),
  groupName: z.string().min(1).max(512),
  senderId: z.string().min(1),
  timestamp: IsoDatetimeSchema,
  photoUrl: z.string().url(),
  pushName: z.string().max(512).nullable().optional(),
  sourceMessageId: z.string().min(1).optional(),
})
export type BeerLogRequest = z.infer<typeof BeerLogRequestSchema>

// DELETE /v1/internal/beer-log/by-message/:sourceMessageId (Collector → Backend)
export const BeerLogDeleteResponseSchema = z.object({
  ok: z.boolean(),
  photoUrl: z.string().url().optional(),
})
export type BeerLogDeleteResponse = z.infer<typeof BeerLogDeleteResponseSchema>

// Feed item — used for both group feed and global feed
// createdAt excluded (DB bookkeeping, not displayed)
export const FeedItemSchema = z.object({
  id: UuidSchema,
  photoUrl: z.string().url(),
  loggedAt: IsoDatetimeSchema,
  user: UserSummarySchema,
  group: GroupSummarySchema,
})
export type FeedItem = z.infer<typeof FeedItemSchema>
