import type { FastifyPluginAsync } from 'fastify'
import type pg from 'pg'
import { BeerLogRequestSchema } from '@omb/shared'
import {
  findOrCreateGroup,
  upsertUser,
  insertBeerLog,
  deleteBeerLogBySourceMessageId,
  getGlobalCount,
  getLatestBeer,
} from '../db/queries.js'
import { hashIdentity } from '../lib/hash.js'
import { extractCountryCode } from '../lib/phone.js'
import { broadcast } from '../lib/sse.js'

export const beerLogRoutes: FastifyPluginAsync<{ pool: pg.Pool }> = async (app, { pool }) => {
  app.post('/v1/internal/beer-log', { config: { rateLimit: false } }, async (request, reply) => {
    const parse = BeerLogRequestSchema.safeParse(request.body)
    if (!parse.success) {
      return reply.status(400).send({ error: 'Invalid request', issues: parse.error.issues })
    }

    const {
      sourceGroupId,
      groupName,
      senderId,
      timestamp,
      photoUrl,
      pushName,
      sourceMessageId,
      photoHash,
    } = parse.data

    const identityHash = hashIdentity(senderId)
    const countryCode = extractCountryCode(senderId)
    const phoneNumber = senderId.startsWith('wa:') ? senderId.slice(3) : null
    const [group, user] = await Promise.all([
      findOrCreateGroup(pool, sourceGroupId, groupName),
      upsertUser(pool, { identityHash, phoneNumber, pushName: pushName ?? null, countryCode }),
    ])

    const inserted = await insertBeerLog(
      pool,
      user.id,
      group.id,
      photoUrl,
      timestamp,
      sourceMessageId,
      photoHash,
    )

    // null means the photo_hash already exists — duplicate photo, silently accepted
    if (inserted) {
      const [count, latest] = await Promise.all([getGlobalCount(pool), getLatestBeer(pool)])
      broadcast({
        type: 'count',
        count,
        ...(latest ? { latestBeer: latest } : {}),
      })
    }

    return reply.status(201).send({ ok: true })
  })

  app.delete(
    '/v1/internal/beer-log/by-message/:sourceMessageId',
    { config: { rateLimit: false } },
    async (request, reply) => {
      const { sourceMessageId } = request.params as { sourceMessageId: string }

      const deleted = await deleteBeerLogBySourceMessageId(pool, sourceMessageId)
      if (!deleted) {
        return reply.status(404).send({ ok: false })
      }

      const [count, latest] = await Promise.all([getGlobalCount(pool), getLatestBeer(pool)])
      broadcast({
        type: 'count',
        count,
        ...(latest ? { latestBeer: latest } : {}),
      })

      return reply.status(200).send({ ok: true, photoUrl: deleted.photoUrl })
    },
  )
}
