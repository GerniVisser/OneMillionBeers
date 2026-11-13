import type { PageLoad } from './$types'
import {
  getGlobalCount,
  getGlobalFeed,
  getGlobalStats,
  getGlobalActivity,
  getGlobalHourly,
  getGlobalMonthly,
  getGlobalCountries,
  getBeerOfTheWeek,
  getGlobalHighlights,
} from '$lib/api'

export const load: PageLoad = async ({ fetch }) => {
  const [countData, feedData, stats, beerOfTheWeek] = await Promise.all([
    getGlobalCount(fetch),
    getGlobalFeed(fetch, { limit: 20, offset: 0 }),
    getGlobalStats(fetch),
    getBeerOfTheWeek(fetch),
  ])
  return {
    count: countData.count,
    feed: feedData,
    stats,
    beerOfTheWeek: beerOfTheWeek.beer,
    // Deferred: resolved in the page component after initial render
    activity: getGlobalActivity(fetch),
    hourly: getGlobalHourly(fetch),
    monthly: getGlobalMonthly(fetch),
    countries: getGlobalCountries(fetch),
    highlights: getGlobalHighlights(fetch),
  }
}
