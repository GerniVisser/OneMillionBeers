import type { SseEvent } from '@omb/shared'
import { browser } from '$app/environment'

let lastEvent = $state<SseEvent | null>(null)
// Incremented whenever the page returns from a stale background state.
// Pages watch this to trigger a full resync.
let resyncCount = $state(0)

export function getLastSseEvent(): SseEvent | null {
  return lastEvent
}

export function getResyncCount(): number {
  return resyncCount
}

export function initSseConnection(): () => void {
  if (!browser) return () => {}

  const es = new EventSource('/api/v1/global/stream')
  es.onmessage = (e: MessageEvent) => {
    try {
      lastEvent = JSON.parse(e.data) as SseEvent
    } catch {
      // ignore malformed events
    }
  }

  // Resync when the user returns to the page after >30 s in the background.
  // Covers phone lock, app switch, and tab switching on mobile.
  // The 30 s threshold avoids unnecessary refetches on quick tab switches.
  let hiddenAt: number | null = null
  const handleVisibility = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
    } else if (document.visibilityState === 'visible') {
      const stale = hiddenAt !== null && Date.now() - hiddenAt > 30_000
      hiddenAt = null
      if (stale) resyncCount += 1
    }
  }
  document.addEventListener('visibilitychange', handleVisibility)

  return () => {
    es.close()
    document.removeEventListener('visibilitychange', handleVisibility)
  }
}
