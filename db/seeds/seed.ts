import { createHash, randomUUID } from 'node:crypto'
import { config } from 'dotenv'
import { faker } from '@faker-js/faker'
import pg from 'pg'

config({ path: '.env.local' })

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set — copy .env.local.example to .env.local')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: DATABASE_URL })

// ── Config ────────────────────────────────────────────────────────────────────

const NUM_GROUPS = 5
const NUM_USERS = 20
const NUM_BEER_LOGS = 200

// ── Helpers ───────────────────────────────────────────────────────────────────

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 128)
}

function identityHash(id: string): string {
  return createHash('sha256').update(id).digest('hex')
}

function randomPastDate(daysBack = 180): Date {
  const now = Date.now()
  return new Date(now - Math.random() * daysBack * 24 * 60 * 60 * 1000)
}

function fakePhotoUrl(groupSlug: string): string {
  const id = randomUUID()
  return `http://localhost:9000/omb-photos/${groupSlug}/${id}.jpg`
}

// ── Seeders ───────────────────────────────────────────────────────────────────

async function seedGroups(client: pg.PoolClient) {
  const groups: { id: string; slug: string }[] = []
  const names = new Set<string>()

  while (groups.length < NUM_GROUPS) {
    const name = `${faker.location.city()} Beer Club`
    if (names.has(name)) continue
    names.add(name)

    const id = randomUUID()
    const slug = toSlug(name)
    const sourceGroupId = `tg-${faker.string.numeric(10)}`

    await client.query(
      `INSERT INTO groups (id, source_group_id, name, slug, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, sourceGroupId, name, slug, randomPastDate(365)],
    )
    groups.push({ id, slug })
    console.log(`  group: ${name} (${slug})`)
  }

  return groups
}

async function seedUsers(client: pg.PoolClient) {
  const users: { id: string; slug: string }[] = []

  for (let i = 0; i < NUM_USERS; i++) {
    const id = randomUUID()
    const telegramId = faker.string.numeric(10)
    const hash = identityHash(telegramId)
    const displayName = Math.random() > 0.15 ? faker.person.firstName() : null
    const slug = `user-${id.slice(0, 8)}`

    await client.query(
      `INSERT INTO users (id, identity_hash, display_name, slug, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, hash, displayName, slug, randomPastDate(365)],
    )
    users.push({ id, slug })
    console.log(`  user: ${displayName ?? '(anonymous)'} (${slug})`)
  }

  return users
}

async function seedBeerLogs(
  client: pg.PoolClient,
  groups: { id: string; slug: string }[],
  users: { id: string; slug: string }[],
) {
  for (let i = 0; i < NUM_BEER_LOGS; i++) {
    const id = randomUUID()
    const group = groups[Math.floor(Math.random() * groups.length)]
    const user = users[Math.floor(Math.random() * users.length)]
    const loggedAt = randomPastDate(180)
    const photoUrl = fakePhotoUrl(group.slug)

    await client.query(
      `INSERT INTO beer_logs (id, user_id, group_id, photo_url, logged_at, created_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [id, user.id, group.id, photoUrl, loggedAt],
    )
  }
  console.log(`  ${NUM_BEER_LOGS} beer logs inserted`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    console.log('Clearing existing data...')
    await client.query('TRUNCATE beer_logs, users, groups RESTART IDENTITY CASCADE')

    console.log(`\nSeeding ${NUM_GROUPS} groups...`)
    const groups = await seedGroups(client)

    console.log(`\nSeeding ${NUM_USERS} users...`)
    const users = await seedUsers(client)

    console.log(`\nSeeding ${NUM_BEER_LOGS} beer logs...`)
    await seedBeerLogs(client, groups, users)

    await client.query('COMMIT')
    console.log('\nDone.')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
