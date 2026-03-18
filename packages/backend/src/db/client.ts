import pg from 'pg'

const { Pool } = pg

let _pool: pg.Pool | null = null

export function getPool(connectionString?: string): pg.Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: connectionString ?? process.env.DATABASE_URL })
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
