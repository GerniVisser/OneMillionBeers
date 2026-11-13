import type { ReactionSummary, SseEvent } from '@omb/shared'
import { browser } from '$app/environment'
import { SvelteMap } from 'svelte/reactivity'

let lastEvent = $state<SseEvent | null>(null)
// Incremented whenever the page returns from a stale background state.
// Pages watch this to trigger a full resync.
let resyncCount = $state(0)

// Kept per beer rather than read from lastEvent, which a burst of events overwrites.
const liveReactions = new SvelteMap<string, ReactionSummary>()

export function getLastSseEvent(): SseEvent | null {
  return lastEvent
}

/** The newest reactions pushed for a beer since the page loaded, if any. */
export function getLiveReactions(beerLogId: string): ReactionSummary | undefined {
  return liveReactions.get(beerLogId)
}

export function getResyncCount(): number {
  return resyncCount
}

export function initSseConnection(): () => void {
  if (!browser) return () => {}

  const es = new EventSource('/api/v1/global/stream')
  es.onmessage = (e: MessageEvent) => {
    try {
      const event = JSON.parse(e.data) as SseEvent
      if (event.type === 'reactions') liveReactions.set(event.id, event.reactions)
      lastEvent = event
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
