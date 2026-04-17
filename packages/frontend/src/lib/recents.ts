const MAX = 5
const USERS_KEY = 'omb:recent_users'
const GROUPS_KEY = 'omb:recent_groups'

export type RecentUser = {
  slug: string
  pseudoName: string | null
  countryCode: string | null
  visitedAt: number
}

export type RecentGroup = {
  slug: string
  name: string
  avatarUrl: string | null
  visitedAt: number
}

function read<T extends { slug: string; visitedAt: number }>(key: string): T[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]')
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(key)
      return []
    }
    // Filter out stale entries that are missing required fields rather than
    // blowing up downstream when code tries to access them.
    return parsed.filter(
      (item): item is T =>
        item !== null &&
        typeof item === 'object' &&
        typeof item.slug === 'string' &&
        typeof item.visitedAt === 'number',
    )
  } catch {
    // Malformed JSON — wipe the key so it doesn't fail on every load.
    localStorage.removeItem(key)
    return []
  }
}

function write<T>(key: string, items: T[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(items))
  } catch {
    // storage full or unavailable — silently ignore
  }
}

export function getRecentUsers(): RecentUser[] {
  return read<RecentUser>(USERS_KEY)
}

export function addRecentUser(u: Omit<RecentUser, 'visitedAt'>): void {
  const existing = read<RecentUser>(USERS_KEY).filter((r) => r.slug !== u.slug)
  write(USERS_KEY, [{ ...u, visitedAt: Date.now() }, ...existing].slice(0, MAX))
}

export function getRecentGroups(): RecentGroup[] {
  return read<RecentGroup>(GROUPS_KEY)
}

export function addRecentGroup(g: Omit<RecentGroup, 'visitedAt'>): void {
  const existing = read<RecentGroup>(GROUPS_KEY).filter((r) => r.slug !== g.slug)
  write(GROUPS_KEY, [{ ...g, visitedAt: Date.now() }, ...existing].slice(0, MAX))
}
