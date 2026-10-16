// What the collector has observed per WhatsApp session, for the admin page.
// In memory only (the collector has no database): it starts empty after a
// restart. Everything recorded here is also logged, so CloudWatch keeps the
// durable history.

const STATUS_HISTORY = 50
const AUDIT_ENTRIES = 200

export interface StatusChange {
  status: string
  at: number
  source: 'webhook' | 'poll'
}

export interface SessionActivity {
  lastWebhookAt: number | null
  lastEvent: string | null
  lastBeerAt: number | null
  beersSinceStart: number
  // Last paired account seen; kept after logout so the page can prefill the
  // number to re-link with.
  lastKnownMe: string | null
  statusHistory: StatusChange[]
}

export interface AuditEntry {
  at: number
  actor: string
  ip: string | null
  action: string
  target: string | null
  ok: boolean
  detail?: string
}

const sessions = new Map<string, SessionActivity>()
const audit: AuditEntry[] = []
const startedAt = Date.now()

function activityFor(session: string): SessionActivity {
  let a = sessions.get(session)
  if (!a) {
    a = {
      lastWebhookAt: null,
      lastEvent: null,
      lastBeerAt: null,
      beersSinceStart: 0,
      lastKnownMe: null,
      statusHistory: [],
    }
    sessions.set(session, a)
  }
  return a
}

function pushCapped<T>(list: T[], item: T, cap: number): void {
  list.unshift(item)
  if (list.length > cap) list.length = cap
}

export function recordWebhook(session: string, event: string): void {
  const a = activityFor(session)
  a.lastWebhookAt = Date.now()
  a.lastEvent = event
}

/** Records a status only when it differs from the last one seen. */
export function recordStatus(session: string, status: string, source: StatusChange['source']) {
  const a = activityFor(session)
  if (a.statusHistory[0]?.status === status) return
  pushCapped(a.statusHistory, { status, at: Date.now(), source }, STATUS_HISTORY)
}

export function recordBeer(session: string): void {
  const a = activityFor(session)
  a.lastBeerAt = Date.now()
  a.beersSinceStart += 1
}

export function recordMe(session: string, me: string | null | undefined): void {
  if (me) activityFor(session).lastKnownMe = me
}

export function recordAudit(entry: Omit<AuditEntry, 'at'>): AuditEntry {
  const full = { at: Date.now(), ...entry }
  pushCapped(audit, full, AUDIT_ENTRIES)
  return full
}

export function getActivity(session: string): SessionActivity {
  return activityFor(session)
}

export function getAudit(): AuditEntry[] {
  return [...audit]
}

export function getCollectorStartedAt(): number {
  return startedAt
}

export function resetActivity(): void {
  sessions.clear()
  audit.length = 0
}
