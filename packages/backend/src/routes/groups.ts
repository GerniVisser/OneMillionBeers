import type { FastifyPluginAsync } from 'fastify'
import type pg from 'pg'
import { PaginationQuerySchema } from '@omb/shared'
import {
  findGroupBySlug,
  getGroupTotalBeers,
  getGroupFeed,
  getGroupLeaderboard,
} from '../db/queries.js'

export const groupRoutes: FastifyPluginAsync<{ pool: pg.Pool }> = async (app, { pool }) => {
  app.get('/v1/groups/:groupId', async (request, reply) => {
    const { groupId } = request.params as { groupId: string }
    const group = await findGroupBySlug(pool, groupId)
    if (!group) return reply.status(404).send({ error: 'Group not found' })
    const totalBeers = await getGroupTotalBeers(pool, group.id)
    return reply.send({ ...group, totalBeers })
  })

  app.get('/v1/groups/:groupId/feed', async (request, reply) => {
    const { groupId } = request.params as { groupId: string }
    const group = await findGroupBySlug(pool, groupId)
    if (!group) return reply.status(404).send({ error: 'Group not found' })

    const parse = PaginationQuerySchema.safeParse(request.query)
    if (!parse.success) return reply.status(400).send({ error: 'Invalid query params' })
    const { limit, offset } = parse.data

    const { items, total } = await getGroupFeed(pool, group.id, limit, offset)
    return reply.send({ items, total, limit, offset })
  })

  app.get('/v1/groups/:groupId/leaderboard', async (request, reply) => {
    const { groupId } = request.params as { groupId: string }
    const group = await findGroupBySlug(pool, groupId)
    if (!group) return reply.status(404).send({ error: 'Group not found' })

    const entries = await getGroupLeaderboard(pool, group.id)
    return reply.send({ entries })
  })
}
