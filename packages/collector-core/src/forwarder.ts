import { BeerLogRequestSchema, BeerLogDeleteResponseSchema, type BeerLogRequest } from '@omb/shared'
import { config } from './config.js'
import { pino } from 'pino'

const logger = pino({ name: 'forwarder', level: config.LOG_LEVEL })

export async function forwardBeerLog(payload: BeerLogRequest): Promise<void> {
  // Belt-and-suspenders: validate outbound payload before sending
  BeerLogRequestSchema.parse(payload)

  const url = `${config.BACKEND_URL}/v1/internal/beer-log`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '(unreadable)')
    logger.error({ status: response.status, body: text }, 'Backend rejected beer log')
    throw new Error(`Backend returned ${response.status}`)
  }
}

export async function forwardDeleteBeerLog(sourceMessageId: string): Promise<string | null> {
  const url = `${config.BACKEND_URL}/v1/internal/beer-log/by-message/${encodeURIComponent(sourceMessageId)}`
  const response = await fetch(url, {
    method: 'DELETE',
    signal: AbortSignal.timeout(10_000),
  })

  if (response.status === 404) return null

  if (!response.ok) {
    const text = await response.text().catch(() => '(unreadable)')
    logger.error({ status: response.status, body: text }, 'Backend rejected beer log delete')
    throw new Error(`Backend returned ${response.status}`)
  }

  const data = BeerLogDeleteResponseSchema.parse(await response.json())
  return data.photoUrl ?? null
}
