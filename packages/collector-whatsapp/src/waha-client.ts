import { config } from './config.js'

export type SessionStatus = 'STOPPED' | 'STARTING' | 'SCAN_QR_CODE' | 'WORKING' | 'FAILED'

// Events the collector handles — kept in sync with webhook.ts handler
const WEBHOOK_EVENTS = ['message', 'session.status', 'group.v2.join', 'group.v2.update']

function wahaHeaders() {
  return { 'x-api-key': config.WAHA_API_KEY, 'Content-Type': 'application/json' }
}

function webhookConfig() {
  return { webhooks: [{ url: config.WAHA_WEBHOOK_URL, events: WEBHOOK_EVENTS }] }
}

export async function getSessionStatus(): Promise<SessionStatus> {
  const res = await fetch(`${config.WAHA_BASE_URL}/api/sessions/${config.WAHA_SESSION}`, {
    headers: wahaHeaders(),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`WAHA getSessionStatus returned ${res.status}`)
  const data = (await res.json()) as { status: SessionStatus }
  return data.status
}

export async function startSession(): Promise<void> {
  const res = await fetch(`${config.WAHA_BASE_URL}/api/sessions/start`, {
    method: 'POST',
    headers: wahaHeaders(),
    body: JSON.stringify({ name: config.WAHA_SESSION, config: webhookConfig() }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`WAHA startSession returned ${res.status}`)
}

/**
 * Ensures the WAHA session has the correct webhook config.
 * Always applies the canonical config — this overwrites any stale registrations
 * (e.g. a previous deploy that registered extra events like message.any).
 * Returns true if the config was applied (session will restart briefly).
 */
export async function ensureWebhookConfigured(): Promise<boolean> {
  const sessionRes = await fetch(`${config.WAHA_BASE_URL}/api/sessions/${config.WAHA_SESSION}`, {
    headers: wahaHeaders(),
    signal: AbortSignal.timeout(10_000),
  })
  if (!sessionRes.ok) return false

  await fetch(`${config.WAHA_BASE_URL}/api/sessions/${config.WAHA_SESSION}`, {
    method: 'PUT',
    headers: wahaHeaders(),
    body: JSON.stringify({ config: webhookConfig() }),
    signal: AbortSignal.timeout(10_000),
  })
  return true
}

export async function getQrCodePng(): Promise<Buffer> {
  const res = await fetch(
    `${config.WAHA_BASE_URL}/api/${config.WAHA_SESSION}/auth/qr?format=image`,
    { headers: wahaHeaders(), signal: AbortSignal.timeout(10_000) },
  )
  if (!res.ok) throw new Error(`WAHA getQrCodePng returned ${res.status}`)
  const buf = await res.arrayBuffer()
  return Buffer.from(buf)
}

export async function getGroupName(groupId: string): Promise<string> {
  try {
    const res = await fetch(
      `${config.WAHA_BASE_URL}/api/${config.WAHA_SESSION}/groups/${groupId}`,
      { headers: wahaHeaders(), signal: AbortSignal.timeout(10_000) },
    )
    if (!res.ok) return groupId
    const data = (await res.json()) as { subject?: string }
    return data.subject ?? groupId
  } catch {
    return groupId
  }
}

export async function getGroupPictureUrl(groupId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${config.WAHA_BASE_URL}/api/${config.WAHA_SESSION}/groups/${groupId}/picture`,
      { headers: wahaHeaders(), signal: AbortSignal.timeout(10_000) },
    )
    if (!res.ok) return null
    const data = (await res.json()) as { url?: string | null }
    return data.url ?? null
  } catch {
    return null
  }
}

export async function listAllGroups(): Promise<Array<{ id: string; subject: string }>> {
  try {
    const res = await fetch(`${config.WAHA_BASE_URL}/api/${config.WAHA_SESSION}/groups`, {
      headers: wahaHeaders(),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return []
    const data = await res.json()
    // WAHA NOWEB returns an object map { "groupId@g.us": { id, subject, ... } }
    // WAHA Plus may return an array — handle both
    if (Array.isArray(data)) {
      return (data as Array<{ id: string; subject?: string }>).map((g) => ({
        id: g.id,
        subject: g.subject ?? g.id,
      }))
    }
    return Object.values(data as Record<string, { id: string; subject?: string }>).map((g) => ({
      id: g.id,
      subject: g.subject ?? g.id,
    }))
  } catch {
    return []
  }
}
