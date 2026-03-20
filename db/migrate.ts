/**
 * db/migrate.ts
 *
 * Applies all numbered .sql files in db/migrations/ in order.
 * Tracks applied migrations in a schema_migrations table so each file
 * is applied exactly once. Safe to run repeatedly (idempotent).
 *
 * Usage: pnpm db:migrate
 */

import { config } from 'dotenv'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'

config({ path: '.env.local' })

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set — copy .env.local.example to .env.local')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: DATABASE_URL })

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  const applied = new Set(
    (await pool.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename),
  )

  const migrationsDir = join(process.cwd(), 'db/migrations')
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()

  if (files.length === 0) {
    console.log('No migration files found.')
    return
  }

  let appliedCount = 0
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip   ${file}`)
      continue
    }

    const sql = await readFile(join(migrationsDir, file), 'utf8')

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log(`apply  ${file}`)
      appliedCount++
    } catch (err) {
      await client.query('ROLLBACK')
      console.error(`error  ${file}: ${(err as Error).message}`)
      throw err
    } finally {
      client.release()
    }
  }

  if (appliedCount === 0) {
    console.log('Already up to date.')
  } else {
    console.log(`\nApplied ${appliedCount} migration(s).`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => pool.end())
