<script lang="ts">
  import type { FeedItem } from '@omb/shared'
  import { timeAgo } from '$lib/utils'
  import CountryFlag from './CountryFlag.svelte'

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
    photo-wrap is the container query root. Its fixed 3:4 aspect-ratio gives
    Masonry a stable, measurable height before any image loads.
  -->
  <div class="photo-wrap">
    <div class="skeleton" class:skeleton-hidden={imageLoaded} aria-hidden="true"></div>

    <img
      src={item.photoUrl}
      alt="Beer logged by {displayName}"
      loading="lazy"
      class="photo"
      class:photo-loaded={imageLoaded}
      onload={() => (imageLoaded = true)}
    />

    <!-- Gradient only needed when text is present; hidden via container query at tiny sizes -->
    <div class="overlay" aria-hidden="true"></div>

    <!-- Flag: top-left, scales with card via cqi -->
    {#if item.user.countryCode}
      <div class="flag-badge">
        <CountryFlag countryCode={item.user.countryCode} />
      </div>
    {/if}

    <!-- Progressive meta: what's shown depends on card width via @container -->
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

  /* Container query root — also the fixed-ratio anchor for Masonry */
  .photo-wrap {
    container-type: inline-size;
    container-name: card;
    position: relative;
    aspect-ratio: 3 / 4;
    overflow: hidden;
    touch-action: manipulation;
  }

  /* ── Skeleton ───────────────────────────────────────────────────────── */
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

  /* ── Photo ──────────────────────────────────────────────────────────── */
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

  /* ── Gradient overlay ───────────────────────────────────────────────── */
  .overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(26, 18, 8, 0.88) 0%, transparent 55%);
    pointer-events: none;
    transition: opacity 150ms ease;
  }

  /* ── Flag badge — scales with card width via cqi ────────────────────── */
  .flag-badge {
    position: absolute;
    top: 0.4rem;
    left: 0.4rem;
    z-index: 2;
    width: clamp(14px, 10cqi, 22px);
    aspect-ratio: 4 / 3;
    border-radius: 2px;
    overflow: hidden;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.65);
    display: flex;
    line-height: 0;
  }

  /* ── Meta overlay ───────────────────────────────────────────────────── */
  .meta {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 0.6rem 0.55rem;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 0.4rem;
  }

  .meta-left {
    min-width: 0;
    flex: 1;
  }

  .meta-name {
    display: block;
    font-family: var(--font-body);
    font-weight: 500;
    font-size: 0.8rem;
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
    font-size: 0.6rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-beer-amber);
    background: rgba(200, 132, 42, 0.15);
    border: 1px solid rgba(200, 132, 42, 0.3);
    border-radius: 3px;
    padding: 1px 4px;
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
    font-size: 0.65rem;
    color: var(--color-cream-faint);
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* ── Progressive disclosure via container queries ───────────────────── */

  /*
   * < 120px  — pure photo, nothing overlaid
   * 120–154px — flag only
   * 155–219px — flag + username
   * 220–279px — flag + username + time
   * 280px+    — flag + username + time + group label
   */

  /* Tiny: strip everything */
  @container card (max-width: 119px) {
    .flag-badge {
      display: none;
    }
    .overlay {
      display: none;
    }
    .meta {
      display: none;
    }
  }

  /* Small: flag visible, no text */
  @container card (min-width: 120px) and (max-width: 154px) {
    .overlay {
      display: none;
    }
    .meta {
      display: none;
    }
  }

  /* Medium-small: flag + username only */
  @container card (min-width: 155px) and (max-width: 219px) {
    .meta-group {
      display: none;
    }
    .meta-time {
      display: none;
    }
    .meta {
      padding: 0.5rem 0.45rem;
    }
  }

  /* Medium: flag + username + time, no group */
  @container card (min-width: 220px) and (max-width: 279px) {
    .meta-group {
      display: none;
    }
  }

  /* Large (280px+): everything shown — default styles apply */
</style>
