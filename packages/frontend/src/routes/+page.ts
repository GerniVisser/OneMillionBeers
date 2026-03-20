import type { PageLoad } from './$types'
import { getGlobalCount, getGlobalFeed, getGlobalLeaderboard } from '$lib/api'

export const load: PageLoad = async ({ fetch }) => {
  const [countData, feedData, leaderboard] = await Promise.all([
    getGlobalCount(fetch),
    getGlobalFeed(fetch, { limit: 20, offset: 0 }),
    getGlobalLeaderboard(fetch),
  ])
  return {
    count: countData.count,
    feed: feedData,
    leaderboard,
  }
}
