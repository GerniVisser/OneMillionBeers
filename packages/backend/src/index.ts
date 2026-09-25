import { config } from './config.js'
import { getPool } from './db/client.js'
import { buildApp } from './app.js'

const pool = getPool(config.DATABASE_URL)
const app = await buildApp(pool, config.LOG_LEVEL, config.NODE_ENV, config.INTERNAL_API_TOKEN)

await app.listen({ port: config.PORT, host: '0.0.0.0' })
