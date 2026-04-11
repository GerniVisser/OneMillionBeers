<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { browser } from '$app/environment'
  import type { PageData } from './$types'
  import type { FeedItem } from '@omb/shared'
  import { getLastSseEvent, getResyncCount } from '$lib/sse.svelte'
  import {
    getGlobalCount,
    getGlobalFeed,
    getGlobalStats,
    getGlobalActivity,
    getGlobalHourly,
    getGlobalMonthly,
    getGlobalCountries,
  } from '$lib/api'
  import { transformSseToFeedItem } from '$lib/utils'
  import HeroCard from '$lib/components/HeroCard.svelte'
  import FeedGrid from '$lib/components/FeedGrid.svelte'
  import BeerFlash from '$lib/components/BeerFlash.svelte'
  import StatsStrip from '$lib/components/StatsStrip.svelte'
  import BeerLightbox from '$lib/components/BeerLightbox.svelte'
  import GroupSearch from '$lib/components/GroupSearch.svelte'
  import ContributionGraph from '$lib/components/ContributionGraph.svelte'
  import ActivityBarChart from '$lib/components/ActivityBarChart.svelte'
  import HourlyChart from '$lib/components/HourlyChart.svelte'
  import MonthlyChart from '$lib/components/MonthlyChart.svelte'
  import WeekdayBars from '$lib/components/WeekdayBars.svelte'
  import WorldMap from '$lib/components/WorldMap.svelte'
  import CountryFlag from '$lib/components/CountryFlag.svelte'
  import { getWeekdayBreakdown, getPeakHour } from '$lib/utils'

  let { data }: { data: PageData } = $props()

  // untrack: intentional one-time capture of SSR data; state is then managed independently (SSE + load-more)
  let liveCount = $state(untrack(() => data.count))
  let feedItems = $state<FeedItem[]>(untrack(() => data.feed.items))
  let feedOffset = $state(untrack(() => data.feed.items.length))
  let feedTotal = $state(untrack(() => data.feed.total))
  let stats = $state(untrack(() => data.stats))
  let activity = $state(untrack(() => data.activity))
  let hourly = $state(untrack(() => data.hourly))
  let monthly = $state(untrack(() => data.monthly))
  let countries = $state(untrack(() => data.countries))
  let loadingMore = $state(false)
  // Tracks beers logged since page load via SSE (proxy for "today" until API provides it)
  let sessionCount = $state(0)

  // New effect triggers
  let flashCount = $state(0)
  let lightboxItem = $state<FeedItem | null>(null)
  let newestId = $state('')

  // Scroll state — drives pending-item buffering
  let isNearTop = $state(true)

  // Infinite scroll sentinel
  let sentinel = $state<HTMLElement | undefined>(undefined)

  // Items that arrive while the user is scrolled down — held back to avoid grid disruption
  let pendingItems = $state<FeedItem[]>([])

  // Tab state
  let activeTab = $state<'feed' | 'stats' | 'map'>('feed')
  let searchOpen = $state(false)

  const hasMore = $derived(feedOffset < feedTotal)

  // Stat cards for the infinite carousel
  type StatItem = { value: string; label: string; dim?: boolean }
  const statItems = $derived(
    (() => {
      const items: StatItem[] = [
        { value: stats.totalBeers.toLocaleString(), label: 'Total Beers' },
        { value: stats.activeMemberCount.toLocaleString(), label: 'Contributors' },
        { value: stats.activeGroupCount.toLocaleString(), label: 'Groups' },
        { value: String(stats.avgPerDay), label: 'Avg / Day' },
      ]
      if (stats.peakDay) {
        items.push({
          value: stats.peakDay.count.toLocaleString(),
          label: 'Record Day',
        })
      } else {
        items.push({ value: String(stats.daysActive), label: 'Days Active', dim: true })
      }
      return items
    })(),
  )

  // Derived stats from activity data — no extra endpoint needed
  const weekdayData = $derived(getWeekdayBreakdown(activity.days))
  const peakWeekday = $derived(
    weekdayData.reduce((a, b) => (b.count > a.count ? b : a), weekdayData[0]),
  )
  const peakHour = $derived(getPeakHour(hourly.hours))

  const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

  let refetchTimer: ReturnType<typeof setTimeout> | null = null

  $effect(() => {
    const event = getLastSseEvent()
    if (!event) return

    // untrack: only lastEvent should be a reactive dependency.
    // Reads of feedItems, pendingItems, isNearTop etc. inside here must not
    // re-trigger this effect, or every scroll/state change reruns it with the
    // same event, causing sessionCount/flashCount to increment on every scroll.
    untrack(() => {
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
            feedItems = [item, ...feedItems]
            feedOffset += 1
            newestId = item.id
            setTimeout(() => {
              if (newestId === item.id) newestId = ''
            }, 2000)
          } else {
            pendingItems = [item, ...pendingItems]
          }
        }
      }

      // Debounced aggregate refetch
      if (refetchTimer) clearTimeout(refetchTimer)
      refetchTimer = setTimeout(async () => {
        const [newStats, newActivity, newHourly, newMonthly, newCountries] = await Promise.all([
          getGlobalStats(fetch),
          getGlobalActivity(fetch),
          getGlobalHourly(fetch),
          getGlobalMonthly(fetch),
          getGlobalCountries(fetch),
        ])
        stats = newStats
        activity = newActivity
        hourly = newHourly
        monthly = newMonthly
        countries = newCountries
      }, 1500)
    })
  })

  $effect(() => {
    // Re-run whenever a stale-background resync is triggered.
    // Reads getResyncCount() as the sole dependency; everything else is untracked.
    getResyncCount()
    untrack(async () => {
      const [countData, feedData, newStats, newActivity, newHourly, newMonthly, newCountries] =
        await Promise.all([
          getGlobalCount(fetch),
          getGlobalFeed(fetch, { limit: 20, offset: 0 }),
          getGlobalStats(fetch),
          getGlobalActivity(fetch),
          getGlobalHourly(fetch),
          getGlobalMonthly(fetch),
          getGlobalCountries(fetch),
        ])
      liveCount = countData.count
      feedItems = feedData.items
      feedOffset = feedData.items.length
      feedTotal = feedData.total
      pendingItems = []
      stats = newStats
      activity = newActivity
      hourly = newHourly
      monthly = newMonthly
      countries = newCountries
    })
  })

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

    return () => {
      window.removeEventListener('scroll', handleScroll)
      observer.disconnect()
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
<BeerLightbox
  item={lightboxItem}
  onclose={() => {
    lightboxItem = null
  }}
/>

{#if searchOpen}
  <div class="search-overlay" role="dialog" aria-label="Search groups">
    <GroupSearch autofocus />
    <button class="search-close-btn" aria-label="Close search" onclick={() => (searchOpen = false)}>
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  </div>
{/if}

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
    <HeroCard
      count={liveCount}
      {sessionCount}
      {flashCount}
      onsearchclick={() => (searchOpen = true)}
    />
  </div>

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
    <button
      class="tab-btn"
      class:tab-btn--active={activeTab === 'map'}
      role="tab"
      aria-selected={activeTab === 'map'}
      aria-controls="panel-map"
      onclick={() => (activeTab = 'map')}
    >
      <!-- Globe icon -->
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
        <circle cx="8.5" cy="8.5" r="6.5" />
        <ellipse cx="8.5" cy="8.5" rx="2.5" ry="6.5" />
        <line x1="2" y1="8.5" x2="15" y2="8.5" />
      </svg>
      Map
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
    {:else if activeTab === 'stats'}
      <div class="tab-panel" id="panel-stats" role="tabpanel">
        <div class="panel-content">
          <!-- Summary stat cards — infinite scrolling carousel -->
          <div class="stats-carousel">
            <div class="stats-track">
              {#each [...statItems, ...statItems] as item, i (i)}
                <div class="stat-card" aria-hidden={i >= statItems.length ? true : undefined}>
                  <span class="stat-value" class:stat-value--dim={item.dim}>{item.value}</span>
                  <span class="stat-label">{item.label}</span>
                </div>
              {/each}
            </div>
          </div>

          <!-- Contribution heatmap — 1 year -->
          <div class="chart-card">
            <h3 class="chart-title">Activity — Past Year</h3>
            {#if activity.days.length > 0}
              <ContributionGraph days={activity.days} />
              <div class="heatmap-legend">
                <span class="legend-label">Less</span>
                {#each ['#2a1e0e', '#5c3d1a', '#d97706', '#f59e0b', '#fbbf24'] as c}
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
            {#if browser && activity.days.length > 0}
              <ActivityBarChart days={activity.days} />
            {:else if activity.days.length === 0}
              <p class="empty-msg">No activity data yet.</p>
            {/if}
          </div>

          <!-- Hourly + Weekday — side-by-side on tablet+ -->
          <div class="charts-pair">
            <div class="chart-card">
              <h3 class="chart-title">
                When Does the World Drink?{peakHour ? ` · Peak: ${peakHour}` : ''}
              </h3>
              {#if browser && hourly.hours.some((h) => h.count > 0)}
                <HourlyChart hours={hourly.hours} />
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
                <WeekdayBars days={weekdayData} peakDay={peakWeekday} />
              {:else}
                <p class="empty-msg">No data yet.</p>
              {/if}
            </div>
          </div>

          <!-- Monthly trend line chart -->
          <div class="chart-card">
            <h3 class="chart-title">Monthly Trend</h3>
            {#if browser && monthly.months.length > 0}
              <MonthlyChart months={monthly.months} />
            {:else if monthly.months.length === 0}
              <p class="empty-msg">Not enough data yet.</p>
            {/if}
          </div>
        </div>
      </div>

      <!-- MAP TAB -->
    {:else if activeTab === 'map'}
      <div class="tab-panel" id="panel-map" role="tabpanel">
        <div class="map-layout">
          <div class="map-card">
            <WorldMap {countries} />
          </div>

          {#if countries.length > 0}
            <div class="country-leaderboard">
              <h3 class="country-lb-title">Countries</h3>
              <ol class="country-lb-list">
                {#each countries as country, i}
                  {@const name = regionNames.of(country.countryCode) ?? country.countryCode}
                  <li class="country-lb-row">
                    <span class="country-lb-rank">{i + 1}</span>
                    <CountryFlag countryCode={country.countryCode} size={16} />
                    <span class="country-lb-name">{name}</span>
                    <span class="country-lb-count">{country.beerCount.toLocaleString()}</span>
                  </li>
                {/each}
              </ol>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  /* ── Search overlay ─────────────────────────────── */
  .search-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background-color: rgba(18, 12, 5, 0.97);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--color-border);
    animation: slide-down 180ms ease both;
  }

  @keyframes slide-down {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .search-close-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--color-cream-faint);
    cursor: pointer;
    padding: 0.25rem;
    transition: color 120ms ease;
  }

  .search-close-btn:hover {
    color: var(--color-beer-amber);
  }

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
    grid-template-columns: 1fr 1fr 1fr;
    background: rgba(18, 12, 5, 0.97);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--color-border);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.6);
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
    color: var(--color-beer-dark);
    background: rgba(245, 158, 11, 0.04);
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

  /* ── Map panel ──────────────────────────────────── */
  .map-layout {
    padding: 0.5rem 0 4rem;
    /* Pull the map flush with the page edges on mobile */
    margin-left: -1rem;
    margin-right: -1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .map-card {
    border-radius: 0;
    border-left: none;
    border-right: none;
    border: 1px solid var(--color-border);
    overflow: hidden;
  }

  /* Country leaderboard */
  .country-leaderboard {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 0.75rem;
    padding: 0.875rem 1rem 0;
    margin: 0 1rem;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .country-lb-title {
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    margin-bottom: 0.6rem;
    flex-shrink: 0;
  }

  .country-lb-list {
    list-style: none;
    padding: 0;
    margin: 0;
    overflow-y: auto;
    /* On mobile let the list grow naturally */
    padding-bottom: 0.5rem;
  }

  .country-lb-row {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.45rem 0;
    border-bottom: 1px solid var(--color-border);
  }

  .country-lb-row:last-child {
    border-bottom: none;
  }

  .country-lb-rank {
    width: 1.4rem;
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--color-text-muted);
    text-align: right;
    flex-shrink: 0;
  }

  .country-lb-name {
    flex: 1;
    font-size: 0.82rem;
    color: var(--color-beer-foam);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .country-lb-count {
    font-family: var(--font-display);
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--color-beer-amber);
    flex-shrink: 0;
  }

  /* Landscape: map left, leaderboard right — both same height */
  @media (min-width: 768px) {
    .map-layout {
      flex-direction: row;
      align-items: flex-start;
      padding: 1.25rem 0 4rem;
      margin-left: 0;
      margin-right: 0;
    }

    .map-card {
      flex: 1;
      min-width: 0;
      align-self: flex-start;
      border-radius: 0.75rem;
      border: 1px solid var(--color-border);
    }

    .country-leaderboard {
      width: 220px;
      flex-shrink: 0;
      margin: 0;
      /* Match the map's natural height: (available width - leaderboard - gap) × 500/960 */
      max-height: calc((min(100vw, 1200px) - 2rem - 220px - 1rem) * 500 / 960);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .country-lb-list {
      flex: 1;
      overflow-y: auto;
      padding-bottom: 0.5rem;
    }
  }

  /* ── Stats carousel ─────────────────────────────── */
  .stats-carousel {
    overflow: hidden;
    width: 100%;
    mask-image: linear-gradient(to right, transparent, black 8%, black 92%, transparent);
    -webkit-mask-image: linear-gradient(to right, transparent, black 8%, black 92%, transparent);
  }

  .stats-track {
    display: flex;
    gap: 0.5rem;
    width: max-content;
    animation: scroll-carousel 16s linear infinite;
  }

  .stats-track:hover {
    animation-play-state: paused;
  }

  @keyframes scroll-carousel {
    0% {
      transform: translateX(0);
    }
    100% {
      transform: translateX(-50%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .stats-track {
      animation: none;
    }
  }

  .stat-card {
    flex-shrink: 0;
    width: 96px;
    background: linear-gradient(160deg, #201508 0%, #150e05 100%);
    border: 1px solid rgba(245, 158, 11, 0.2);
    border-radius: 0.875rem;
    padding: 0.65rem 0.5rem 0.6rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    text-align: center;
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.4),
      inset 0 1px 0 rgba(245, 158, 11, 0.07);
    transition:
      border-color 200ms ease,
      box-shadow 200ms ease;
  }

  .stat-card:hover {
    border-color: rgba(245, 158, 11, 0.45);
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.4),
      0 0 18px rgba(245, 158, 11, 0.14),
      inset 0 1px 0 rgba(245, 158, 11, 0.1);
  }

  .stat-value {
    font-family: var(--font-display);
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--color-beer-amber);
    line-height: 1;
  }

  .stat-value--dim {
    color: var(--color-text-muted);
  }

  .stat-label {
    font-size: 0.48rem;
    font-weight: 700;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  /* ── Shared chart card ──────────────────────────── */
  .chart-card {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 0.75rem;
    padding: 1.1rem 1rem 1rem;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
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
    background: var(--color-beer-amber);
    border: 1px solid var(--color-beer-dark);
    color: #ffffff;
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
    background: var(--color-beer-dark);
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
