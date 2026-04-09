import { z } from 'zod'
import { UuidSchema, IsoDatetimeSchema } from './primitives.js'
import { UserSummarySchema } from './user.js'

// Offset-based pagination query params (MVP)
export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
})
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>

// GET /v1/groups — pagination + optional name search
export const GroupSearchQuerySchema = PaginationQuerySchema.extend({
  search: z.string().optional(),
})
export type GroupSearchQuery = z.infer<typeof GroupSearchQuerySchema>

// Generic paginated response wrapper — used as PaginatedResponseSchema(FeedItemSchema)
export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  })

// Leaderboard — not paginated at MVP (top-N array; offset pagination has rank-consistency issues)
export const LeaderboardEntrySchema = z.object({
  rank: z.number().int().positive(),
  user: UserSummarySchema,
  beerCount: z.number().int().nonnegative(),
})
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>

export const LeaderboardResponseSchema = z.object({
  entries: z.array(LeaderboardEntrySchema),
})
export type LeaderboardResponse = z.infer<typeof LeaderboardResponseSchema>

// GET /v1/global/count
export const GlobalCountResponseSchema = z.object({
  count: z.number().int().nonnegative(),
})
export type GlobalCountResponse = z.infer<typeof GlobalCountResponseSchema>

// GET /v1/users/:userId/stats
export const UserStatsResponseSchema = z.object({
  userId: UuidSchema,
  totalBeers: z.number().int().nonnegative(),
  thisMonth: z.number().int().nonnegative(),
  thisYear: z.number().int().nonnegative(),
  currentStreak: z.number().int().nonnegative(),
  longestStreak: z.number().int().nonnegative(),
  favoriteHour: z.number().int().min(0).max(23).nullable(), // null if too few logs
})
export type UserStatsResponse = z.infer<typeof UserStatsResponseSchema>

// GET /v1/global/stream (SSE) — inline shape, NOT FeedItemSchema
// type discriminant allows future union expansion without breaking subscribers
export const SseEventSchema = z.object({
  type: z.literal('count'),
  count: z.number().int().nonnegative(),
  latestBeer: z
    .object({
      id: UuidSchema,
      photoUrl: z.string().url(),
      loggedAt: IsoDatetimeSchema,
      userName: z.string().nullable(),
      groupName: z.string(),
      countryCode: z.string().length(2).nullable(),
    })
    .optional(),
})
export type SseEvent = z.infer<typeof SseEventSchema>
