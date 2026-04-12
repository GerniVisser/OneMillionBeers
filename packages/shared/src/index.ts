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
  GroupListItemSchema,
  GroupSyncRequestSchema,
  type Group,
  type GroupSummary,
  type GroupProfileResponse,
  type GroupListItem,
  type GroupSyncRequest,
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
  BeerLogDeleteResponseSchema,
  FeedItemSchema,
  type BeerLog,
  type BeerLogRequest,
  type BeerLogDeleteResponse,
  type FeedItem,
} from './beer.js'

export {
  GroupStatsResponseSchema,
  GroupActivityResponseSchema,
  GroupHourlyResponseSchema,
  GroupMonthlyResponseSchema,
  ActivityDaySchema,
  HourBucketSchema,
  MonthBucketSchema,
  type GroupStatsResponse,
  type ActivityDay,
  type GroupActivityResponse,
  type HourBucket,
  type GroupHourlyResponse,
  type MonthBucket,
  type GroupMonthlyResponse,
} from './group-stats.js'

export {
  GlobalStatsResponseSchema,
  GlobalActivityResponseSchema,
  GlobalHourlyResponseSchema,
  GlobalMonthlyResponseSchema,
  CountryStatSchema,
  GlobalCountriesResponseSchema,
  type GlobalStatsResponse,
  type GlobalActivityResponse,
  type GlobalHourlyResponse,
  type GlobalMonthlyResponse,
  type CountryStat,
  type GlobalCountriesResponse,
} from './global-stats.js'

export {
  PaginationQuerySchema,
  PaginatedResponseSchema,
  GroupSearchQuerySchema,
  LeaderboardEntrySchema,
  LeaderboardResponseSchema,
  GlobalCountResponseSchema,
  UserStatsResponseSchema,
  SseEventSchema,
  type PaginationQuery,
  type GroupSearchQuery,
  type LeaderboardEntry,
  type LeaderboardResponse,
  type GlobalCountResponse,
  type UserStatsResponse,
  type SseEvent,
} from './api.js'
