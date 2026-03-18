import { z } from 'zod'
import { UuidSchema, IsoDatetimeSchema, PhoneE164Schema } from './primitives.js'
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
export const BeerLogRequestSchema = z.object({
  whatsappGroupId: z.string().min(1),
  groupName: z.string().min(1).max(512),
  senderPhone: PhoneE164Schema,
  timestamp: IsoDatetimeSchema,
  photoUrl: z.string().url(),
})
export type BeerLogRequest = z.infer<typeof BeerLogRequestSchema>

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
