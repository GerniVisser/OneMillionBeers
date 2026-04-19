import type { PageLoad } from './$types'
import { error } from '@sveltejs/kit'
import {
  getUserProfile,
  getUserStats,
  getUserActivity,
  getUserHourly,
  getUserMonthly,
} from '$lib/api'

export const load: PageLoad = async ({ fetch, params }) => {
  try {
    const [profile, stats] = await Promise.all([
      getUserProfile(fetch, params.slug),
      getUserStats(fetch, params.slug),
    ])
    return {
      profile,
      stats,
      // Deferred: resolved in the page component after initial render
      activity: getUserActivity(fetch, params.slug),
      hourly: getUserHourly(fetch, params.slug),
      monthly: getUserMonthly(fetch, params.slug),
    }
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string }
    error(err.status ?? 500, err.message ?? 'Unknown error')
  }
}
