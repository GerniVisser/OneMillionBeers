import type { FastifyPluginAsync } from 'fastify'
import type pg from 'pg'
import { UserSearchQuerySchema } from '@omb/shared'
import { findUserBySlug, getUserStats, searchUsers } from '../db/queries.js'

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
}
