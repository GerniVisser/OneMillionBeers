import { createHash, timingSafeEqual } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'

/**
 * Constant-time secret comparison. timingSafeEqual requires equal-length
 * buffers and throws otherwise, which would itself leak the expected token's
 * length, so both sides are hashed to a fixed 32 bytes first.
 */
function secretsMatch(presented: string, expected: string): boolean {
  return timingSafeEqual(
    createHash('sha256').update(presented).digest(),
    createHash('sha256').update(expected).digest(),
  )
}

/**
 * Guards /v1/internal/*, which only a collector on the same Docker network is
 * ever meant to call. The gateway refuses these paths outright; this is the
 * second layer, so that a single routing mistake cannot expose beer-log
 * ingestion to the internet the way `location /api/` did.
 *
 * Fails closed: an unconfigured token rejects everything rather than letting a
 * half-configured deploy silently accept anonymous writes.
 */
export function requireInternalToken(expected: string) {
  return async function internalAuth(request: FastifyRequest, reply: FastifyReply) {
    if (!expected) {
      request.log.error('INTERNAL_API_TOKEN is not configured — rejecting internal request')
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const header = request.headers.authorization
    const presented = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null

    if (!presented || !secretsMatch(presented, expected)) {
      request.log.warn({ url: request.url }, 'Rejected unauthenticated internal request')
      return reply.status(401).send({ error: 'Unauthorized' })
    }
  }
}
