import type { FastifyPluginAsync } from 'fastify'
import type pg from 'pg'
import { BeerLogRequestSchema, BeerLogReactionRequestSchema } from '@omb/shared'
import {
  findOrCreateGroup,
  upsertUser,
  insertBeerLog,
  revokeBeerLog,
  getGlobalCount,
  getLatestBeer,
  findBeerLogIdByMessage,
  upsertBeerLogReaction,
  getReactionSummary,
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

  app.post(
    '/v1/internal/beer-log/reaction',
    { config: { rateLimit: false } },
    async (request, reply) => {
      const parse = BeerLogReactionRequestSchema.safeParse(request.body)
      if (!parse.success) {
        return reply.status(400).send({ error: 'Invalid request', issues: parse.error.issues })
      }

      const { sourceGroupId, sourceMessageId, reactorId, emoji, timestamp } = parse.data

      // Checked before the user upsert so a reaction to a text message creates no user.
      const beerLogId = await findBeerLogIdByMessage(pool, sourceGroupId, sourceMessageId)
      if (!beerLogId) return reply.status(200).send({ ok: true, outcome: 'not-a-beer' })

      const user = await upsertUser(pool, {
        identityHash: hashIdentity(reactorId),
        phoneNumber: reactorId.startsWith('wa:') ? reactorId.slice(3) : null,
        pushName: null,
        countryCode: extractCountryCode(reactorId),
      })

      const outcome = await upsertBeerLogReaction(pool, {
        beerLogId,
        userId: user.id,
        emoji,
        reactedAt: timestamp,
      })
      if (outcome === 'stored') {
        broadcast({
          type: 'reactions',
          id: beerLogId,
          reactions: await getReactionSummary(pool, beerLogId),
        })
      }
      return reply.status(200).send({ ok: true, outcome })
    },
  )

  app.delete(
    '/v1/internal/beer-log/by-message/:sourceMessageId',
    { config: { rateLimit: false } },
    async (request, reply) => {
      const { sourceMessageId } = request.params as { sourceMessageId: string }
      const { sourceGroupId } = request.query as { sourceGroupId?: string }
      if (!sourceGroupId) {
        return reply.status(400).send({ ok: false, error: 'sourceGroupId is required' })
      }

      const deleted = await revokeBeerLog(pool, sourceGroupId, sourceMessageId)
      if (deleted) {
        const count = await getGlobalCount(pool)
        broadcast({ type: 'remove', id: deleted.id, count })
      }

      // 200 even when no row matched: the revocation itself was recorded.
      return reply
        .status(200)
        .send({ ok: true, ...(deleted ? { photoUrl: deleted.photoUrl } : {}) })
    },
  )
}
