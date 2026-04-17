import { z } from 'zod'
import { UuidSchema, IsoDatetimeSchema } from './primitives.js'
import { UserSummarySchema } from './user.js'

// GET /v1/users/search
export const UserSearchQuerySchema = z.object({
  q: z.string().min(4).max(100),
  limit: z.coerce.number().int().min(1).max(5).default(3),
})
export type UserSearchQuery = z.infer<typeof UserSearchQuerySchema>

export const UserSearchResponseSchema = z.object({
  results: z.array(UserSummarySchema),
})
export type UserSearchResponse = z.infer<typeof UserSearchResponseSchema>

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

// GET /v1/users/:userId/feed — re-uses the same FeedItem / paginated shape as group feed
// (no new schema needed; callers use PaginatedResponseSchema(FeedItemSchema))

// GET /v1/users/:userId/activity
import { ActivityDaySchema, HourBucketSchema, MonthBucketSchema } from './group-stats.js'

export const UserActivityResponseSchema = z.object({ days: z.array(ActivityDaySchema) })
export type UserActivityResponse = z.infer<typeof UserActivityResponseSchema>

export const UserHourlyResponseSchema = z.object({ hours: z.array(HourBucketSchema) })
export type UserHourlyResponse = z.infer<typeof UserHourlyResponseSchema>

export const UserMonthlyResponseSchema = z.object({ months: z.array(MonthBucketSchema) })
export type UserMonthlyResponse = z.infer<typeof UserMonthlyResponseSchema>

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

// GET /v1/global/stream (SSE) — discriminated union so subscribers can handle
// additions and deletions without coupling to a single shape.
export const SseEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('count'),
    count: z.number().int().nonnegative(),
    latestBeer: z
      .object({
        id: UuidSchema,
        photoUrl: z.string().url(),
        loggedAt: IsoDatetimeSchema,
        userName: z.string().nullable(),
        userSlug: z.string(),
        groupName: z.string(),
        groupSlug: z.string(),
        countryCode: z.string().length(2).nullable(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal('remove'),
    id: UuidSchema, // beer_log.id of the deleted row
    count: z.number().int().nonnegative(),
  }),
])
export type SseEvent = z.infer<typeof SseEventSchema>
