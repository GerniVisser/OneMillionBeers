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
    const [profile, stats, activity, hourly, monthly] = await Promise.all([
      getUserProfile(fetch, params.slug),
      getUserStats(fetch, params.slug),
      getUserActivity(fetch, params.slug),
      getUserHourly(fetch, params.slug),
      getUserMonthly(fetch, params.slug),
    ])
    return { profile, stats, activity, hourly, monthly }
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string }
    error(err.status ?? 500, err.message ?? 'Unknown error')
  }
}
