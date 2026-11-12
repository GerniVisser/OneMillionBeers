import {
  BeerLogRequestSchema,
  BeerLogResponseSchema,
  BeerLogDeleteResponseSchema,
  type BeerLogRequest,
  type BeerLogOutcome,
} from '@omb/shared'
import { config } from './config.js'
import { pino } from 'pino'

const logger = pino({ name: 'forwarder', level: config.LOG_LEVEL })

/** Auth for /v1/internal/* — see packages/backend/src/lib/internal-auth.ts. */
export function internalAuthHeader(): Record<string, string> {
  return { Authorization: `Bearer ${config.INTERNAL_API_TOKEN}` }
}

export async function forwardBeerLog(payload: BeerLogRequest): Promise<BeerLogOutcome> {
  // Belt-and-suspenders: validate outbound payload before sending
  BeerLogRequestSchema.parse(payload)

  const url = `${config.BACKEND_URL}/v1/internal/beer-log`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...internalAuthHeader() },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '(unreadable)')
    logger.error({ status: response.status, body: text }, 'Backend rejected beer log')
    throw new Error(`Backend returned ${response.status}`)
  }

  return BeerLogResponseSchema.parse(await response.json()).outcome
}

/** Returns the photo URL to delete, or null if no beer log matched. */
export async function forwardDeleteBeerLog(
  sourceMessageId: string,
  sourceGroupId: string,
): Promise<string | null> {
  const url =
    `${config.BACKEND_URL}/v1/internal/beer-log/by-message/${encodeURIComponent(sourceMessageId)}` +
    `?sourceGroupId=${encodeURIComponent(sourceGroupId)}`
  const response = await fetch(url, {
    method: 'DELETE',
    headers: internalAuthHeader(),
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '(unreadable)')
    logger.error({ status: response.status, body: text }, 'Backend rejected beer log delete')
    throw new Error(`Backend returned ${response.status}`)
  }

  const data = BeerLogDeleteResponseSchema.parse(await response.json())
  return data.photoUrl ?? null
}
