import type { PageLoad } from './$types'
import { getGroups } from '$lib/api'

export const load: PageLoad = async ({ fetch }) => {
  const { items } = await getGroups(fetch, { limit: 100 })
  return { groups: items.filter((g) => g.joinable) }
}
