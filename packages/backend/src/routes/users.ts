import type { FastifyPluginAsync } from 'fastify'
import type pg from 'pg'
import { UserSearchQuerySchema, PaginationQuerySchema } from '@omb/shared'
import {
  findUserBySlug,
  getUserStats,
  getUserFeed,
  getUserActivity,
  getUserHourly,
  getUserMonthly,
  searchUsers,
} from '../db/queries.js'

export const userRoutes: FastifyPluginAsync<{ pool: pg.Pool }> = async (app, { pool }) => {
  app.get('/v1/users/search', async (request, reply) => {
    const parse = UserSearchQuerySchema.safeParse(request.query)
    if (!parse.success) return reply.status(400).send({ error: 'Invalid query' })
    const { q, limit } = parse.data
    const results = await searchUsers(pool, q, limit)
    return reply.send({ results })
  })

  app.get('/v1/users/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string }
    const user = await findUserBySlug(pool, userId)
    if (!user) return reply.status(404).send({ error: 'User not found' })
    // identityHash never exposed publicly
    return reply.send({
      id: user.id,
      displayName: user.displayName,
      pseudoName: user.pseudoName,
      slug: user.slug,
      countryCode: user.countryCode,
      createdAt: user.createdAt,
    })
  })

  app.get('/v1/users/:userId/stats', async (request, reply) => {
    const { userId } = request.params as { userId: string }
    const user = await findUserBySlug(pool, userId)
    if (!user) return reply.status(404).send({ error: 'User not found' })

    const stats = await getUserStats(pool, user.id)
    return reply.send({ userId: user.id, ...stats })
  })

  app.get('/v1/users/:userId/feed', async (request, reply) => {
    const { userId } = request.params as { userId: string }
    const user = await findUserBySlug(pool, userId)
    if (!user) return reply.status(404).send({ error: 'User not found' })

    const parse = PaginationQuerySchema.safeParse(request.query)
    if (!parse.success) return reply.status(400).send({ error: 'Invalid query params' })
    const { limit, offset } = parse.data

    const { items, total } = await getUserFeed(pool, user.id, limit, offset)
    return reply.send({ items, total, limit, offset })
  })

  app.get('/v1/users/:userId/activity', async (request, reply) => {
    const { userId } = request.params as { userId: string }
    const user = await findUserBySlug(pool, userId)
    if (!user) return reply.status(404).send({ error: 'User not found' })

    const days = await getUserActivity(pool, user.id)
    return reply.send({ days })
  })

  app.get('/v1/users/:userId/hourly', async (request, reply) => {
    const { userId } = request.params as { userId: string }
    const user = await findUserBySlug(pool, userId)
    if (!user) return reply.status(404).send({ error: 'User not found' })

    const hours = await getUserHourly(pool, user.id)
    return reply.send({ hours })
  })

  app.get('/v1/users/:userId/monthly', async (request, reply) => {
    const { userId } = request.params as { userId: string }
    const user = await findUserBySlug(pool, userId)
    if (!user) return reply.status(404).send({ error: 'User not found' })

    const months = await getUserMonthly(pool, user.id)
    return reply.send({ months })
  })
}
