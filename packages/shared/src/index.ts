// Zod schemas and inferred types — source of truth for all data shapes

export const version = '0.0.1'

export {
  UuidSchema,
  IsoDatetimeSchema,
  SlugSchema,
  Sha256HexSchema,
  PhoneE164Schema,
} from './primitives.js'

export {
  GroupSchema,
  GroupSummarySchema,
  GroupProfileResponseSchema,
  type Group,
  type GroupSummary,
  type GroupProfileResponse,
} from './group.js'

export {
  UserSchema,
  UserSummarySchema,
  UserProfileResponseSchema,
  type User,
  type UserSummary,
  type UserProfileResponse,
} from './user.js'

export {
  BeerLogSchema,
  BeerLogRequestSchema,
  FeedItemSchema,
  type BeerLog,
  type BeerLogRequest,
  type FeedItem,
} from './beer.js'

export {
  PaginationQuerySchema,
  PaginatedResponseSchema,
  LeaderboardEntrySchema,
  LeaderboardResponseSchema,
  GlobalCountResponseSchema,
  UserStatsResponseSchema,
  SseEventSchema,
  type PaginationQuery,
  type LeaderboardEntry,
  type LeaderboardResponse,
  type GlobalCountResponse,
  type UserStatsResponse,
  type SseEvent,
} from './api.js'
