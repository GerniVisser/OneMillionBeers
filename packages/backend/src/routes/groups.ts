import type { FastifyPluginAsync } from 'fastify'
import type pg from 'pg'
import { PaginationQuerySchema, GroupSearchQuerySchema } from '@omb/shared'
import {
  listGroups,
  findGroupBySlug,
  getGroupTotalBeers,
  getGroupFeed,
  getGroupLeaderboard,
  getGroupStats,
  getGroupActivity,
  getGroupHourly,
  getGroupMonthly,
  getGroupInviteCode,
} from '../db/queries.js'

export const groupRoutes: FastifyPluginAsync<{ pool: pg.Pool }> = async (app, { pool }) => {
  app.get('/v1/groups', async (request, reply) => {
    const parse = GroupSearchQuerySchema.safeParse(request.query)
    if (!parse.success) return reply.status(400).send({ error: 'Invalid query params' })
    const { limit, offset, search } = parse.data
    const { items, total } = await listGroups(pool, limit, offset, search)
    return reply.send({ items, total, limit, offset })
  })

  app.get('/v1/groups/:groupId', async (request, reply) => {
    const { groupId } = request.params as { groupId: string }
    const group = await findGroupBySlug(pool, groupId)
    if (!group) return reply.status(404).send({ error: 'Group not found' })
    const totalBeers = await getGroupTotalBeers(pool, group.id)
    return reply.send({ ...group, totalBeers })
  })

  app.get('/v1/groups/:groupId/invite-code', async (request, reply) => {
    const { groupId } = request.params as { groupId: string }
    const inviteCode = await getGroupInviteCode(pool, groupId)
    if (!inviteCode) return reply.status(404).send({ error: 'Invite link not available' })
    return reply.send({ inviteUrl: `https://chat.whatsapp.com/${inviteCode}` })
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

  app.get('/v1/groups/:groupId/stats', async (request, reply) => {
    const { groupId } = request.params as { groupId: string }
    const group = await findGroupBySlug(pool, groupId)
    if (!group) return reply.status(404).send({ error: 'Group not found' })

    const stats = await getGroupStats(pool, group.id)
    return reply.send(stats)
  })

  app.get('/v1/groups/:groupId/activity', async (request, reply) => {
    const { groupId } = request.params as { groupId: string }
    const group = await findGroupBySlug(pool, groupId)
    if (!group) return reply.status(404).send({ error: 'Group not found' })

    const days = await getGroupActivity(pool, group.id)
    return reply.send({ days })
  })

  app.get('/v1/groups/:groupId/hourly', async (request, reply) => {
    const { groupId } = request.params as { groupId: string }
    const group = await findGroupBySlug(pool, groupId)
    if (!group) return reply.status(404).send({ error: 'Group not found' })

    const hours = await getGroupHourly(pool, group.id)
    return reply.send({ hours })
  })

  app.get('/v1/groups/:groupId/monthly', async (request, reply) => {
    const { groupId } = request.params as { groupId: string }
    const group = await findGroupBySlug(pool, groupId)
    if (!group) return reply.status(404).send({ error: 'Group not found' })

    const months = await getGroupMonthly(pool, group.id)
    return reply.send({ months })
  })
}
