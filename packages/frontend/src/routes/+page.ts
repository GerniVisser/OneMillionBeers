import type { PageLoad } from './$types'
import {
  getGlobalCount,
  getGlobalFeed,
  getGlobalStats,
  getGlobalActivity,
  getGlobalHourly,
  getGlobalMonthly,
} from '$lib/api'

export const load: PageLoad = async ({ fetch }) => {
  const [countData, feedData, stats, activity, hourly, monthly] = await Promise.all([
    getGlobalCount(fetch),
    getGlobalFeed(fetch, { limit: 20, offset: 0 }),
    getGlobalStats(fetch),
    getGlobalActivity(fetch),
    getGlobalHourly(fetch),
    getGlobalMonthly(fetch),
  ])
  return {
    count: countData.count,
    feed: feedData,
    stats,
    activity,
    hourly,
    monthly,
  }
}
