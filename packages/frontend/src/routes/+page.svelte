<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import type { PageData } from './$types'
  import type { FeedItem, SseEvent } from '@omb/shared'
  import { subscribeToStream } from '$lib/sse'
  import HeroCard from '$lib/components/HeroCard.svelte'
  import FeedGrid from '$lib/components/FeedGrid.svelte'
  import LoadMoreButton from '$lib/components/LoadMoreButton.svelte'
  import LeaderboardTable from '$lib/components/LeaderboardTable.svelte'
  import BeerFlash from '$lib/components/BeerFlash.svelte'
  import BeerToast from '$lib/components/BeerToast.svelte'
  import StatsStrip from '$lib/components/StatsStrip.svelte'
  import BeerLightbox from '$lib/components/BeerLightbox.svelte'
  import type { Toast } from '$lib/components/BeerToast.svelte'

  let { data }: { data: PageData } = $props()

  // untrack: intentional one-time capture of SSR data; state is then managed independently (SSE + load-more)
  let liveCount = $state(untrack(() => data.count))
  let feedItems = $state<FeedItem[]>(untrack(() => data.feed.items))
  let feedOffset = $state(untrack(() => data.feed.items.length))
  let feedTotal = $state(untrack(() => data.feed.total))
  let loadingMore = $state(false)
  // Tracks beers logged since page load via SSE (proxy for "today" until API provides it)
  let sessionCount = $state(0)

  // New effect triggers
  let flashCount = $state(0)
  let lightboxItem = $state<FeedItem | null>(null)
  let newestId = $state('')
  let toasts = $state<Toast[]>([])
  let mountTime = $state(Date.now())
  let tick = $state(0) // increments every 60s to refresh rate calculation

  // Scroll state — drives compact header and pending-item buffering
  let heroRef: HTMLElement | undefined
  let isScrolled = $state(false)
  let isNearTop = $state(true)

  // Items that arrive while the user is scrolled down — held back to avoid grid disruption
  let pendingItems = $state<FeedItem[]>([])

  const hasMore = $derived(feedOffset < feedTotal)
  const TARGET = 1_000_000
  const pct = $derived(Math.min((liveCount / TARGET) * 100, 100).toFixed(2))

  // Beers per hour since page load (re-evaluates on each tick)
  const sseRate = $derived.by(() => {
    void tick // reactive dependency
    const elapsedHours = (Date.now() - mountTime) / 3_600_000
    return elapsedHours < 0.01 ? 0 : Math.round(sessionCount / elapsedHours)
  })

  function transformSseToFeedItem(latestBeer: NonNullable<SseEvent['latestBeer']>): FeedItem {
    return {
      id: latestBeer.id,
      photoUrl: latestBeer.photoUrl,
      loggedAt: latestBeer.loggedAt,
      user: {
        id: latestBeer.id,
        displayName: latestBeer.userName,
        slug: latestBeer.userName?.toLowerCase().replace(/\s+/g, '-') ?? 'anonymous',
      },
      group: {
        id: latestBeer.id,
        name: latestBeer.groupName,
        slug: latestBeer.groupName.toLowerCase().replace(/\s+/g, '-'),
      },
    }
  }

  function flushPending() {
    if (pendingItems.length === 0) return
    const toFlush = pendingItems
    pendingItems = []
    feedItems = [...toFlush, ...feedItems]
    feedOffset += toFlush.length
    newestId = toFlush[0].id
    setTimeout(() => {
      if (newestId === toFlush[0].id) newestId = ''
    }, 2000)
  }

  function handleScroll() {
    const scrollY = window.scrollY
    isNearTop = scrollY < 80

    if (heroRef) {
      const rect = heroRef.getBoundingClientRect()
      isScrolled = rect.bottom < 20
    }

    // Auto-flush pending items once user scrolls back near the top
    if (isNearTop && pendingItems.length > 0) {
      flushPending()
    }
  }

  onMount(() => {
    // Establish initial scroll state immediately
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })

    // Rate tick: re-derive sseRate every 60s
    const tickId = setInterval(() => {
      tick++
    }, 60_000)

    const unsub = subscribeToStream((event: SseEvent) => {
      liveCount = event.count
      sessionCount += 1
      flashCount += 1

      if (event.latestBeer) {
        const item = transformSseToFeedItem(event.latestBeer)
        const isDupe =
          feedItems.some((f) => f.id === item.id) || pendingItems.some((p) => p.id === item.id)

        if (!isDupe) {
          feedTotal += 1

          if (isNearTop) {
            // User is at the top — prepend immediately with animation
            feedItems = [item, ...feedItems]
            feedOffset += 1
            newestId = item.id
            setTimeout(() => {
              if (newestId === item.id) newestId = ''
            }, 2000)
          } else {
            // User has scrolled — buffer to avoid disrupting their view
            pendingItems = [item, ...pendingItems]
          }
        }

        const toast: Toast = {
          id: event.latestBeer.id,
          photoUrl: event.latestBeer.photoUrl,
          userName: event.latestBeer.userName,
          groupName: event.latestBeer.groupName,
          ts: Date.now(),
        }
        toasts = [...toasts.slice(-2), toast]
        setTimeout(() => {
          toasts = toasts.filter((t) => t.id !== toast.id)
        }, 4500)
      }
    })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      clearInterval(tickId)
      unsub()
    }
  })

  async function loadMore() {
    if (loadingMore || !hasMore) return
    loadingMore = true
    try {
      const res = await fetch(`/api/v1/global/feed?limit=20&offset=${feedOffset}`)
      if (res.ok) {
        const pageData = (await res.json()) as { items: FeedItem[]; total: number }
        feedItems = [...feedItems, ...pageData.items]
        feedOffset += pageData.items.length
        feedTotal = pageData.total
      }
    } finally {
      loadingMore = false
    }
  }
</script>

<svelte:head>
  <title>OneMillionBeers — Live Beer Counter &amp; Leaderboard</title>
  <meta
    name="description"
    content="Track every beer logged across WhatsApp groups. Watch the live counter tick up, browse the photo feed, and see who's leading the race to one million."
  />
</svelte:head>

<BeerFlash trigger={flashCount} />
<BeerToast
  {toasts}
  ondismiss={(id) => {
    toasts = toasts.filter((t) => t.id !== id)
  }}
/>
<BeerLightbox
  item={lightboxItem}
  onclose={() => {
    lightboxItem = null
  }}
/>

<!-- Compact sticky header — morphs in as the hero scrolls out of view -->
<div class="compact-header" class:compact-visible={isScrolled} aria-hidden={!isScrolled}>
  <a href="/" class="compact-logo">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 2h10l1 4H5L6 2Z" fill="var(--color-beer-amber)" opacity="0.9" />
      <rect
        x="5"
        y="6"
        width="14"
        height="14"
        rx="2"
        fill="var(--color-beer-amber)"
        opacity="0.15"
        stroke="var(--color-beer-amber)"
        stroke-width="1.5"
      />
      <path
        d="M17 10h2a2 2 0 0 1 0 4h-2"
        stroke="var(--color-beer-amber)"
        stroke-width="1.5"
        stroke-linecap="round"
      />
    </svg>
    <span class="compact-logo-text">OneMillionBeers</span>
  </a>
  <div class="compact-right">
    <span class="compact-count">{liveCount.toLocaleString()}</span>
    <div
      class="compact-bar-wrap"
      role="progressbar"
      aria-valuenow={liveCount}
      aria-valuemin={0}
      aria-valuemax={TARGET}
      aria-label="Progress to one million beers"
    >
      <div class="compact-bar-fill" style="width: {pct}%"></div>
    </div>
  </div>
</div>

<!-- Floating pill: notifies user of new beers arriving while they browse -->
{#if pendingItems.length > 0}
  <button class="new-beers-pill" class:pill-below-header={isScrolled} onclick={flushPending}>
    ↑ {pendingItems.length}
    {pendingItems.length === 1 ? 'new beer' : 'new beers'}
  </button>
{/if}

<div class="page">
  <!-- Hero section — full progress card at top of page -->
  <div class="hero-wrap" bind:this={heroRef}>
    <HeroCard count={liveCount} {sessionCount} {flashCount} />
  </div>

  <StatsStrip count={liveCount} {sessionCount} leaderboard={data.leaderboard.entries} {sseRate} />

  <!-- Feed + Leaderboard grid -->
  <div class="content-grid">
    <!-- Feed -->
    <section class="feed-section">
      <div class="section-header">
        <h2 class="section-title">Latest Beers</h2>
      </div>
      <FeedGrid
        items={feedItems}
        loading={loadingMore && feedItems.length === 0}
        {newestId}
        onlongpress={(item) => {
          lightboxItem = item
        }}
      />
      <LoadMoreButton {hasMore} onloadmore={loadMore} />
    </section>

    <!-- Leaderboard sidebar -->
    <aside class="leaderboard-section">
      <LeaderboardTable entries={data.leaderboard.entries} title="Top Drinkers" />
    </aside>
  </div>
</div>

<style>
  .page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1.25rem 1rem 4rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .hero-wrap {
    width: 100%;
  }

  .content-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.5rem;
    align-items: start;
  }

  @media (min-width: 1024px) {
    .content-grid {
      grid-template-columns: 1fr 320px;
    }
  }

  /* ── Compact header ─────────────────────────────────────── */
  .compact-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.625rem 1.25rem;
    background-color: rgba(24, 17, 10, 0.95);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--color-border);
    /* Hidden until scrolled */
    opacity: 0;
    transform: translateY(-6px);
    pointer-events: none;
    transition:
      opacity 260ms ease,
      transform 260ms ease;
  }

  .compact-header.compact-visible {
    opacity: 1;
    transform: translateY(0);
    pointer-events: all;
  }

  .compact-logo {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    text-decoration: none;
    flex-shrink: 0;
  }

  .compact-logo-text {
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 700;
    color: var(--color-beer-foam);
    letter-spacing: -0.01em;
  }

  .compact-logo:hover .compact-logo-text {
    color: var(--color-beer-amber);
  }

  .compact-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.3rem;
  }

  .compact-count {
    font-family: var(--font-display);
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--color-beer-amber);
    letter-spacing: 0.02em;
    line-height: 1;
  }

  .compact-bar-wrap {
    width: 110px;
    height: 4px;
    background-color: var(--color-bg-surface);
    border-radius: 9999px;
    overflow: hidden;
  }

  .compact-bar-fill {
    height: 100%;
    background: linear-gradient(
      90deg,
      var(--color-beer-dark),
      var(--color-beer-amber),
      var(--color-accent-glow)
    );
    border-radius: 9999px;
    transition: width 1s ease-out;
  }

  /* ── New beers pill ─────────────────────────────────────── */
  .new-beers-pill {
    position: fixed;
    top: 0.75rem;
    left: 50%;
    transform: translateX(-50%) translateY(0);
    z-index: 39;
    background: var(--color-beer-dark);
    border: 1px solid var(--color-beer-amber);
    color: var(--color-beer-head);
    font-family: var(--font-body);
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.375rem 1rem;
    border-radius: 9999px;
    cursor: pointer;
    white-space: nowrap;
    box-shadow: 0 2px 16px rgba(212, 136, 58, 0.4);
    animation: pill-drop 320ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }

  .new-beers-pill.pill-below-header {
    top: 3.5rem;
  }

  .new-beers-pill:hover {
    background: var(--color-beer-amber);
    color: var(--color-bg-deep);
  }

  @keyframes pill-drop {
    0% {
      opacity: 0;
      transform: translateX(-50%) translateY(-10px);
    }
    100% {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  /* ── Feed section ───────────────────────────────────────── */
  .feed-section {
    width: 100%;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.875rem;
  }

  .section-title {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-beer-foam);
  }

  .leaderboard-section {
    width: 100%;
  }
</style>
