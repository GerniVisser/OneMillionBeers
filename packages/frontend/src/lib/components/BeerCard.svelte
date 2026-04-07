<script lang="ts">
  import type { FeedItem } from '@omb/shared'
  import { timeAgo } from '$lib/utils'

  let {
    item,
    isNew = false,
    onlongpress,
  }: {
    item: FeedItem
    isNew?: boolean
    onlongpress?: (item: FeedItem) => void
  } = $props()

  const displayName = $derived(item.user.displayName ?? 'Anonymous')
  const ago = $derived(timeAgo(item.loggedAt))

  let imageLoaded = $state(false)
  let animating = $state(false)
  $effect(() => {
    if (isNew) animating = true
  })

  // Long-press
  let pressTimer: ReturnType<typeof setTimeout> | null = null
  let isPressed = $state(false)
  let startX = 0
  let startY = 0

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
</script>

<div
  class="card"
  class:card-new={animating}
  class:card-pressed={isPressed}
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={cancelPress}
  onpointercancel={cancelPress}
  onpointerleave={cancelPress}
  onanimationend={() => (animating = false)}
  role="button"
  tabindex="0"
  aria-label="Beer photo by {displayName} — long press to enlarge"
>
  <!--
    photo-wrap always has aspect-ratio: 3/4 — a fixed height that Masonry can
    measure before any image loads. The image is absolutely inset within it.
    This is the key that makes the masonry grid stable.
  -->
  <div class="photo-wrap">
    <!-- Skeleton shown until image is ready -->
    <div class="skeleton" class:skeleton-hidden={imageLoaded} aria-hidden="true"></div>

    <img
      src={item.photoUrl}
      alt="Beer logged by {displayName}"
      loading="lazy"
      class="photo"
      class:photo-loaded={imageLoaded}
      onload={() => (imageLoaded = true)}
    />

    <div class="overlay" aria-hidden="true"></div>

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
  .card {
    border-radius: 0.75rem;
    overflow: hidden;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    cursor: pointer;
    user-select: none;
    transition:
      transform 150ms ease,
      box-shadow 150ms ease;
  }

  .card-pressed {
    transform: scale(0.97);
    box-shadow:
      0 0 0 2px var(--color-beer-amber),
      0 0 12px rgba(212, 136, 58, 0.4);
  }

  /* Fixed 3:4 portrait ratio — deterministic height for Masonry */
  .photo-wrap {
    position: relative;
    aspect-ratio: 3 / 4;
    overflow: hidden;
    touch-action: manipulation;
  }

  /* Pulsing placeholder, sits below image in stacking order */
  .skeleton {
    position: absolute;
    inset: 0;
    background: var(--color-bg-surface);
    animation: pulse 1.6s ease-in-out infinite;
    transition: opacity 200ms ease;
  }

  .skeleton-hidden {
    opacity: 0;
    pointer-events: none;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }

  /* Image fills the fixed-ratio box; starts invisible, fades in on load */
  .photo {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transition:
      opacity 350ms ease,
      transform 300ms ease;
  }

  .photo-loaded {
    opacity: 1;
  }

  .card:hover .photo-loaded {
    transform: scale(1.04);
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
