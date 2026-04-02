<script lang="ts">
  import type { FeedItem } from '@omb/shared'

  let {
    item,
    isNew = false,
    onlongpress,
    onimageload,
  }: {
    item: FeedItem
    isNew?: boolean
    onlongpress?: (item: FeedItem) => void
    onimageload?: () => void
  } = $props()

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  const displayName = $derived(item.user.displayName ?? 'Anonymous')
  const ago = $derived(timeAgo(item.loggedAt))

  // Long-press state
  let pressTimer: ReturnType<typeof setTimeout> | null = null
  let isPressed = $state(false)
  let startX = 0
  let startY = 0
  let animating = $state(false)
  $effect(() => {
    if (isNew) animating = true
  })

  function handlePointerDown(e: PointerEvent) {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    startX = e.clientX
    startY = e.clientY
    isPressed = true
    pressTimer = setTimeout(() => {
      isPressed = false
      onlongpress?.(item)
    }, 500)
  }

  function handlePointerMove(e: PointerEvent) {
    if (!pressTimer) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    if (Math.sqrt(dx * dx + dy * dy) > 10) cancelPress()
  }

  function cancelPress() {
    if (pressTimer) {
      clearTimeout(pressTimer)
      pressTimer = null
    }
    isPressed = false
  }

  function handleAnimationEnd() {
    animating = false
  }
</script>

<div
  class="beer-card card-hover"
  class:beer-card-new={animating}
  class:is-pressed={isPressed}
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={cancelPress}
  onpointercancel={cancelPress}
  onpointerleave={cancelPress}
  onanimationend={handleAnimationEnd}
  role="button"
  tabindex="0"
  aria-label="Beer photo by {displayName} — long press to enlarge"
>
  <div class="photo-wrap">
    <img
      src={item.photoUrl}
      alt="Beer logged by {displayName}"
      loading="lazy"
      class="photo"
      onload={onimageload}
    />
    <div class="overlay"></div>
    <div class="meta">
      <div class="meta-left">
        <a href="/users/{item.user.slug}" class="meta-name">{displayName}</a>
        <a href="/groups/{item.group.slug}" class="meta-group">{item.group.name}</a>
      </div>
      <span class="meta-time">{ago}</span>
    </div>
  </div>
</div>

<style>
  .beer-card {
    border-radius: 0.75rem;
    overflow: hidden;
    background-color: var(--color-bg-card);
    border: 1px solid var(--color-border);
    cursor: pointer;
    user-select: none;
    transition:
      transform 150ms ease,
      box-shadow 150ms ease;
  }

  .beer-card.is-pressed {
    transform: scale(0.97);
    box-shadow:
      0 0 0 2px var(--color-beer-amber),
      0 0 12px rgba(212, 136, 58, 0.4);
  }

  .photo-wrap {
    position: relative;
    overflow: hidden;
    touch-action: manipulation;
  }

  .photo {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 300ms ease;
  }

  .beer-card:hover .photo {
    transform: scale(1.03);
  }

  .overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(26, 18, 8, 0.88) 0%, transparent 55%);
    pointer-events: none;
  }

  .meta {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 0.75rem;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 0.5rem;
  }

  .meta-left {
    min-width: 0;
    flex: 1;
  }

  .meta-name {
    display: block;
    font-family: var(--font-body);
    font-weight: 500;
    font-size: 0.85rem;
    color: var(--color-beer-foam);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .meta-name:hover {
    color: var(--color-beer-head);
  }

  .meta-group {
    display: inline-block;
    margin-top: 0.2rem;
    font-size: 0.65rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-beer-amber);
    background: rgba(200, 132, 42, 0.15);
    border: 1px solid rgba(200, 132, 42, 0.3);
    border-radius: 3px;
    padding: 1px 5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .meta-group:hover {
    color: var(--color-accent-glow);
  }

  .meta-time {
    font-family: var(--font-body);
    font-size: 0.7rem;
    color: var(--color-cream-faint);
    white-space: nowrap;
    flex-shrink: 0;
  }
</style>
