import pg from 'pg'

const { Pool } = pg

let _pool: pg.Pool | null = null

export function getPool(connectionString?: string): pg.Pool {
  if (!_pool) {
    const url = connectionString ?? process.env.DATABASE_URL ?? ''
    _pool = new Pool({
      connectionString: url,
      ...(url.includes('amazonaws.com') ? { ssl: { rejectUnauthorized: false } } : {}),
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
