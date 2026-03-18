import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { createPool } from '../db/client.js'
import type pg from 'pg'

let container: StartedPostgreSqlContainer | null = null
let pool: pg.Pool | null = null

export async function startDb(): Promise<pg.Pool> {
  container = await new PostgreSqlContainer('postgres:16-alpine').start()
  pool = createPool(container.getConnectionUri())
  await runMigrations(pool)
  return pool
}

export async function stopDb(): Promise<void> {
  await pool?.end()
  pool = null
  await container?.stop()
  container = null
}

export async function clearTables(p: pg.Pool): Promise<void> {
  await p.query('TRUNCATE beer_logs, users, groups RESTART IDENTITY CASCADE')
}

async function runMigrations(p: pg.Pool): Promise<void> {
  const migrationsDir = join(process.cwd(), '../../db/migrations')
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    const sql = await readFile(join(migrationsDir, file), 'utf-8')
    await p.query(sql)
  }
}
