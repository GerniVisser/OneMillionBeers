import type { FastifyPluginAsync } from 'fastify'
import type pg from 'pg'
import { PaginationQuerySchema } from '@omb/shared'
import {
  getGlobalCount,
  getGlobalFeed,
  getGlobalLeaderboard,
  getLatestBeer,
} from '../db/queries.js'
import { subscribe } from '../lib/sse.js'

export const globalRoutes: FastifyPluginAsync<{ pool: pg.Pool }> = async (app, { pool }) => {
  app.get('/v1/global/count', async (_request, reply) => {
    const count = await getGlobalCount(pool)
    return reply.send({ count })
  })

  app.get('/v1/global/feed', async (request, reply) => {
    const parse = PaginationQuerySchema.safeParse(request.query)
    if (!parse.success) return reply.status(400).send({ error: 'Invalid query params' })
    const { limit, offset } = parse.data

    const { items, total } = await getGlobalFeed(pool, limit, offset)
    return reply.send({ items, total, limit, offset })
  })

  app.get('/v1/global/leaderboard', async (_request, reply) => {
    const entries = await getGlobalLeaderboard(pool)
    return reply.send({ entries })
  })

  app.get('/v1/global/stream', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    // Send current count immediately on connect
    const [count, latest] = await Promise.all([getGlobalCount(pool), getLatestBeer(pool)])
    reply.raw.write(
      `data: ${JSON.stringify({ type: 'count', count, ...(latest ? { latestBeer: latest } : {}) })}\n\n`,
    )

    const unsubscribe = subscribe(reply)

    request.raw.on('close', () => {
      unsubscribe()
    })

    // Keep connection open — never resolve
    await new Promise<void>((resolve) => {
      request.raw.on('close', resolve)
    })
  })
}
