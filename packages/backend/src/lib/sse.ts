import type { FastifyReply } from 'fastify'
import type { SseEvent } from '@omb/shared'

type Subscriber = (event: SseEvent) => void

const subscribers = new Set<Subscriber>()

export function subscribe(reply: FastifyReply): () => void {
  const send: Subscriber = (event) => {
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
  }
  subscribers.add(send)
  return () => subscribers.delete(send)
}

export function broadcast(event: SseEvent): void {
  for (const sub of subscribers) {
    try {
      sub(event)
    } catch {
      // client disconnected
    }
  }
}
