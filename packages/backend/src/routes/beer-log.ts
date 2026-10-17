import type { FastifyPluginAsync } from 'fastify'
import type pg from 'pg'
import { BeerLogRequestSchema } from '@omb/shared'
import {
  findOrCreateGroup,
  upsertUser,
  insertBeerLog,
  revokeBeerLog,
  getGlobalCount,
  getLatestBeer,
} from '../db/queries.js'
import { hashIdentity } from '../lib/hash.js'
import { extractCountryCode } from '../lib/phone.js'
import { broadcast } from '../lib/sse.js'
import { requireInternalToken } from '../lib/internal-auth.js'

export const beerLogRoutes: FastifyPluginAsync<{ pool: pg.Pool; internalToken: string }> = async (
  app,
  { pool, internalToken },
) => {
  app.addHook('onRequest', requireInternalToken(internalToken))

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
    const [user, group] = await Promise.all([
      upsertUser(pool, { identityHash, phoneNumber, pushName: pushName ?? null, countryCode }),
      findOrCreateGroup(pool, sourceGroupId, groupName),
    ])

    const outcome = await insertBeerLog(pool, {
      userId: user.id,
      groupId: group.id,
      sourceGroupId,
      photoUrl,
      loggedAt: timestamp,
      sourceMessageId,
      photoHash,
    })

    // Only a new beer changes the count or the head of the feed. A duplicate
    // delivery from a second bot must not push an SSE update to every client.
    if (outcome === 'created') {
      const [count, latest] = await Promise.all([getGlobalCount(pool), getLatestBeer(pool)])
      broadcast({
        type: 'count',
        count,
        ...(latest ? { latestBeer: latest } : {}),
      })
    }

    return reply.status(201).send({ ok: true, outcome })
  })

  app.delete(
    '/v1/internal/beer-log/by-message/:sourceMessageId',
    { config: { rateLimit: false } },
    async (request, reply) => {
      const { sourceMessageId } = request.params as { sourceMessageId: string }
      // A bare WhatsApp message id is only unique within its chat, so the group
      // is part of the key. Without it a revoke could delete another group's row.
      const { sourceGroupId } = request.query as { sourceGroupId?: string }
      if (!sourceGroupId) {
        return reply.status(400).send({ ok: false, error: 'sourceGroupId is required' })
      }

      const deleted = await revokeBeerLog(pool, sourceGroupId, sourceMessageId)
      if (deleted) {
        const count = await getGlobalCount(pool)
        broadcast({ type: 'remove', id: deleted.id, count })
      }

      // Always ok: the revocation is now recorded whether or not a row existed,
      // so a message that arrives after its revoke is refused. Repeating the
      // call is a no-op rather than a 404.
      return reply
        .status(200)
        .send({ ok: true, ...(deleted ? { photoUrl: deleted.photoUrl } : {}) })
    },
  )
}
