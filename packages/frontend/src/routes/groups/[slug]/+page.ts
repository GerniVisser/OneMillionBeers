import type { PageLoad } from './$types'
import { error } from '@sveltejs/kit'
import { getGroupProfile, getGroupFeed, getGroupLeaderboard } from '$lib/api'

export const load: PageLoad = async ({ fetch, params }) => {
  try {
    const [profile, feed, leaderboard] = await Promise.all([
      getGroupProfile(fetch, params.slug),
      getGroupFeed(fetch, params.slug, { limit: 20, offset: 0 }),
      getGroupLeaderboard(fetch, params.slug),
    ])
    return { profile, feed, leaderboard }
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string }
    error(err.status ?? 500, err.message ?? 'Unknown error')
  }
}
