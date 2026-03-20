import type {
  GlobalCountResponse,
  FeedItem,
  LeaderboardResponse,
  GroupProfileResponse,
  UserProfileResponse,
  UserStatsResponse,
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
