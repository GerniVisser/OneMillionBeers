export const WAHA_URL = process.env.WAHA_URL ?? 'http://waha:3000'
const API_KEY = process.env.WAHA_API_KEY ?? 'lab-api-key'
const WEBHOOK_BASE = process.env.WEBHOOK_BASE ?? 'http://recorder:3201'
export const HMAC_KEY = process.env.WEBHOOK_HMAC_KEY ?? 'lab-hmac-key'

// message.any (not message) so a number's own posts are recorded too: production
// subscribes to `message`, which skips fromMe, and that gap is worth seeing.
export const WEBHOOK_EVENTS = [
  'message.any',
  'message.revoked',
  'message.edited',
  'message.reaction',
  'session.status',
  'group.v2.join',
  'group.v2.leave',
  'group.v2.update',
  'group.v2.participants',
]

export interface WahaSession {
  name: string
  status: string
  me?: { id?: string; pushName?: string } | null
  config?: Record<string, unknown>
}

export async function waha(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(WAHA_URL + path, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(30_000),
    headers: { 'x-api-key': API_KEY, 'content-type': 'application/json', ...init.headers },
  })
}

export async function listSessions(): Promise<WahaSession[]> {
  const res = await waha('/api/sessions?all=true')
  if (!res.ok) throw new Error(`GET /api/sessions -> ${res.status}`)
  return (await res.json()) as WahaSession[]
}

export function sessionConfig(name: string): Record<string, unknown> {
  return {
    metadata: { lab: 'true' },
    // markOnline (default true) shows the account as online, and WhatsApp then
    // holds back notifications on the phone. Lab sessions only listen.
    noweb: { markOnline: false },
    webhooks: [
      {
        url: `${WEBHOOK_BASE}/webhook/${name}`,
        events: WEBHOOK_EVENTS,
        hmac: { key: HMAC_KEY },
        retries: { policy: 'constant', delaySeconds: 2, attempts: 5 },
      },
    ],
  }
}

// Creates any LAB_SESSIONS that do not exist yet, and updates the config of
// existing ones when it differs (WAHA restarts the session to apply it; pairing
// is kept). Status is not touched otherwise, so STOPPED sessions stay stopped and
// restart experiments see WAHA's own behaviour.
export async function ensureSessions(names: string[], log: (msg: string) => void): Promise<void> {
  for (;;) {
    try {
      const existing = new Map((await listSessions()).map((s) => [s.name, s]))
      for (const name of names) {
        const config = sessionConfig(name)
        const current = existing.get(name)
        if (!current) {
          const res = await waha('/api/sessions', {
            method: 'POST',
            body: JSON.stringify({ name, start: true, config }),
          })
          log(`create session ${name}: ${res.status} ${res.ok ? '' : await res.text()}`)
        } else if (!sameConfig(current.config, config)) {
          const res = await waha(`/api/sessions/${name}`, {
            method: 'PUT',
            body: JSON.stringify({ name, config }),
          })
          log(`update session ${name} config: ${res.status} ${res.ok ? '' : await res.text()}`)
        }
      }
      return
    } catch (err) {
      log(`WAHA not ready (${(err as Error).message}), retrying in 3s`)
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
}

// Compares the parts of the config the lab sets; WAHA may add defaults of its own.
function sameConfig(current: Record<string, unknown> | undefined, wanted: Record<string, unknown>) {
  const pick = (c: Record<string, unknown> | undefined) => {
    const hook = (c?.webhooks as { events?: string[] }[] | undefined)?.[0]
    const noweb = c?.noweb as { markOnline?: boolean; store?: { enabled?: boolean } } | undefined
    // A store left on from earlier counts as a difference, so it gets switched off.
    return JSON.stringify([
      [...(hook?.events ?? [])].sort(),
      noweb?.markOnline ?? true,
      noweb?.store?.enabled ?? false,
    ])
  }
  return pick(current) === pick(wanted)
}

// WAHA may hand out media URLs with its own origin (e.g. http://localhost:3000);
// fetch through WAHA_URL instead, as production does.
export function rewriteMediaUrl(url: string): string {
  const parsed = new URL(url)
  const base = new URL(WAHA_URL)
  parsed.protocol = base.protocol
  parsed.host = base.host
  return parsed.toString()
}

// NOWEB returns an object keyed by chat id here rather than an array (WAHA #2263).
export async function listGroups(session: string): Promise<{ id: string; subject?: string }[]> {
  const res = await waha(`/api/${session}/groups`)
  if (!res.ok) throw new Error(`GET /api/${session}/groups -> ${res.status}`)
  const body = (await res.json()) as unknown
  const items = Array.isArray(body) ? body : Object.values(body as Record<string, unknown>)
  return items.map((g) => {
    const group = g as { id?: unknown; JID?: string; subject?: string; name?: string }
    const id =
      typeof group.id === 'string'
        ? group.id
        : ((group.id as { _serialized?: string } | undefined)?._serialized ?? group.JID ?? '')
    return { id, subject: group.subject ?? group.name }
  })
}
