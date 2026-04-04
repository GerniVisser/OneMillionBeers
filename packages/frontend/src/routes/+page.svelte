<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { browser } from '$app/environment'
  import type { PageData } from './$types'
  import type { FeedItem, SseEvent } from '@omb/shared'
  import { subscribeToStream } from '$lib/sse'
  import HeroCard from '$lib/components/HeroCard.svelte'
  import FeedGrid from '$lib/components/FeedGrid.svelte'
  import BeerFlash from '$lib/components/BeerFlash.svelte'
  import BeerToast from '$lib/components/BeerToast.svelte'
  import StatsStrip from '$lib/components/StatsStrip.svelte'
  import BeerLightbox from '$lib/components/BeerLightbox.svelte'
  import GroupSearch from '$lib/components/GroupSearch.svelte'
  import ContributionGraph from '$lib/components/ContributionGraph.svelte'
  import ActivityBarChart from '$lib/components/ActivityBarChart.svelte'
  import HourlyChart from '$lib/components/HourlyChart.svelte'
  import MonthlyChart from '$lib/components/MonthlyChart.svelte'
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

  // Scroll state — drives pending-item buffering
  let isNearTop = $state(true)

  // Infinite scroll sentinel
  let sentinel = $state<HTMLElement | undefined>(undefined)

  // Items that arrive while the user is scrolled down — held back to avoid grid disruption
  let pendingItems = $state<FeedItem[]>([])

  // Tab state
  let activeTab = $state<'feed' | 'stats'>('feed')

  const hasMore = $derived(feedOffset < feedTotal)

  // Derived stats from activity data — no extra endpoint needed
  const weekdayData = $derived.by(() => {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const counts = new Array(7).fill(0)
    for (const d of data.activity.days) {
      const dt = new Date(d.date + 'T12:00:00')
      counts[dt.getDay()] += d.count
    }
    const max = Math.max(...counts, 1)
    return names.map((name, i) => ({ name, count: counts[i], pct: counts[i] / max }))
  })

  const peakWeekday = $derived(
    weekdayData.reduce((a, b) => (b.count > a.count ? b : a), weekdayData[0]),
  )

  const peakHour = $derived.by(() => {
    const max = data.hourly.hours.reduce((a, b) => (b.count > a.count ? b : a), {
      hour: -1,
      count: 0,
    })
    if (max.count === 0) return null
    const h = max.hour
    if (h === 0) return '12am'
    if (h < 12) return `${h}am`
    if (h === 12) return '12pm'
    return `${h - 12}pm`
  })

  function formatDate(dateStr: string) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

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
    isNearTop = window.scrollY < 80

    // Auto-flush pending items once user scrolls back near the top
    if (isNearTop && pendingItems.length > 0) {
      flushPending()
    }
  }

  onMount(() => {
    // Establish initial scroll state immediately
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })

    // Infinite scroll: load more when sentinel enters the viewport
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore()
      },
      { rootMargin: '300px' },
    )
    if (sentinel) observer.observe(sentinel)

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
      observer.disconnect()
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

<!-- Floating pill: notifies user of new beers arriving while they browse (feed tab only) -->
{#if pendingItems.length > 0 && activeTab === 'feed'}
  <button class="new-beers-pill" onclick={flushPending}>
    ↑ {pendingItems.length}
    {pendingItems.length === 1 ? 'new beer' : 'new beers'}
  </button>
{/if}

<div class="page">
  <!-- Hero section — full progress card at top of page -->
  <div class="hero-wrap">
    <HeroCard count={liveCount} {sessionCount} {flashCount} />
  </div>

  <!-- Groups search -->
  <GroupSearch />

  <!-- Tab bar -->
  <div class="tab-bar" role="tablist" aria-label="Home page sections">
    <button
      class="tab-btn"
      class:tab-btn--active={activeTab === 'feed'}
      role="tab"
      aria-selected={activeTab === 'feed'}
      aria-controls="panel-feed"
      onclick={() => (activeTab = 'feed')}
    >
      <!-- Feed: 2×2 photo grid -->
      <svg
        class="tab-icon"
        viewBox="0 0 17 17"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.25" />
        <rect x="10" y="1.5" width="5.5" height="5.5" rx="1.25" />
        <rect x="1.5" y="10" width="5.5" height="5.5" rx="1.25" />
        <rect x="10" y="10" width="5.5" height="5.5" rx="1.25" />
      </svg>
      Feed
    </button>
    <button
      class="tab-btn"
      class:tab-btn--active={activeTab === 'stats'}
      role="tab"
      aria-selected={activeTab === 'stats'}
      aria-controls="panel-stats"
      onclick={() => (activeTab = 'stats')}
    >
      <!-- Stats: ascending bar chart -->
      <svg
        class="tab-icon"
        viewBox="0 0 17 17"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect x="1.5" y="10" width="3.5" height="5.5" rx="0.75" />
        <rect x="6.75" y="6" width="3.5" height="9.5" rx="0.75" />
        <rect x="12" y="2" width="3.5" height="13.5" rx="0.75" />
      </svg>
      Stats
    </button>
  </div>

  <!-- Tab panels -->
  <div class="panels-wrap">
    <!-- FEED TAB -->
    {#if activeTab === 'feed'}
      <div class="tab-panel" id="panel-feed" role="tabpanel">
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
            {#if hasMore}
              <div bind:this={sentinel} class="scroll-sentinel" aria-hidden="true"></div>
            {/if}
            {#if loadingMore}
              <p class="loading-msg">Loading…</p>
            {/if}
          </section>
        </div>
      </div>

      <!-- STATS TAB -->
    {:else}
      <div class="tab-panel" id="panel-stats" role="tabpanel">
        <div class="panel-content">
          <!-- Summary stat cards -->
          <div class="summary-cards">
            <div class="stat-card">
              <span class="stat-value">{data.stats.totalBeers.toLocaleString()}</span>
              <span class="stat-label">Total Beers</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{data.stats.activeMemberCount.toLocaleString()}</span>
              <span class="stat-label">Members</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{data.stats.activeGroupCount.toLocaleString()}</span>
              <span class="stat-label">Groups</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{data.stats.avgPerDay}</span>
              <span class="stat-label">Avg / Day</span>
            </div>
            {#if data.stats.peakDay}
              <div class="stat-card">
                <span class="stat-value">{data.stats.peakDay.count.toLocaleString()}</span>
                <span class="stat-label">Record Day</span>
                <span class="stat-sub">{formatDate(data.stats.peakDay.date)}</span>
              </div>
            {:else}
              <div class="stat-card">
                <span class="stat-value stat-value--dim">{data.stats.daysActive}</span>
                <span class="stat-label">Days Active</span>
              </div>
            {/if}
          </div>

          <!-- Contribution heatmap — 1 year -->
          <div class="chart-card">
            <h3 class="chart-title">Activity — Past Year</h3>
            {#if data.activity.days.length > 0}
              <ContributionGraph days={data.activity.days} />
              <div class="heatmap-legend">
                <span class="legend-label">Less</span>
                {#each ['#2e1e0a', '#5a3a08', '#8a5e18', '#bd6d09', '#f0a830'] as c}
                  <span class="legend-swatch" style="background:{c};"></span>
                {/each}
                <span class="legend-label">More</span>
              </div>
            {:else}
              <p class="empty-msg">No activity data yet.</p>
            {/if}
          </div>

          <!-- Last 30 days bar chart -->
          <div class="chart-card">
            <h3 class="chart-title">Daily Activity — Last 30 Days</h3>
            {#if browser && data.activity.days.length > 0}
              <ActivityBarChart days={data.activity.days} />
            {:else if data.activity.days.length === 0}
              <p class="empty-msg">No activity data yet.</p>
            {/if}
          </div>

          <!-- Hourly + Weekday — side-by-side on tablet+ -->
          <div class="charts-pair">
            <div class="chart-card">
              <h3 class="chart-title">
                When Does the World Drink?{peakHour ? ` · Peak: ${peakHour}` : ''}
              </h3>
              {#if browser && data.hourly.hours.some((h) => h.count > 0)}
                <HourlyChart hours={data.hourly.hours} />
              {:else}
                <p class="empty-msg">No data yet.</p>
              {/if}
            </div>

            <div class="chart-card">
              <h3 class="chart-title">
                Busiest Days of the Week{peakWeekday && peakWeekday.count > 0
                  ? ` · ${peakWeekday.name}`
                  : ''}
              </h3>
              {#if weekdayData.some((d) => d.count > 0)}
                <div class="weekday-bars">
                  {#each weekdayData as day}
                    <div class="weekday-row">
                      <span class="weekday-label">{day.name}</span>
                      <div class="weekday-track">
                        <div
                          class="weekday-fill"
                          class:weekday-fill--peak={day === peakWeekday && day.count > 0}
                          style="width:{day.pct * 100}%"
                        ></div>
                      </div>
                      <span class="weekday-count">{day.count.toLocaleString()}</span>
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="empty-msg">No data yet.</p>
              {/if}
            </div>
          </div>

          <!-- Monthly trend line chart -->
          <div class="chart-card">
            <h3 class="chart-title">Monthly Trend</h3>
            {#if browser && data.monthly.months.length > 0}
              <MonthlyChart months={data.monthly.months} />
            {:else if data.monthly.months.length === 0}
              <p class="empty-msg">Not enough data yet.</p>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1.25rem 1rem 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .hero-wrap {
    width: 100%;
  }

  /* ── Tab bar ────────────────────────────────────── */
  .tab-bar {
    position: sticky;
    top: 0;
    z-index: 50;
    display: grid;
    grid-template-columns: 1fr 1fr;
    background: var(--color-bg-card);
    border-bottom: 1px solid var(--color-border);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
    /* Extend to full viewport width */
    margin-left: -1rem;
    margin-right: -1rem;
  }

  .tab-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    padding: 0.8rem 0.5rem;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--color-text-muted);
    font-family: var(--font-body);
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition:
      color 150ms ease,
      border-color 150ms ease,
      background 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .tab-btn:hover {
    color: var(--color-beer-foam);
    background: rgba(255, 255, 255, 0.03);
  }

  .tab-btn--active {
    color: var(--color-beer-amber);
    border-bottom-color: var(--color-beer-amber);
  }

  .tab-icon {
    width: 17px;
    height: 17px;
    flex-shrink: 0;
  }

  /* ── Tab panels ─────────────────────────────────── */
  .panels-wrap {
    min-height: 60vh;
  }

  .tab-panel {
    animation: panel-in 180ms ease both;
  }

  @keyframes panel-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* ── Feed panel ─────────────────────────────────── */
  .content-grid {
    padding: 1.25rem 0 4rem;
  }

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

  /* ── Stats panel ────────────────────────────────── */
  .panel-content {
    max-width: 900px;
    margin: 0 auto;
    padding: 1.25rem 0 4rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  /* ── Summary cards ──────────────────────────────── */
  .summary-cards {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
  }

  @media (min-width: 640px) {
    .summary-cards {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @media (min-width: 900px) {
    .summary-cards {
      grid-template-columns: repeat(5, 1fr);
    }
  }

  .stat-card {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 0.75rem;
    padding: 1rem 0.75rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    text-align: center;
  }

  .stat-value {
    font-family: var(--font-display);
    font-size: clamp(1.2rem, 3vw, 1.6rem);
    font-weight: 700;
    color: var(--color-beer-amber);
    line-height: 1;
  }

  .stat-value--dim {
    color: var(--color-text-muted);
  }

  .stat-label {
    font-size: 0.52rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .stat-sub {
    font-size: 0.65rem;
    color: var(--color-text-muted);
    margin-top: 0.1rem;
  }

  /* ── Shared chart card ──────────────────────────── */
  .chart-card {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 0.75rem;
    padding: 1.1rem 1rem 1rem;
  }

  .chart-title {
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    margin-bottom: 0.85rem;
  }

  /* ── Heatmap legend ─────────────────────────────── */
  .heatmap-legend {
    display: flex;
    align-items: center;
    gap: 3px;
    margin-top: 0.6rem;
    justify-content: flex-end;
  }

  .legend-label {
    color: var(--color-text-muted);
    font-size: 0.65rem;
    margin: 0 2px;
  }

  .legend-swatch {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }

  /* ── Charts pair (stacked → 2-col at 768px) ─────── */
  .charts-pair {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  @media (min-width: 768px) {
    .charts-pair {
      flex-direction: row;
    }

    .charts-pair .chart-card {
      flex: 1;
      min-width: 0;
    }
  }

  /* ── Weekday bars ───────────────────────────────── */
  .weekday-bars {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    margin-top: 0.25rem;
  }

  .weekday-row {
    display: grid;
    grid-template-columns: 30px 1fr 48px;
    align-items: center;
    gap: 0.5rem;
  }

  .weekday-label {
    font-size: 0.72rem;
    color: var(--color-text-muted);
    font-weight: 500;
  }

  .weekday-track {
    background: var(--color-bg-surface);
    border-radius: 4px;
    height: 8px;
    overflow: hidden;
  }

  .weekday-fill {
    height: 100%;
    background: var(--color-beer-dark);
    border-radius: 4px;
    transition: width 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .weekday-fill--peak {
    background: var(--color-beer-amber);
    box-shadow: 0 0 8px rgba(189, 109, 9, 0.6);
  }

  .weekday-count {
    font-size: 0.72rem;
    color: var(--color-text-muted);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* ── Empty / fallback ───────────────────────────── */
  .empty-msg {
    color: var(--color-text-muted);
    font-size: 0.85rem;
    padding: 1.5rem 0 0.5rem;
    text-align: center;
  }

  /* ── New beers pill ─────────────────────────────── */
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

  /* ── Infinite scroll ────────────────────────────── */
  .scroll-sentinel {
    height: 1px;
  }

  .loading-msg {
    text-align: center;
    color: var(--color-text-muted);
    font-size: 0.85rem;
    padding: 1.5rem 0;
  }

  /* ── Desktop ────────────────────────────────────── */
  @media (min-width: 1024px) {
    .panel-content {
      padding: 1.75rem 0 5rem;
      gap: 1.5rem;
    }
  }
</style>
