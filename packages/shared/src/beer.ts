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
  // Required: (sourceGroupId, sourceMessageId) is the natural key that makes
  // ingestion idempotent across several bots. Optional would mean the key can be
  // absent, which means the unique index can be bypassed.
  sourceMessageId: z.string().min(1),
  photoHash: z.string().length(64).optional(), // SHA-256 hex digest, stored but not a key
})
export type BeerLogRequest = z.infer<typeof BeerLogRequestSchema>

// What the backend did with a beer log, so the collector can clean up after
// itself: it uploads the photo to S3 before it knows whether the beer is wanted.
//   created   — inserted
//   duplicate — another bot already logged this message; its photo is at the
//               same S3 key, so leave the object alone
//   revoked   — deleted for everyone before this copy arrived; the object will
//               never be referenced and should be removed
export const BeerLogResponseSchema = z.object({
  ok: z.literal(true),
  outcome: z.enum(['created', 'duplicate', 'revoked']),
})
export type BeerLogResponse = z.infer<typeof BeerLogResponseSchema>
export type BeerLogOutcome = BeerLogResponse['outcome']

// DELETE /v1/internal/beer-log/by-message/:sourceMessageId?sourceGroupId=… (Collector → Backend)
// Always ok: the revocation is recorded whether or not a beer log existed.
// photoUrl is present only when a row was deleted and its photo should go too.
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
