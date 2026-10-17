import { config } from './config.js'

export type SessionStatus = 'STOPPED' | 'STARTING' | 'SCAN_QR_CODE' | 'WORKING' | 'FAILED'

// Events the collector handles — kept in sync with webhook.ts handler
const WEBHOOK_EVENTS = [
  'message',
  'message.revoked',
  'session.status',
  'group.v2.join',
  'group.v2.update',
]

function wahaHeaders() {
  return { 'x-api-key': config.WAHA_API_KEY, 'Content-Type': 'application/json' }
}

// No hmac: /webhook is only reachable on the Docker network. Revisit if that changes.
function sessionConfig() {
  return {
    webhooks: [
      {
        url: config.WAHA_WEBHOOK_URL,
        events: WEBHOOK_EVENTS,
        // Covers a collector restart (~10 s) instead of dropping the event.
        retries: { policy: 'constant', delaySeconds: 2, attempts: 5 },
      },
    ],
    // The default marks the number online, which mutes notifications on the phone.
    noweb: { markOnline: false },
  }
}

function ownedFields(cfg: unknown): string {
  const c = cfg as
    | {
        webhooks?: Array<{ url?: string; events?: string[]; retries?: unknown }>
        noweb?: { markOnline?: boolean }
      }
    | undefined
  const hook = c?.webhooks?.[0]
  return JSON.stringify([
    hook?.url ?? null,
    [...(hook?.events ?? [])].sort(),
    hook?.retries ?? null,
    c?.noweb?.markOnline ?? true,
  ])
}

export async function getSessionStatus(session: string): Promise<SessionStatus> {
  const res = await fetch(`${config.WAHA_BASE_URL}/api/sessions/${encodeURIComponent(session)}`, {
    headers: wahaHeaders(),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`WAHA getSessionStatus returned ${res.status}`)
  const data = (await res.json()) as { status: SessionStatus }
  return data.status
}

/**
 * Restarts the session in place, reusing the stored credentials. Recovers a
 * FAILED session caused by a transient WhatsApp-side disconnect; does not help
 * when WhatsApp has de-authorized the linked device (that needs a QR re-scan).
 */
export async function restartSession(session: string): Promise<void> {
  const res = await fetch(
    `${config.WAHA_BASE_URL}/api/sessions/${encodeURIComponent(session)}/restart`,
    {
      method: 'POST',
      headers: wahaHeaders(),
      signal: AbortSignal.timeout(30_000),
    },
  )
  if (!res.ok) throw new Error(`WAHA restartSession returned ${res.status}`)
}

export type ReconcileResult =
  | { action: 'created' }
  | { action: 'updated'; status: SessionStatus }
  | { action: 'unchanged'; status: SessionStatus }

// Creates the session if missing; otherwise PUTs only on drift, because a PUT
// restarts the session. Never touches pairing or status.
export async function reconcileSession(session: string): Promise<ReconcileResult> {
  const url = `${config.WAHA_BASE_URL}/api/sessions/${encodeURIComponent(session)}`
  const res = await fetch(url, { headers: wahaHeaders(), signal: AbortSignal.timeout(10_000) })

  if (res.status === 404) {
    const created = await fetch(`${config.WAHA_BASE_URL}/api/sessions`, {
      method: 'POST',
      headers: wahaHeaders(),
      body: JSON.stringify({ name: session, start: true, config: sessionConfig() }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!created.ok) throw new Error(`WAHA create session returned ${created.status}`)
    return { action: 'created' }
  }

  if (!res.ok) throw new Error(`WAHA getSession returned ${res.status}`)
  const data = (await res.json()) as { status: SessionStatus; config?: unknown }

  if (ownedFields(data.config) === ownedFields(sessionConfig())) {
    return { action: 'unchanged', status: data.status }
  }

  const updated = await fetch(url, {
    method: 'PUT',
    headers: wahaHeaders(),
    body: JSON.stringify({ config: sessionConfig() }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!updated.ok) throw new Error(`WAHA update session returned ${updated.status}`)
  return { action: 'updated', status: data.status }
}

export async function getQrCodePng(session: string): Promise<Buffer> {
  const res = await fetch(
    `${config.WAHA_BASE_URL}/api/${encodeURIComponent(session)}/auth/qr?format=image`,
    { headers: wahaHeaders(), signal: AbortSignal.timeout(10_000) },
  )
  if (!res.ok) throw new Error(`WAHA getQrCodePng returned ${res.status}`)
  const buf = await res.arrayBuffer()
  return Buffer.from(buf)
}

/**
 * Returns true when a string looks like a raw WhatsApp JID (15+ leading digits) or contains
 * JSON syntax characters, indicating WAHA returned internal data instead of a real group name.
 */
function isGarbageSubject(value: string): boolean {
  return /^\d{10,}/.test(value) || /["{}\[\]]/.test(value)
}

export async function getGroupName(session: string, groupId: string): Promise<string> {
  try {
    const res = await fetch(
      `${config.WAHA_BASE_URL}/api/${encodeURIComponent(session)}/groups/${groupId}`,
      { headers: wahaHeaders(), signal: AbortSignal.timeout(10_000) },
    )
    if (!res.ok) return groupId
    const data = (await res.json()) as { subject?: string }
    const subject = data.subject?.trim()
    if (subject && !isGarbageSubject(subject)) return subject
    return groupId
  } catch {
    return groupId
  }
}

export async function getGroupPictureUrl(session: string, groupId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${config.WAHA_BASE_URL}/api/${encodeURIComponent(session)}/groups/${groupId}/picture`,
      { headers: wahaHeaders(), signal: AbortSignal.timeout(10_000) },
    )
    if (!res.ok) return null
    const data = (await res.json()) as { url?: string | null }
    return data.url ?? null
  } catch {
    return null
  }
}

export async function getGroupInviteCode(session: string, groupId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${config.WAHA_BASE_URL}/api/${encodeURIComponent(session)}/groups/${groupId}/invite-code`,
      { headers: wahaHeaders(), signal: AbortSignal.timeout(10_000) },
    )
    if (!res.ok) return null
    const code = (await res.text()).trim()
    return code || null
  } catch {
    return null
  }
}

export async function listAllGroups(
  session: string,
): Promise<Array<{ id: string; subject: string }>> {
  try {
    const res = await fetch(`${config.WAHA_BASE_URL}/api/${encodeURIComponent(session)}/groups`, {
      headers: wahaHeaders(),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return []
    const data = await res.json()
    // WAHA NOWEB returns an object map { "groupId@g.us": { id, subject, ... } }
    // WAHA Plus may return an array — handle both
    const toEntry = (g: { id: string; subject?: string }) => {
      const subject = g.subject?.trim()
      return { id: g.id, subject: subject && !isGarbageSubject(subject) ? subject : g.id }
    }
    if (Array.isArray(data)) {
      return (data as Array<{ id: string; subject?: string }>).map(toEntry)
    }
    return Object.values(data as Record<string, { id: string; subject?: string }>).map(toEntry)
  } catch {
    return []
  }
}
