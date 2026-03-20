import type { SseEvent } from '@omb/shared'

/**
 * Subscribe to the global beer count SSE stream.
 * Must only be called inside onMount (browser-only).
 * Returns a cleanup function — use as the onMount return value.
 */
export function subscribeToStream(
  onEvent: (event: SseEvent) => void,
  onError?: (err: Event) => void,
): () => void {
  const es = new EventSource('/api/v1/global/stream')

  es.onmessage = (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data) as SseEvent
      onEvent(data)
    } catch {
      // ignore malformed events
    }
  }

  if (onError) {
    es.onerror = onError
  }

  return () => es.close()
}
