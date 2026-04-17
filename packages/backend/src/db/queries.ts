import type pg from 'pg'
import { normalisePhoneForSearch } from '../lib/phone.js'
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
  CountryStat,
} from '@omb/shared'

// ─── Groups ─────────────────────────────────────────────────────────────────

/**
 * Find an existing group or create a new one with the given fallback name.
 * Never updates the name of an existing group — that is the group sync's job.
 * Used by the beer-log path where the name is a raw JID fallback, not a real name.
 */
export async function findOrCreateGroup(
  pool: pg.Pool,
  sourceGroupId: string,
  fallbackName: string,
): Promise<Group> {
  const existing = await pool.query<Group>(
    `SELECT id, source_group_id AS "sourceGroupId", name, slug,
            avatar_url AS "avatarUrl", created_at AS "createdAt"
     FROM groups WHERE source_group_id = $1`,
    [sourceGroupId],
  )
  if (existing.rows[0]) return existing.rows[0]

  const slug = toSlug(fallbackName)
  try {
    const { rows } = await pool.query<Group>(
      `INSERT INTO groups (source_group_id, name, slug)
       VALUES ($1, $2, $3)
       ON CONFLICT (source_group_id) DO UPDATE SET
         source_group_id = groups.source_group_id
       RETURNING id, source_group_id AS "sourceGroupId", name, slug,
                 avatar_url AS "avatarUrl", created_at AS "createdAt"`,
      [sourceGroupId, fallbackName, slug],
    )
    return rows[0]
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      const suffix = sourceGroupId
        .replace(/[^a-z0-9]/gi, '')
        .slice(-6)
        .toLowerCase()
      const uniqueSlug = (slug + '-' + suffix).slice(0, 128)
      const { rows } = await pool.query<Group>(
        `INSERT INTO groups (source_group_id, name, slug)
         VALUES ($1, $2, $3)
         ON CONFLICT (source_group_id) DO UPDATE SET
           source_group_id = groups.source_group_id
         RETURNING id, source_group_id AS "sourceGroupId", name, slug,
                   avatar_url AS "avatarUrl", created_at AS "createdAt"`,
        [sourceGroupId, fallbackName, uniqueSlug],
      )
      return rows[0]
    }
    throw err
  }
}

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

export async function upsertUser(
  pool: pg.Pool,
  params: {
    identityHash: string
    phoneNumber: string | null
    pushName: string | null
    countryCode: string | null
  },
): Promise<User> {
  const { identityHash, phoneNumber, pushName, countryCode } = params
  const { rows } = await pool.query<User>(
    `INSERT INTO users (identity_hash, country_code, phone_number, push_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (identity_hash) DO UPDATE SET
       country_code = COALESCE(users.country_code, EXCLUDED.country_code),
       phone_number = COALESCE(users.phone_number, EXCLUDED.phone_number),
       push_name    = COALESCE(users.push_name,    EXCLUDED.push_name),
       pseudo_name  = COALESCE(users.pseudo_name,  EXCLUDED.pseudo_name),
       slug         = COALESCE(users.slug,         EXCLUDED.slug)
     RETURNING id, identity_hash AS "identityHash", display_name AS "displayName",
               pseudo_name AS "pseudoName", slug, country_code AS "countryCode",
               created_at AS "createdAt", phone_number AS "phoneNumber",
               push_name AS "pushName", active, public`,
    [identityHash, countryCode, phoneNumber, pushName],
  )
  return rows[0]
}

export async function findUserById(pool: pg.Pool, id: string): Promise<User | null> {
  const { rows } = await pool.query<User>(
    `SELECT id, identity_hash AS "identityHash", display_name AS "displayName",
            pseudo_name AS "pseudoName", slug, country_code AS "countryCode",
            created_at AS "createdAt", phone_number AS "phoneNumber",
            push_name AS "pushName", active, public
     FROM users WHERE id = $1`,
    [id],
  )
  return rows[0] ?? null
}

export async function findUserBySlug(pool: pg.Pool, slug: string): Promise<User | null> {
  const { rows } = await pool.query<User>(
    `SELECT id, identity_hash AS "identityHash", display_name AS "displayName",
            pseudo_name AS "pseudoName", slug, country_code AS "countryCode",
            created_at AS "createdAt", phone_number AS "phoneNumber",
            push_name AS "pushName", active, public
     FROM users WHERE slug = $1`,
    [slug],
  )
  return rows[0] ?? null
}

export async function searchUsers(
  pool: pg.Pool,
  q: string,
  limit: number,
): Promise<import('@omb/shared').UserSummary[]> {
  // Try to parse as a phone number first. If libphonenumber accepts it as a
  // valid E.164 number, do an exact match against phone_number in the DB.
  const normalisedPhone = normalisePhoneForSearch(q)

  if (normalisedPhone !== null) {
    const { rows } = await pool.query<import('@omb/shared').UserSummary>(
      `SELECT id, display_name AS "displayName", pseudo_name AS "pseudoName",
              slug, country_code AS "countryCode"
       FROM users
       WHERE phone_number = $1
       LIMIT $2`,
      [normalisedPhone, limit],
    )
    return rows
  }

  const { rows } = await pool.query<import('@omb/shared').UserSummary>(
    `SELECT id, display_name AS "displayName", pseudo_name AS "pseudoName",
            slug, country_code AS "countryCode"
     FROM users
     WHERE pseudo_name IS NOT NULL
       AND word_similarity($1, pseudo_name) > 0.4
     ORDER BY word_similarity($1, pseudo_name) DESC
     LIMIT $2`,
    [q, limit],
  )
  return rows
}

// ─── Beer Logs ────────────────────────────────────────────────────────────────

export async function insertBeerLog(
  pool: pg.Pool,
  userId: string,
  groupId: string,
  photoUrl: string,
  loggedAt: string,
  sourceMessageId?: string,
  photoHash?: string,
): Promise<BeerLog | null> {
  const { rows } = await pool.query<BeerLog>(
    `INSERT INTO beer_logs (user_id, group_id, photo_url, logged_at, source_message_id, photo_hash)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (photo_hash) DO NOTHING
     RETURNING id, user_id AS "userId", group_id AS "groupId", photo_url AS "photoUrl",
               logged_at AS "loggedAt", created_at AS "createdAt"`,
    [userId, groupId, photoUrl, loggedAt, sourceMessageId ?? null, photoHash ?? null],
  )
  return rows[0] ?? null
}

export async function deleteBeerLogBySourceMessageId(
  pool: pg.Pool,
  sourceMessageId: string,
): Promise<{ id: string; photoUrl: string } | null> {
  const { rows } = await pool.query<{ id: string; photoUrl: string }>(
    `DELETE FROM beer_logs WHERE source_message_id = $1 RETURNING id, photo_url AS "photoUrl"`,
    [sourceMessageId],
  )
  return rows[0] ?? null
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
       json_build_object('id', u.id, 'displayName', u.display_name, 'pseudoName', u.pseudo_name, 'slug', u.slug, 'countryCode', u.country_code) AS user,
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
       json_build_object('id', u.id, 'displayName', u.display_name, 'pseudoName', u.pseudo_name, 'slug', u.slug, 'countryCode', u.country_code) AS user,
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
    pseudoName: string | null
    slug: string
    countryCode: string | null
  }>(
    `SELECT
       RANK() OVER (ORDER BY COUNT(*) DESC)::text AS rank,
       COUNT(*)::text AS "beerCount",
       u.id,
       u.display_name AS "displayName",
       u.pseudo_name AS "pseudoName",
       u.slug,
       u.country_code AS "countryCode"
     FROM beer_logs bl
     JOIN users u ON bl.user_id = u.id
     GROUP BY u.id, u.display_name, u.pseudo_name, u.slug, u.country_code
     ORDER BY COUNT(*) DESC
     LIMIT $1`,
    [limit],
  )
  return rows.map((r) => ({
    rank: parseInt(r.rank, 10),
    beerCount: parseInt(r.beerCount, 10),
    user: {
      id: r.id,
      displayName: r.displayName,
      pseudoName: r.pseudoName,
      slug: r.slug,
      countryCode: r.countryCode,
    },
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
    pseudoName: string | null
    slug: string
    countryCode: string | null
  }>(
    `SELECT
       RANK() OVER (ORDER BY COUNT(*) DESC)::text AS rank,
       COUNT(*)::text AS "beerCount",
       u.id,
       u.display_name AS "displayName",
       u.pseudo_name AS "pseudoName",
       u.slug,
       u.country_code AS "countryCode"
     FROM beer_logs bl
     JOIN users u ON bl.user_id = u.id
     WHERE bl.group_id = $1
     GROUP BY u.id, u.display_name, u.pseudo_name, u.slug, u.country_code
     ORDER BY COUNT(*) DESC
     LIMIT $2`,
    [groupId, limit],
  )
  return rows.map((r) => ({
    rank: parseInt(r.rank, 10),
    beerCount: parseInt(r.beerCount, 10),
    user: {
      id: r.id,
      displayName: r.displayName,
      pseudoName: r.pseudoName,
      slug: r.slug,
      countryCode: r.countryCode,
    },
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

// ─── Countries ───────────────────────────────────────────────────────────────

export async function getGlobalCountries(pool: pg.Pool): Promise<CountryStat[]> {
  const { rows } = await pool.query<{ countryCode: string; beerCount: number; userCount: number }>(
    `SELECT u.country_code AS "countryCode",
            COUNT(*)::int AS "beerCount",
            COUNT(DISTINCT bl.user_id)::int AS "userCount"
     FROM beer_logs bl
     JOIN users u ON bl.user_id = u.id
     WHERE u.country_code IS NOT NULL
     GROUP BY u.country_code
     ORDER BY COUNT(*) DESC`,
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
  userSlug: string
  groupName: string
  groupSlug: string
  countryCode: string | null
} | null> {
  const { rows } = await pool.query(
    `SELECT bl.id, bl.photo_url AS "photoUrl", bl.logged_at AS "loggedAt",
            u.display_name AS "userName", u.slug AS "userSlug",
            g.name AS "groupName", g.slug AS "groupSlug",
            u.country_code AS "countryCode"
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
