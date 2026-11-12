import { config } from './config.js'

export type SessionStatus = 'STOPPED' | 'STARTING' | 'SCAN_QR_CODE' | 'WORKING' | 'FAILED'

function wahaHeaders() {
  return { 'x-api-key': config.WAHA_API_KEY, 'Content-Type': 'application/json' }
}

// Every session WAHA knows, paired in its dashboard; the collector keeps no list.
export async function listSessions(): Promise<Array<{ name: string; status: SessionStatus }>> {
  const res = await fetch(`${config.WAHA_BASE_URL}/api/sessions`, {
    headers: wahaHeaders(),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`WAHA listSessions returned ${res.status}`)
  const sessions = (await res.json()) as Array<{ name: string; status: SessionStatus }>
  return sessions.map(({ name, status }) => ({ name, status }))
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
