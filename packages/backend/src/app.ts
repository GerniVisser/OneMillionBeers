import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import type pg from 'pg'
import { beerLogRoutes } from './routes/beer-log.js'
import { groupRoutes } from './routes/groups.js'
import { userRoutes } from './routes/users.js'
import { globalRoutes } from './routes/global.js'

export async function buildApp(
  pool: pg.Pool,
  logLevel = 'info',
  nodeEnv = process.env.NODE_ENV ?? 'development',
): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: logLevel } })

  await app.register(cors)

  if (nodeEnv !== 'production') {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'OneMillionBeers API',
          description: 'Public API for the OneMillionBeers platform',
          version: '1.0.0',
        },
        tags: [
          { name: 'internal', description: 'Collector → Backend ingestion' },
          { name: 'groups', description: 'WhatsApp group endpoints' },
          { name: 'users', description: 'User endpoints' },
          { name: 'global', description: 'Global aggregates and live stream' },
        ],
      },
    })

    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: { docExpansion: 'list' },
    })
  }

  app.get('/health', async () => ({ status: 'ok' }))

  await app.register(beerLogRoutes, { pool })
  await app.register(groupRoutes, { pool })
  await app.register(userRoutes, { pool })
  await app.register(globalRoutes, { pool })

  return app
}
