import type pg from 'pg'
import type {
  Group,
  GroupListItem,
  User,
  BeerLog,
  FeedItem,
  LeaderboardEntry,
  UserStatsResponse,
  GroupStatsResponse,
  GlobalStatsResponse,
  ActivityDay,
  HourBucket,
  MonthBucket,
} from '@omb/shared'

// ─── Groups ─────────────────────────────────────────────────────────────────

export async function upsertGroup(
  pool: pg.Pool,
  sourceGroupId: string,
  name: string,
  avatarUrl?: string | null,
): Promise<Group> {
  const slug = toSlug(name)
  try {
    const { rows } = await pool.query<Group>(
      `INSERT INTO groups (source_group_id, name, slug, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (source_group_id) DO UPDATE SET
         name = EXCLUDED.name,
         avatar_url = COALESCE(EXCLUDED.avatar_url, groups.avatar_url)
       RETURNING id, source_group_id AS "sourceGroupId", name, slug,
                 avatar_url AS "avatarUrl", created_at AS "createdAt"`,
      [sourceGroupId, name, slug, avatarUrl ?? null],
    )
    return rows[0]
  } catch (err: unknown) {
    // Two different groups can share the same name → slug uniqueness conflict on INSERT.
    // Retry with a suffix derived from the sourceGroupId to guarantee uniqueness.
    if ((err as { code?: string }).code === '23505') {
      const suffix = sourceGroupId
        .replace(/[^a-z0-9]/gi, '')
        .slice(-6)
        .toLowerCase()
      const uniqueSlug = (slug + '-' + suffix).slice(0, 128)
      const { rows } = await pool.query<Group>(
        `INSERT INTO groups (source_group_id, name, slug, avatar_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (source_group_id) DO UPDATE SET
           name = EXCLUDED.name,
           avatar_url = COALESCE(EXCLUDED.avatar_url, groups.avatar_url)
         RETURNING id, source_group_id AS "sourceGroupId", name, slug,
                   avatar_url AS "avatarUrl", created_at AS "createdAt"`,
        [sourceGroupId, name, uniqueSlug, avatarUrl ?? null],
      )
      return rows[0]
    }
    throw err
  }
}

export async function findGroupById(pool: pg.Pool, id: string): Promise<Group | null> {
  const { rows } = await pool.query<Group>(
    `SELECT id, source_group_id AS "sourceGroupId", name, slug,
            avatar_url AS "avatarUrl", created_at AS "createdAt"
     FROM groups WHERE id = $1`,
    [id],
  )
  return rows[0] ?? null
}

export async function findGroupBySlug(pool: pg.Pool, slug: string): Promise<Group | null> {
  const { rows } = await pool.query<Group>(
    `SELECT id, source_group_id AS "sourceGroupId", name, slug,
            avatar_url AS "avatarUrl", created_at AS "createdAt"
     FROM groups WHERE slug = $1`,
    [slug],
  )
  return rows[0] ?? null
}

export async function getGroupTotalBeers(pool: pg.Pool, groupId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM beer_logs WHERE group_id = $1`,
    [groupId],
  )
  return parseInt(rows[0].count, 10)
}

export async function listGroups(
  pool: pg.Pool,
  limit: number,
  offset: number,
  search?: string,
): Promise<{ items: GroupListItem[]; total: number }> {
  const filter = search ?? null
  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(DISTINCT g.id)::text AS count
     FROM groups g
     WHERE ($1::text IS NULL OR g.name ILIKE '%' || $1 || '%')`,
    [filter],
  )
  const total = parseInt(countRows[0].count, 10)

  const { rows } = await pool.query<GroupListItem>(
    `SELECT
       g.id,
       g.name,
       g.slug,
       g.avatar_url AS "avatarUrl",
       COUNT(DISTINCT bl.user_id)::int AS "memberCount"
     FROM groups g
     LEFT JOIN beer_logs bl ON bl.group_id = g.id
     WHERE ($1::text IS NULL OR g.name ILIKE '%' || $1 || '%')
     GROUP BY g.id, g.avatar_url
     ORDER BY g.name ASC
     LIMIT $2 OFFSET $3`,
    [filter, limit, offset],
  )
  return { items: rows, total }
}

export async function getGroupStats(pool: pg.Pool, groupId: string): Promise<GroupStatsResponse> {
  const { rows: aggRows } = await pool.query<{
    totalBeers: number
    activeMemberCount: number
    daysActive: number
    firstLog: string | null
  }>(
    `SELECT
       COUNT(*)::int AS "totalBeers",
       COUNT(DISTINCT user_id)::int AS "activeMemberCount",
       COUNT(DISTINCT logged_at::date)::int AS "daysActive",
       MIN(logged_at)::text AS "firstLog"
     FROM beer_logs WHERE group_id = $1`,
    [groupId],
  )
  const agg = aggRows[0]

  const { rows: peakRows } = await pool.query<{ date: string; count: number }>(
    `SELECT logged_at::date::text AS date, COUNT(*)::int AS count
     FROM beer_logs WHERE group_id = $1
     GROUP BY 1 ORDER BY 2 DESC LIMIT 1`,
    [groupId],
  )

  const totalBeers = agg.totalBeers
  const daysActive = agg.daysActive
  const avgPerDay = daysActive > 0 ? Math.round((totalBeers / daysActive) * 10) / 10 : 0
  const peakDay = peakRows[0] ?? null

  return {
    totalBeers,
    activeMemberCount: agg.activeMemberCount,
    daysActive,
    avgPerDay,
    peakDay,
  }
}

export async function getGroupActivity(pool: pg.Pool, groupId: string): Promise<ActivityDay[]> {
  const { rows } = await pool.query<{ date: string; count: number }>(
    `SELECT logged_at::date::text AS date, COUNT(*)::int AS count
     FROM beer_logs
     WHERE group_id = $1 AND logged_at >= NOW() - INTERVAL '182 days'
     GROUP BY 1 ORDER BY 1 ASC`,
    [groupId],
  )
  return rows
}

export async function getGroupHourly(pool: pg.Pool, groupId: string): Promise<HourBucket[]> {
  const { rows } = await pool.query<{ hour: number; count: number }>(
    `SELECT EXTRACT(HOUR FROM logged_at)::int AS hour, COUNT(*)::int AS count
     FROM beer_logs WHERE group_id = $1
     GROUP BY 1 ORDER BY 1 ASC`,
    [groupId],
  )
  // Fill in any missing hours with 0
  const map = new Map(rows.map((r) => [r.hour, r.count]))
  return Array.from({ length: 24 }, (_, h) => ({ hour: h, count: map.get(h) ?? 0 }))
}

export async function getGroupMonthly(pool: pg.Pool, groupId: string): Promise<MonthBucket[]> {
  const { rows } = await pool.query<{ month: string; count: number }>(
    `SELECT TO_CHAR(DATE_TRUNC('month', logged_at), 'YYYY-MM') AS month,
            COUNT(*)::int AS count
     FROM beer_logs WHERE group_id = $1
     GROUP BY 1 ORDER BY 1 ASC`,
    [groupId],
  )
  return rows
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function upsertUser(pool: pg.Pool, identityHash: string): Promise<User> {
  const slug = `user-${identityHash.slice(0, 12)}`
  const { rows } = await pool.query<User>(
    `INSERT INTO users (identity_hash, slug)
     VALUES ($1, $2)
     ON CONFLICT (identity_hash) DO NOTHING
     RETURNING id, identity_hash AS "identityHash", display_name AS "displayName", slug, created_at AS "createdAt"`,
    [identityHash, slug],
  )
  if (rows[0]) return rows[0]
  // Already existed — fetch it
  const { rows: existing } = await pool.query<User>(
    `SELECT id, identity_hash AS "identityHash", display_name AS "displayName", slug, created_at AS "createdAt"
     FROM users WHERE identity_hash = $1`,
    [identityHash],
  )
  return existing[0]
}

export async function findUserById(pool: pg.Pool, id: string): Promise<User | null> {
  const { rows } = await pool.query<User>(
    `SELECT id, identity_hash AS "identityHash", display_name AS "displayName", slug, created_at AS "createdAt"
     FROM users WHERE id = $1`,
    [id],
  )
  return rows[0] ?? null
}

export async function findUserBySlug(pool: pg.Pool, slug: string): Promise<User | null> {
  const { rows } = await pool.query<User>(
    `SELECT id, identity_hash AS "identityHash", display_name AS "displayName", slug, created_at AS "createdAt"
     FROM users WHERE slug = $1`,
    [slug],
  )
  return rows[0] ?? null
}

// ─── Beer Logs ────────────────────────────────────────────────────────────────

export async function insertBeerLog(
  pool: pg.Pool,
  userId: string,
  groupId: string,
  photoUrl: string,
  loggedAt: string,
): Promise<BeerLog> {
  const { rows } = await pool.query<BeerLog>(
    `INSERT INTO beer_logs (user_id, group_id, photo_url, logged_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id AS "userId", group_id AS "groupId", photo_url AS "photoUrl",
               logged_at AS "loggedAt", created_at AS "createdAt"`,
    [userId, groupId, photoUrl, loggedAt],
  )
  return rows[0]
}

// ─── Feed ────────────────────────────────────────────────────────────────────

export async function getGlobalFeed(
  pool: pg.Pool,
  limit: number,
  offset: number,
): Promise<{ items: FeedItem[]; total: number }> {
  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM beer_logs`,
  )
  const total = parseInt(countRows[0].count, 10)

  const { rows } = await pool.query<FeedItem>(
    `SELECT
       bl.id,
       bl.photo_url AS "photoUrl",
       bl.logged_at AS "loggedAt",
       json_build_object('id', u.id, 'displayName', u.display_name, 'slug', u.slug) AS user,
       json_build_object('id', g.id, 'name', g.name, 'slug', g.slug) AS group
     FROM beer_logs bl
     JOIN users u ON bl.user_id = u.id
     JOIN groups g ON bl.group_id = g.id
     ORDER BY bl.logged_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  )
  return { items: rows, total }
}

export async function getGroupFeed(
  pool: pg.Pool,
  groupId: string,
  limit: number,
  offset: number,
): Promise<{ items: FeedItem[]; total: number }> {
  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM beer_logs WHERE group_id = $1`,
    [groupId],
  )
  const total = parseInt(countRows[0].count, 10)

  const { rows } = await pool.query<FeedItem>(
    `SELECT
       bl.id,
       bl.photo_url AS "photoUrl",
       bl.logged_at AS "loggedAt",
       json_build_object('id', u.id, 'displayName', u.display_name, 'slug', u.slug) AS user,
       json_build_object('id', g.id, 'name', g.name, 'slug', g.slug) AS group
     FROM beer_logs bl
     JOIN users u ON bl.user_id = u.id
     JOIN groups g ON bl.group_id = g.id
     WHERE bl.group_id = $1
     ORDER BY bl.logged_at DESC
     LIMIT $2 OFFSET $3`,
    [groupId, limit, offset],
  )
  return { items: rows, total }
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export async function getGlobalLeaderboard(pool: pg.Pool, limit = 10): Promise<LeaderboardEntry[]> {
  const { rows } = await pool.query<{
    rank: string
    beerCount: string
    id: string
    displayName: string | null
    slug: string
  }>(
    `SELECT
       RANK() OVER (ORDER BY COUNT(*) DESC)::text AS rank,
       COUNT(*)::text AS "beerCount",
       u.id,
       u.display_name AS "displayName",
       u.slug
     FROM beer_logs bl
     JOIN users u ON bl.user_id = u.id
     GROUP BY u.id, u.display_name, u.slug
     ORDER BY COUNT(*) DESC
     LIMIT $1`,
    [limit],
  )
  return rows.map((r) => ({
    rank: parseInt(r.rank, 10),
    beerCount: parseInt(r.beerCount, 10),
    user: { id: r.id, displayName: r.displayName, slug: r.slug },
  }))
}

export async function getGroupLeaderboard(
  pool: pg.Pool,
  groupId: string,
  limit = 10,
): Promise<LeaderboardEntry[]> {
  const { rows } = await pool.query<{
    rank: string
    beerCount: string
    id: string
    displayName: string | null
    slug: string
  }>(
    `SELECT
       RANK() OVER (ORDER BY COUNT(*) DESC)::text AS rank,
       COUNT(*)::text AS "beerCount",
       u.id,
       u.display_name AS "displayName",
       u.slug
     FROM beer_logs bl
     JOIN users u ON bl.user_id = u.id
     WHERE bl.group_id = $1
     GROUP BY u.id, u.display_name, u.slug
     ORDER BY COUNT(*) DESC
     LIMIT $2`,
    [groupId, limit],
  )
  return rows.map((r) => ({
    rank: parseInt(r.rank, 10),
    beerCount: parseInt(r.beerCount, 10),
    user: { id: r.id, displayName: r.displayName, slug: r.slug },
  }))
}

// ─── Global count ─────────────────────────────────────────────────────────────

export async function getGlobalCount(pool: pg.Pool): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM beer_logs`,
  )
  return parseInt(rows[0].count, 10)
}

// ─── Global Stats ─────────────────────────────────────────────────────────────

export async function getGlobalStats(pool: pg.Pool): Promise<GlobalStatsResponse> {
  const { rows: aggRows } = await pool.query<{
    totalBeers: number
    activeMemberCount: number
    activeGroupCount: number
    daysActive: number
    firstLog: string | null
  }>(
    `SELECT
       COUNT(*)::int                        AS "totalBeers",
       COUNT(DISTINCT user_id)::int         AS "activeMemberCount",
       COUNT(DISTINCT group_id)::int        AS "activeGroupCount",
       COUNT(DISTINCT logged_at::date)::int AS "daysActive",
       MIN(logged_at)::text                 AS "firstLog"
     FROM beer_logs`,
  )
  const agg = aggRows[0]

  const { rows: peakRows } = await pool.query<{ date: string; count: number }>(
    `SELECT logged_at::date::text AS date, COUNT(*)::int AS count
     FROM beer_logs
     GROUP BY 1 ORDER BY 2 DESC LIMIT 1`,
  )

  const totalBeers = agg.totalBeers
  const daysActive = agg.daysActive
  const avgPerDay = daysActive > 0 ? Math.round((totalBeers / daysActive) * 10) / 10 : 0
  const peakDay = peakRows[0] ?? null

  return {
    totalBeers,
    activeMemberCount: agg.activeMemberCount,
    activeGroupCount: agg.activeGroupCount,
    daysActive,
    avgPerDay,
    peakDay,
  }
}

export async function getGlobalActivity(pool: pg.Pool): Promise<ActivityDay[]> {
  const { rows } = await pool.query<{ date: string; count: number }>(
    `SELECT logged_at::date::text AS date, COUNT(*)::int AS count
     FROM beer_logs
     WHERE logged_at >= NOW() - INTERVAL '365 days'
     GROUP BY 1 ORDER BY 1 ASC`,
  )
  return rows
}

export async function getGlobalHourly(pool: pg.Pool): Promise<HourBucket[]> {
  const { rows } = await pool.query<{ hour: number; count: number }>(
    `SELECT EXTRACT(HOUR FROM logged_at)::int AS hour, COUNT(*)::int AS count
     FROM beer_logs
     GROUP BY 1 ORDER BY 1 ASC`,
  )
  const map = new Map(rows.map((r) => [r.hour, r.count]))
  return Array.from({ length: 24 }, (_, h) => ({ hour: h, count: map.get(h) ?? 0 }))
}

export async function getGlobalMonthly(pool: pg.Pool): Promise<MonthBucket[]> {
  const { rows } = await pool.query<{ month: string; count: number }>(
    `SELECT TO_CHAR(DATE_TRUNC('month', logged_at), 'YYYY-MM') AS month,
            COUNT(*)::int AS count
     FROM beer_logs
     GROUP BY 1 ORDER BY 1 ASC`,
  )
  return rows
}

// ─── User Stats ────────────────────────────────────────────────────────────────

export async function getUserStats(
  pool: pg.Pool,
  userId: string,
): Promise<Omit<UserStatsResponse, 'userId'>> {
  const { rows } = await pool.query<{ logged_at: string }>(
    `SELECT logged_at FROM beer_logs WHERE user_id = $1 ORDER BY logged_at ASC`,
    [userId],
  )

  const dates = rows.map((r) => new Date(r.logged_at))
  const now = new Date()

  const totalBeers = dates.length
  const thisMonth = dates.filter(
    (d) => d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth(),
  ).length
  const thisYear = dates.filter((d) => d.getUTCFullYear() === now.getUTCFullYear()).length

  const { currentStreak, longestStreak } = computeStreaks(dates)
  const favoriteHour = computeFavoriteHour(dates)

  return { totalBeers, thisMonth, thisYear, currentStreak, longestStreak, favoriteHour }
}

// ─── Latest beer for SSE ───────────────────────────────────────────────────────

export async function getLatestBeer(pool: pg.Pool): Promise<{
  id: string
  photoUrl: string
  loggedAt: string
  userName: string | null
  groupName: string
} | null> {
  const { rows } = await pool.query(
    `SELECT bl.id, bl.photo_url AS "photoUrl", bl.logged_at AS "loggedAt",
            u.display_name AS "userName", g.name AS "groupName"
     FROM beer_logs bl
     JOIN users u ON bl.user_id = u.id
     JOIN groups g ON bl.group_id = g.id
     ORDER BY bl.logged_at DESC LIMIT 1`,
  )
  return rows[0] ?? null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function toSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 128) || 'group'
  )
}

export function computeStreaks(dates: Date[]): { currentStreak: number; longestStreak: number } {
  if (dates.length === 0) return { currentStreak: 0, longestStreak: 0 }

  // Dedupe to unique UTC days
  const days = [...new Set(dates.map((d) => d.toISOString().slice(0, 10)))].sort()

  let longestStreak = 1
  let current = 1

  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1])
    const curr = new Date(days[i])
    const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
    if (diff === 1) {
      current++
      longestStreak = Math.max(longestStreak, current)
    } else {
      current = 1
    }
  }

  // Current streak: work backwards from today
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const lastDay = days[days.length - 1]

  if (lastDay !== today && lastDay !== yesterday) {
    return { currentStreak: 0, longestStreak }
  }

  let currentStreak = 1
  for (let i = days.length - 2; i >= 0; i--) {
    const prev = new Date(days[i])
    const next = new Date(days[i + 1])
    const diff = (next.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
    if (diff === 1) {
      currentStreak++
    } else {
      break
    }
  }

  return { currentStreak, longestStreak }
}

export function computeFavoriteHour(dates: Date[]): number | null {
  if (dates.length < 5) return null
  const counts = new Array<number>(24).fill(0)
  for (const d of dates) counts[d.getUTCHours()]++
  const max = Math.max(...counts)
  return counts.indexOf(max)
}
