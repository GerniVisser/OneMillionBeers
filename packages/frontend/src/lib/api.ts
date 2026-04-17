import type {
  GlobalCountResponse,
  GlobalStatsResponse,
  GlobalActivityResponse,
  GlobalHourlyResponse,
  GlobalMonthlyResponse,
  GlobalCountriesResponse,
  FeedItem,
  LeaderboardResponse,
  GroupProfileResponse,
  GroupListItem,
  UserProfileResponse,
  UserStatsResponse,
  UserActivityResponse,
  UserHourlyResponse,
  UserMonthlyResponse,
  UserSearchResponse,
  GroupStatsResponse,
  GroupActivityResponse,
  GroupHourlyResponse,
  GroupMonthlyResponse,
} from '@omb/shared'

const API_BASE = '/api/v1'

type PaginatedResponse<T> = {
  items: T[]
  total: number
  limit: number
  offset: number
}

type Pagination = {
  limit?: number
  offset?: number
}

type ApiError = {
  status: number
  message: string
}

async function get<T>(
  fetch: typeof globalThis.fetch,
  path: string,
  params?: Record<string, string | number>,
): Promise<T> {
  let url = `${API_BASE}${path}`
  if (params && Object.keys(params).length > 0) {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))
    url += `?${qs}`
  }
  const res = await fetch(url)
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json()
      message = body.message ?? body.error ?? message
    } catch {
      // ignore parse errors
    }
    const err: ApiError = { status: res.status, message }
    throw err
  }
  return res.json() as Promise<T>
}

export function getGlobalCount(fetch: typeof globalThis.fetch): Promise<GlobalCountResponse> {
  return get<GlobalCountResponse>(fetch, '/global/count')
}

export function getGlobalFeed(
  fetch: typeof globalThis.fetch,
  pagination?: Pagination,
): Promise<PaginatedResponse<FeedItem>> {
  return get<PaginatedResponse<FeedItem>>(fetch, '/global/feed', {
    limit: pagination?.limit ?? 20,
    offset: pagination?.offset ?? 0,
  })
}

export function getGlobalLeaderboard(fetch: typeof globalThis.fetch): Promise<LeaderboardResponse> {
  return get<LeaderboardResponse>(fetch, '/global/leaderboard')
}

export function getGlobalStats(fetch: typeof globalThis.fetch): Promise<GlobalStatsResponse> {
  return get<GlobalStatsResponse>(fetch, '/global/stats')
}

export function getGlobalActivity(fetch: typeof globalThis.fetch): Promise<GlobalActivityResponse> {
  return get<GlobalActivityResponse>(fetch, '/global/activity')
}

export function getGlobalHourly(fetch: typeof globalThis.fetch): Promise<GlobalHourlyResponse> {
  return get<GlobalHourlyResponse>(fetch, '/global/hourly')
}

export function getGlobalMonthly(fetch: typeof globalThis.fetch): Promise<GlobalMonthlyResponse> {
  return get<GlobalMonthlyResponse>(fetch, '/global/monthly')
}

export function getGlobalCountries(
  fetch: typeof globalThis.fetch,
): Promise<GlobalCountriesResponse> {
  return get<GlobalCountriesResponse>(fetch, '/global/countries')
}

export function getGroups(
  fetch: typeof globalThis.fetch,
  params?: { search?: string; limit?: number; offset?: number },
): Promise<PaginatedResponse<GroupListItem>> {
  const p: Record<string, string | number> = {
    limit: params?.limit ?? 20,
    offset: params?.offset ?? 0,
  }
  if (params?.search) p.search = params.search
  return get<PaginatedResponse<GroupListItem>>(fetch, '/groups', p)
}

export function getGroupProfile(
  fetch: typeof globalThis.fetch,
  slug: string,
): Promise<GroupProfileResponse> {
  return get<GroupProfileResponse>(fetch, `/groups/${slug}`)
}

export function getGroupFeed(
  fetch: typeof globalThis.fetch,
  slug: string,
  pagination?: Pagination,
): Promise<PaginatedResponse<FeedItem>> {
  return get<PaginatedResponse<FeedItem>>(fetch, `/groups/${slug}/feed`, {
    limit: pagination?.limit ?? 20,
    offset: pagination?.offset ?? 0,
  })
}

export function getGroupLeaderboard(
  fetch: typeof globalThis.fetch,
  slug: string,
): Promise<LeaderboardResponse> {
  return get<LeaderboardResponse>(fetch, `/groups/${slug}/leaderboard`)
}

export function getGroupStats(
  fetch: typeof globalThis.fetch,
  slug: string,
): Promise<GroupStatsResponse> {
  return get<GroupStatsResponse>(fetch, `/groups/${slug}/stats`)
}

export function getGroupActivity(
  fetch: typeof globalThis.fetch,
  slug: string,
): Promise<GroupActivityResponse> {
  return get<GroupActivityResponse>(fetch, `/groups/${slug}/activity`)
}

export function getGroupHourly(
  fetch: typeof globalThis.fetch,
  slug: string,
): Promise<GroupHourlyResponse> {
  return get<GroupHourlyResponse>(fetch, `/groups/${slug}/hourly`)
}

export function getGroupMonthly(
  fetch: typeof globalThis.fetch,
  slug: string,
): Promise<GroupMonthlyResponse> {
  return get<GroupMonthlyResponse>(fetch, `/groups/${slug}/monthly`)
}

export function searchUsers(
  fetch: typeof globalThis.fetch,
  q: string,
  limit = 3,
): Promise<UserSearchResponse> {
  return get<UserSearchResponse>(fetch, '/users/search', { q, limit })
}

export function getUserProfile(
  fetch: typeof globalThis.fetch,
  slug: string,
): Promise<UserProfileResponse> {
  return get<UserProfileResponse>(fetch, `/users/${slug}`)
}

export function getUserStats(
  fetch: typeof globalThis.fetch,
  slug: string,
): Promise<UserStatsResponse> {
  return get<UserStatsResponse>(fetch, `/users/${slug}/stats`)
}

export function getUserFeed(
  fetch: typeof globalThis.fetch,
  slug: string,
  pagination?: Pagination,
): Promise<PaginatedResponse<FeedItem>> {
  return get<PaginatedResponse<FeedItem>>(fetch, `/users/${slug}/feed`, {
    limit: pagination?.limit ?? 20,
    offset: pagination?.offset ?? 0,
  })
}

export function getUserActivity(
  fetch: typeof globalThis.fetch,
  slug: string,
): Promise<UserActivityResponse> {
  return get<UserActivityResponse>(fetch, `/users/${slug}/activity`)
}

export function getUserHourly(
  fetch: typeof globalThis.fetch,
  slug: string,
): Promise<UserHourlyResponse> {
  return get<UserHourlyResponse>(fetch, `/users/${slug}/hourly`)
}

export function getUserMonthly(
  fetch: typeof globalThis.fetch,
  slug: string,
): Promise<UserMonthlyResponse> {
  return get<UserMonthlyResponse>(fetch, `/users/${slug}/monthly`)
}
