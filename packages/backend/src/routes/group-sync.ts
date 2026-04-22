import type { FastifyPluginAsync } from 'fastify'
import type pg from 'pg'
import { GroupSyncRequestSchema } from '@omb/shared'
import { upsertGroup } from '../db/queries.js'

export const groupSyncRoutes: FastifyPluginAsync<{ pool: pg.Pool }> = async (app, { pool }) => {
  app.put(
    '/v1/internal/groups/:sourceGroupId',
    { config: { rateLimit: false } },
    async (request, reply) => {
      const { sourceGroupId } = request.params as { sourceGroupId: string }
      const parse = GroupSyncRequestSchema.safeParse(request.body)
      if (!parse.success) {
        return reply.status(400).send({ error: 'Invalid request', issues: parse.error.issues })
      }

      const { name, avatarUrl, inviteCode } = parse.data
      await upsertGroup(pool, sourceGroupId, name, avatarUrl, inviteCode)
      return reply.status(204).send()
    },
  )
}
