import type { PageLoad } from './$types'
import { error } from '@sveltejs/kit'
import {
  getGroupProfile,
  getGroupFeed,
  getGroupLeaderboard,
  getGroupStats,
  getGroupActivity,
  getGroupHourly,
  getGroupMonthly,
} from '$lib/api'

export const load: PageLoad = async ({ fetch, params }) => {
  try {
    const [profile, feed, leaderboard, stats] = await Promise.all([
      getGroupProfile(fetch, params.slug),
      getGroupFeed(fetch, params.slug, { limit: 20, offset: 0 }),
      getGroupLeaderboard(fetch, params.slug),
      getGroupStats(fetch, params.slug),
    ])
    return {
      profile,
      feed,
      leaderboard,
      stats,
      // Deferred: resolved in the page component after initial render
      activity: getGroupActivity(fetch, params.slug),
      hourly: getGroupHourly(fetch, params.slug),
      monthly: getGroupMonthly(fetch, params.slug),
    }
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string }
    error(err.status ?? 500, err.message ?? 'Unknown error')
  }
}
