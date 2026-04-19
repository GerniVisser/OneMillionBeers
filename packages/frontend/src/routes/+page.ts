import type { PageLoad } from './$types'
import {
  getGlobalCount,
  getGlobalFeed,
  getGlobalStats,
  getGlobalActivity,
  getGlobalHourly,
  getGlobalMonthly,
  getGlobalCountries,
} from '$lib/api'

export const load: PageLoad = async ({ fetch }) => {
  const [countData, feedData, stats] = await Promise.all([
    getGlobalCount(fetch),
    getGlobalFeed(fetch, { limit: 20, offset: 0 }),
    getGlobalStats(fetch),
  ])
  return {
    count: countData.count,
    feed: feedData,
    stats,
    // Deferred: resolved in the page component after initial render
    activity: getGlobalActivity(fetch),
    hourly: getGlobalHourly(fetch),
    monthly: getGlobalMonthly(fetch),
    countries: getGlobalCountries(fetch),
  }
}
