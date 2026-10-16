import { config } from './config.js'

export type SessionStatus = 'STOPPED' | 'STARTING' | 'SCAN_QR_CODE' | 'WORKING' | 'FAILED'

export interface WahaSession {
  name: string
  status: SessionStatus
  // The paired account; null while unpaired or stopped.
  me: { id: string; pushName?: string } | null
  // Where WAHA sends this session's events.
  webhookUrls: string[]
}

export interface WahaServerInfo {
  version: string
  engine: string
  startedAt: number
  uptimeMs: number
}

export type SessionAction = 'start' | 'stop' | 'restart' | 'logout'

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

function webhookConfig() {
  return { webhooks: [{ url: config.WAHA_WEBHOOK_URL, events: WEBHOOK_EVENTS }] }
}

// Session names come from the admin page; encode them so a name can never
// reach a different WAHA path.
const sessionPath = (session: string) => encodeURIComponent(session)

export async function getSessionStatus(session = config.WAHA_SESSION): Promise<SessionStatus> {
  const res = await fetch(`${config.WAHA_BASE_URL}/api/sessions/${sessionPath(session)}`, {
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
export async function restartSession(session = config.WAHA_SESSION): Promise<void> {
  await sessionAction(session, 'restart')
}

/**
 * Lifecycle actions from the admin page. `logout` unlinks the device and
 * discards its credentials; WAHA then restarts the session ready to pair.
 */
export async function sessionAction(session: string, action: SessionAction): Promise<void> {
  const res = await fetch(
    `${config.WAHA_BASE_URL}/api/sessions/${sessionPath(session)}/${action}`,
    { method: 'POST', headers: wahaHeaders(), signal: AbortSignal.timeout(30_000) },
  )
  if (!res.ok) throw new Error(`WAHA ${action} session returned ${res.status}`)
}

/** Every session WAHA knows about, including stopped ones. */
export async function listSessions(): Promise<WahaSession[]> {
  const res = await fetch(`${config.WAHA_BASE_URL}/api/sessions?all=true`, {
    headers: wahaHeaders(),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`WAHA listSessions returned ${res.status}`)
  const data = (await res.json()) as Array<{
    name: string
    status: SessionStatus
    me?: unknown
    config?: { webhooks?: Array<{ url?: string }> } | null
  }>
  return data.map((s) => ({
    name: s.name,
    status: s.status,
    me: (s.me as WahaSession['me']) ?? null,
    webhookUrls: (s.config?.webhooks ?? []).flatMap((w) => (w.url ? [w.url] : [])),
  }))
}

export async function getServerInfo(): Promise<WahaServerInfo> {
  const opts = { headers: wahaHeaders(), signal: AbortSignal.timeout(10_000) }
  const [versionRes, statusRes] = await Promise.all([
    fetch(`${config.WAHA_BASE_URL}/api/server/version`, opts),
    fetch(`${config.WAHA_BASE_URL}/api/server/status`, opts),
  ])
  if (!versionRes.ok) throw new Error(`WAHA server version returned ${versionRes.status}`)
  if (!statusRes.ok) throw new Error(`WAHA server status returned ${statusRes.status}`)
  const version = (await versionRes.json()) as { version: string; engine: string }
  const status = (await statusRes.json()) as { startTimestamp: number; uptime: number }
  return {
    version: version.version,
    engine: version.engine,
    startedAt: status.startTimestamp,
    uptimeMs: status.uptime,
  }
}

/**
 * Stops the WAHA process gracefully. Docker's restart policy brings the
 * container straight back, and sessions resume from their stored credentials.
 */
export async function restartServer(): Promise<void> {
  const res = await fetch(`${config.WAHA_BASE_URL}/api/server/stop`, {
    method: 'POST',
    headers: wahaHeaders(),
    body: JSON.stringify({ force: false }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`WAHA server stop returned ${res.status}`)
}

/**
 * Links the session by phone number instead of QR: WhatsApp shows a prompt and
 * the returned code is typed in under Linked devices → Link with phone number.
 * Only valid while the session is in SCAN_QR_CODE.
 */
export async function requestPairingCode(session: string, phoneNumber: string): Promise<string> {
  const res = await fetch(`${config.WAHA_BASE_URL}/api/${sessionPath(session)}/auth/request-code`, {
    method: 'POST',
    headers: wahaHeaders(),
    body: JSON.stringify({ phoneNumber }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`WAHA request-code returned ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as { code?: string }
  if (!data.code) throw new Error('WAHA request-code returned no code')
  return data.code
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

export async function getQrCodePng(session = config.WAHA_SESSION): Promise<Buffer> {
  const res = await fetch(
    `${config.WAHA_BASE_URL}/api/${sessionPath(session)}/auth/qr?format=image`,
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

export async function getGroupName(groupId: string): Promise<string> {
  try {
    const res = await fetch(
      `${config.WAHA_BASE_URL}/api/${config.WAHA_SESSION}/groups/${groupId}`,
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

export async function getGroupInviteCode(groupId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${config.WAHA_BASE_URL}/api/${config.WAHA_SESSION}/groups/${groupId}/invite-code`,
      { headers: wahaHeaders(), signal: AbortSignal.timeout(10_000) },
    )
    if (!res.ok) return null
    const code = (await res.text()).trim()
    return code || null
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
