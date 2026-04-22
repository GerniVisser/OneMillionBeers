import type { PageLoad } from './$types'
import { getGroups } from '$lib/api'

export const load: PageLoad = async ({ fetch }) => {
  const { items, total } = await getGroups(fetch, { limit: 50 })
  return { groups: items, total }
}
