import { createHash, randomUUID } from 'node:crypto'
import { config } from 'dotenv'
import { faker } from '@faker-js/faker'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import pg from 'pg'

config({ path: '.env.local' })

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set — copy .env.local.example to .env.local')
  process.exit(1)
}

const STORAGE_ENDPOINT = process.env.STORAGE_ENDPOINT ?? 'http://localhost:9000'
const STORAGE_BUCKET = process.env.STORAGE_BUCKET ?? 'omb-photos'
const STORAGE_KEY = process.env.STORAGE_KEY ?? 'minioadmin'
const STORAGE_SECRET = process.env.STORAGE_SECRET ?? 'minioadmin'
const STORAGE_REGION = process.env.STORAGE_REGION ?? 'auto'

const pool = new pg.Pool({ connectionString: DATABASE_URL })

const s3 = new S3Client({
  endpoint: STORAGE_ENDPOINT,
  region: STORAGE_REGION,
  credentials: { accessKeyId: STORAGE_KEY, secretAccessKey: STORAGE_SECRET },
  forcePathStyle: true,
})

// ── Config ────────────────────────────────────────────────────────────────────

const NUM_GROUPS = 5
const NUM_USERS = 20
const NUM_BEER_LOGS = 200
const NUM_PHOTOS = 20 // pool downloaded once and re-used across logs

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

// ── Photo seeding ─────────────────────────────────────────────────────────────

// Picsum Photos: random CC-licensed photos served from Cloudflare CDN.
// No API key required. Append a unique seed to get distinct images per request.
function picsumUrl(seed: number) {
  return `https://picsum.photos/seed/${seed}/800/600`
}

async function downloadPhoto(url: string, attempt = 1): Promise<Buffer> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return Buffer.from(await res.arrayBuffer())
  } catch (err) {
    if (attempt >= 3) throw new Error(`Photo download failed after 3 attempts: ${err}`)
    await new Promise((r) => setTimeout(r, 1_000 * attempt))
    return downloadPhoto(url, attempt + 1)
  }
}

async function seedPhotos(): Promise<string[]> {
  console.log(`\nDownloading ${NUM_PHOTOS} photos from Picsum...`)
  const urls: string[] = []

  for (let i = 0; i < NUM_PHOTOS; i++) {
    const key = `seed/${randomUUID()}.jpg`
    const buffer = await downloadPhoto(picsumUrl(i + 1))

    await s3.send(
      new PutObjectCommand({
        Bucket: STORAGE_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: 'image/jpeg',
      }),
    )

    const url = `${STORAGE_ENDPOINT.replace(/\/$/, '')}/${STORAGE_BUCKET}/${key}`
    urls.push(url)
    console.log(`  [${i + 1}/${NUM_PHOTOS}] ${url}`)
  }

  return urls
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
  photoUrls: string[],
) {
  for (let i = 0; i < NUM_BEER_LOGS; i++) {
    const id = randomUUID()
    const group = groups[Math.floor(Math.random() * groups.length)]
    const user = users[Math.floor(Math.random() * users.length)]
    const loggedAt = randomPastDate(180)
    const photoUrl = photoUrls[Math.floor(Math.random() * photoUrls.length)]

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
  const photoUrls = await seedPhotos()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    console.log('\nClearing existing data...')
    await client.query('TRUNCATE beer_logs, users, groups RESTART IDENTITY CASCADE')

    console.log(`\nSeeding ${NUM_GROUPS} groups...`)
    const groups = await seedGroups(client)

    console.log(`\nSeeding ${NUM_USERS} users...`)
    const users = await seedUsers(client)

    console.log(`\nSeeding ${NUM_BEER_LOGS} beer logs...`)
    await seedBeerLogs(client, groups, users, photoUrls)

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
