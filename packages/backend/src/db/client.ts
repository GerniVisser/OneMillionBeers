import { readFileSync } from 'node:fs'
import pg from 'pg'

const { Pool } = pg

const RDS_CA_BUNDLE = '/app/certs/rds-ca-bundle.pem'

let _pool: pg.Pool | null = null

export function getPool(connectionString?: string): pg.Pool {
  if (!_pool) {
    const rawUrl = connectionString ?? process.env.DATABASE_URL ?? ''
    const isRds = rawUrl.includes('amazonaws.com')

    // Strip sslmode from the URL so pg-connection-string doesn't override our ssl config.
    // RDS uses AWS's own CA (not in Node's trust store); we encrypt and verify using the
    // AWS CA bundle baked into the Docker image.
    let finalUrl = rawUrl
    if (isRds) {
      try {
        const u = new URL(rawUrl)
        u.searchParams.delete('sslmode')
        finalUrl = u.toString()
      } catch {
        /* use rawUrl as-is */
      }
    }

    _pool = new Pool({
      connectionString: finalUrl,
      ...(isRds
        ? { ssl: { rejectUnauthorized: true, ca: readFileSync(RDS_CA_BUNDLE, 'utf-8') } }
        : {}),
    })
  }
  return _pool
}

export function createPool(connectionString: string): pg.Pool {
  return new Pool({ connectionString })
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end()
    _pool = null
  }
}
