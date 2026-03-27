import { config } from './config.js'

export type SessionStatus = 'STOPPED' | 'STARTING' | 'SCAN_QR_CODE' | 'WORKING' | 'FAILED'

function wahaHeaders() {
  return { 'x-api-key': config.WAHA_API_KEY, 'Content-Type': 'application/json' }
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
    body: JSON.stringify({ name: config.WAHA_SESSION }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`WAHA startSession returned ${res.status}`)
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
    const data = (await res.json()) as { name?: string }
    return data.name ?? groupId
  } catch {
    return groupId
  }
}
