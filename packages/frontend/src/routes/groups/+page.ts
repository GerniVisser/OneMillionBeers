import type { PageLoad } from './$types'
import { getGroups } from '$lib/api'

export const load: PageLoad = async ({ fetch }) => {
  return getGroups(fetch, { limit: 20, offset: 0 })
}
