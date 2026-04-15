import type { ActivityDay, FeedItem, HourBucket, SseEvent } from '@omb/shared'

export interface WeekdayEntry {
  name: string
  count: number
  pct: number
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
}

export function getWeekdayBreakdown(days: ActivityDay[]): WeekdayEntry[] {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const counts = new Array(7).fill(0)
  for (const d of days) {
    const dt = new Date(d.date + 'T12:00:00')
    counts[dt.getDay()] += d.count
  }
  const max = Math.max(...counts, 1)
  return names.map((name, i) => ({ name, count: counts[i], pct: counts[i] / max }))
}

export function getPeakHour(hours: HourBucket[]): string | null {
  const max = hours.reduce((a, b) => (b.count > a.count ? b : a), { hour: -1, count: 0 })
  if (max.count === 0) return null
  const h = max.hour
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

export function formatHour(h: number): string {
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

export function transformSseToFeedItem(
  latestBeer: NonNullable<Extract<SseEvent, { type: 'count' }>['latestBeer']>,
): FeedItem {
  return {
    id: latestBeer.id,
    photoUrl: latestBeer.photoUrl,
    loggedAt: latestBeer.loggedAt,
    user: {
      id: latestBeer.id,
      displayName: latestBeer.userName,
      pseudoName: null,
      slug: latestBeer.userSlug,
      countryCode: latestBeer.countryCode,
    },
    group: {
      id: latestBeer.id,
      name: latestBeer.groupName,
      slug: latestBeer.groupSlug,
    },
  }
}
