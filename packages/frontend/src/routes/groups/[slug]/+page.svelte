<script lang="ts">
  import { browser } from '$app/environment'
  import { onMount, untrack } from 'svelte'
  import type { PageData } from './$types'
  import type { FeedItem } from '@omb/shared'
  import FeedGrid from '$lib/components/FeedGrid.svelte'
  import LeaderboardTable from '$lib/components/LeaderboardTable.svelte'
  import ProgressBar from '$lib/components/ProgressBar.svelte'
  import BeerLightbox from '$lib/components/BeerLightbox.svelte'
  import ContributionGraph from '$lib/components/ContributionGraph.svelte'
  import ActivityBarChart from '$lib/components/ActivityBarChart.svelte'
  import HourlyChart from '$lib/components/HourlyChart.svelte'
  import MonthlyChart from '$lib/components/MonthlyChart.svelte'
  import GroupSearch from '$lib/components/GroupSearch.svelte'
  import WeekdayBars from '$lib/components/WeekdayBars.svelte'
  import { formatDate, getInitials, getWeekdayBreakdown, getPeakHour } from '$lib/utils'

  let { data }: { data: PageData } = $props()

  // Initialised from SSR data; $effect below resets when the slug changes (search navigation)
  let feedItems = $state<FeedItem[]>(untrack(() => data.feed.items))
  let feedOffset = $state(untrack(() => data.feed.items.length))
  let feedTotal = $state(untrack(() => data.feed.total))

  $effect(() => {
    // Track the slug so this runs on group-to-group navigation
    const _ = data.profile.slug
    untrack(() => {
      feedItems = data.feed.items
      feedOffset = data.feed.items.length
      feedTotal = data.feed.total
    })
  })
  let loadingMore = $state(false)
  let lightboxItem = $state<FeedItem | null>(null)
  let sentinel = $state<HTMLElement | undefined>(undefined)

  const hasMore = $derived(feedOffset < feedTotal)

  $effect(() => {
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore()
      },
      { rootMargin: '300px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  })

  async function loadMore() {
    if (loadingMore || !hasMore) return
    loadingMore = true
    try {
      const res = await fetch(
        `/api/v1/groups/${data.profile.slug}/feed?limit=20&offset=${feedOffset}`,
      )
      if (res.ok) {
        const json = (await res.json()) as { items: FeedItem[]; total: number }
        feedItems = [...feedItems, ...json.items]
        feedOffset += json.items.length
        feedTotal = json.total
      }
    } finally {
      loadingMore = false
    }
  }

  const peakHour = $derived(getPeakHour(data.hourly.hours))
  const weekdayData = $derived(getWeekdayBreakdown(data.activity.days))
  const peakWeekday = $derived(
    weekdayData.reduce((a, b) => (b.count > a.count ? b : a), weekdayData[0]),
  )

  let activeTab = $state<'feed' | 'stats' | 'leaderboard'>('feed')
  let searchOpen = $state(false)

  const initials = $derived(getInitials(data.profile.name))
</script>

<svelte:head>
  <title>{data.profile.name} — OneMillionBeers</title>
  <meta
    name="description"
    content="{data.profile.name} has logged {data.profile.totalBeers} beers on OneMillionBeers."
  />
</svelte:head>

<BeerLightbox
  item={lightboxItem}
  onclose={() => {
    lightboxItem = null
  }}
/>

<!-- ── Search overlay ─────────────────────────────────────────────────── -->
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

<!-- ── Hero ──────────────────────────────────────────────────────────── -->
<section class="hero">
  <!-- Hero controls: back (top-left) + search (top-right) -->
  <div class="hero-controls">
    <a href="/" class="hero-btn" aria-label="Go to home">
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z" />
        <path d="M9 21V12h6v9" />
      </svg>
    </a>
    <button class="hero-btn" aria-label="Search groups" onclick={() => (searchOpen = true)}>
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M15.5 15.5L20 20" />
      </svg>
    </button>
  </div>

  <!-- Atmospheric glow behind avatar -->
  <div class="hero-glow" aria-hidden="true"></div>

  <div class="hero-body">
    <!-- Desktop: avatar left, text right -->
    <div class="hero-layout">
      <!-- Avatar -->
      <div class="hero-avatar-wrap">
        <div class="avatar-ring">
          <div class="avatar-inner">
            {#if data.profile.avatarUrl}
              <img
                src={data.profile.avatarUrl}
                alt="{data.profile.name} profile picture"
                class="avatar-img"
              />
            {:else}
              <span class="avatar-initials">{initials}</span>
            {/if}
          </div>
        </div>
      </div>

      <!-- Name + progress stacked -->
      <div class="hero-text">
        <p class="hero-eyebrow">Group</p>
        <h1 class="hero-name glow-amber">{data.profile.name}</h1>
        <div class="hero-progress">
          <ProgressBar count={data.profile.totalBeers} />
        </div>
      </div>
    </div>

    <!-- Stats bar — always full width below the layout -->
    <div class="hero-stats">
      <div class="hstat">
        <span class="hstat-value">{data.profile.totalBeers.toLocaleString()}</span>
        <span class="hstat-label">Beers</span>
      </div>
      <div class="hstat-sep" aria-hidden="true"></div>
      <div class="hstat">
        <span class="hstat-value">{data.stats.activeMemberCount.toLocaleString()}</span>
        <span class="hstat-label">Contributors</span>
      </div>
      <div class="hstat-sep" aria-hidden="true"></div>
      <div class="hstat">
        <span class="hstat-value">{data.stats.avgPerDay}</span>
        <span class="hstat-label">Avg / day</span>
      </div>
      <div class="hstat-sep" aria-hidden="true"></div>
      {#if data.stats.peakDay}
        <div class="hstat">
          <span class="hstat-value">{data.stats.peakDay.count}</span>
          <span class="hstat-label">Record</span>
        </div>
      {:else}
        <div class="hstat">
          <span class="hstat-value hstat-value--dim">{data.stats.daysActive}</span>
          <span class="hstat-label">Days active</span>
        </div>
      {/if}
    </div>
  </div>
</section>

<!-- ── Sticky tab bar ─────────────────────────────────────────────────── -->
<div class="tab-bar" role="tablist" aria-label="Group page sections">
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
    class:tab-btn--active={activeTab === 'leaderboard'}
    role="tab"
    aria-selected={activeTab === 'leaderboard'}
    aria-controls="panel-leaderboard"
    onclick={() => (activeTab = 'leaderboard')}
  >
    <!-- Leaderboard: trophy cup -->
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
      <path d="M4 2h9v4.5a4.5 4.5 0 01-9 0V2z" />
      <path d="M4 4.5H2.5a1 1 0 000 2H4" />
      <path d="M13 4.5h1.5a1 1 0 010 2H13" />
      <line x1="8.5" y1="11" x2="8.5" y2="13" />
      <line x1="6" y1="13" x2="11" y2="13" />
      <rect x="5.5" y="13" width="6" height="1.75" rx="0.75" />
    </svg>
    Leaderboard
  </button>
</div>

<!-- ── Tab panels ─────────────────────────────────────────────────────── -->
<div class="panels-wrap">
  <!-- FEED TAB -->
  {#if activeTab === 'feed'}
    <div class="tab-panel" id="panel-feed" role="tabpanel">
      <div class="feed-content">
        <FeedGrid
          items={feedItems}
          loading={loadingMore && feedItems.length === 0}
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
      </div>
    </div>

    <!-- STATS TAB -->
  {:else if activeTab === 'stats'}
    <div class="tab-panel" id="panel-stats" role="tabpanel">
      <div class="panel-content">
        <!-- Contribution heatmap -->
        <div class="chart-card">
          <h3 class="chart-title">Activity — Past 6 Months</h3>
          {#if data.activity.days.length > 0}
            <ContributionGraph days={data.activity.days} />
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

        <!-- Last 30 days -->
        <div class="chart-card">
          <h3 class="chart-title">Daily Activity — Last 30 Days</h3>
          {#if browser && data.activity.days.length > 0}
            <ActivityBarChart days={data.activity.days} />
          {:else if data.activity.days.length === 0}
            <p class="empty-msg">No activity data yet.</p>
          {/if}
        </div>

        <!-- Hour of day + Weekday — side-by-side on tablet -->
        <div class="charts-pair">
          <div class="chart-card">
            <h3 class="chart-title">When Does This Group Drink?</h3>
            {#if browser && data.hourly.hours.some((h) => h.count > 0)}
              <HourlyChart hours={data.hourly.hours} />
            {:else}
              <p class="empty-msg">No data yet.</p>
            {/if}
          </div>

          <div class="chart-card">
            <h3 class="chart-title">Busiest Days of the Week</h3>
            {#if weekdayData.some((d) => d.count > 0)}
              <WeekdayBars days={weekdayData} peakDay={peakWeekday} />
            {:else}
              <p class="empty-msg">No data yet.</p>
            {/if}
          </div>
        </div>

        <!-- Monthly trend -->
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

    <!-- LEADERBOARD TAB -->
  {:else}
    <div class="tab-panel" id="panel-leaderboard" role="tabpanel">
      <div class="panel-content">
        <LeaderboardTable entries={data.leaderboard.entries} title="Group Leaders" />
      </div>
    </div>
  {/if}
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

  /* ── Hero controls ───────────────────────────────── */
  .hero-controls {
    position: absolute;
    top: 0.875rem;
    left: 1rem;
    right: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 10;
  }

  .hero-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    background: rgba(30, 20, 8, 0.8);
    border: 1px solid rgba(245, 158, 11, 0.2);
    color: var(--color-text-muted);
    cursor: pointer;
    text-decoration: none;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    transition:
      background 150ms ease,
      color 150ms ease;
  }

  .hero-btn:hover {
    background: rgba(245, 158, 11, 0.15);
    color: var(--color-beer-dark);
  }

  /* ── Hero ───────────────────────────────────────── */
  .hero {
    position: relative;
    overflow: hidden;
    background: linear-gradient(165deg, #0d0803 0%, #1e1005 45%, #2d1a08 80%, #3d2510 100%);
    border-bottom: 1px solid #5c3d1a;
    padding: 2.5rem 1.25rem 0;
    box-shadow: 0 4px 32px rgba(0, 0, 0, 0.5);
  }

  /* Radial amber bloom behind the avatar */
  .hero-glow {
    position: absolute;
    top: -80px;
    left: 50%;
    transform: translateX(-50%);
    width: 420px;
    height: 420px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(245, 158, 11, 0.18) 0%, transparent 65%);
    pointer-events: none;
  }

  .hero-body {
    position: relative; /* above glow */
    max-width: 860px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.75rem;
  }

  /* ── Layout: mobile = stacked centre, desktop = side-by-side ── */
  .hero-layout {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
    width: 100%;
    text-align: center;
  }

  /* ── Avatar ──────────────────────────────────────── */
  .hero-avatar-wrap {
    flex-shrink: 0;
  }

  .avatar-ring {
    width: 100px;
    height: 100px;
    border-radius: 50%;
    padding: 3px;
    /* conic gradient gives a brushed-gold ring effect */
    background: conic-gradient(
      from 0deg,
      var(--color-beer-amber) 0%,
      var(--color-beer-dark) 35%,
      var(--color-accent-glow) 50%,
      var(--color-beer-dark) 65%,
      var(--color-beer-amber) 100%
    );
    box-shadow:
      0 0 0 1px rgba(189, 109, 9, 0.3),
      0 0 28px rgba(189, 109, 9, 0.35),
      0 0 60px rgba(189, 109, 9, 0.12);
  }

  .avatar-inner {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 35%, #2d1a08, #1a0f05);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .avatar-initials {
    font-family: var(--font-display);
    font-size: 2rem;
    font-weight: 800;
    color: var(--color-beer-head);
    letter-spacing: 0.04em;
    line-height: 1;
    text-shadow: 0 0 16px rgba(245, 158, 11, 0.5);
  }

  .avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  }

  /* ── Group name + progress ───────────────────────── */
  .hero-text {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.85rem;
    width: 100%;
  }

  .hero-eyebrow {
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--color-beer-amber);
    opacity: 0.7;
    margin: 0;
  }

  .hero-name {
    font-family: var(--font-display);
    font-size: clamp(2rem, 7vw, 3.5rem);
    color: var(--color-beer-head);
    letter-spacing: 0.03em;
    line-height: 1.05;
    margin: 0;
  }

  .hero-progress {
    width: 100%;
    max-width: 440px;
  }

  /* ── Integrated stats bar ────────────────────────── */
  .hero-stats {
    display: flex;
    align-items: stretch;
    width: 100%;
    max-width: 540px;
    background: rgba(26, 18, 9, 0.75);
    border: 1px solid var(--color-border);
    border-bottom: none; /* merges flush into the tab bar below */
    border-radius: 0.85rem 0.85rem 0 0;
    padding: 1rem 0.5rem;
    backdrop-filter: blur(8px);
  }

  .hstat {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    padding: 0 0.25rem;
    min-width: 0;
  }

  .hstat-value {
    font-family: var(--font-display);
    font-size: clamp(1.15rem, 3.8vw, 1.5rem);
    font-weight: 700;
    color: var(--color-beer-amber);
    line-height: 1;
    white-space: nowrap;
  }

  .hstat-value--dim {
    color: var(--color-text-muted);
  }

  .hstat-label {
    font-size: 0.52rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .hstat-sep {
    width: 1px;
    background: var(--color-border);
    margin: 0.1rem 0;
    flex-shrink: 0;
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

  .panel-content {
    max-width: 900px;
    margin: 0 auto;
    padding: 1.25rem 1rem 4rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
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

  /* ── Feed tab — matches home page layout ────────── */
  .feed-content {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1.25rem 1rem 4rem;
  }

  .scroll-sentinel {
    height: 1px;
  }

  .loading-msg {
    text-align: center;
    color: var(--color-text-muted);
    font-size: 0.85rem;
    padding: 1.5rem 0;
  }

  /* ── Empty / fallback ───────────────────────────── */
  .empty-msg {
    color: var(--color-text-muted);
    font-size: 0.85rem;
    padding: 1.5rem 0 0.5rem;
    text-align: center;
  }

  /* ── Tablet+: avatar left, text right ───────────── */
  @media (min-width: 640px) {
    .hero {
      padding: 3rem 2rem 0;
    }

    .hero-layout {
      flex-direction: row;
      align-items: flex-end;
      text-align: left;
      gap: 2rem;
    }

    .hero-text {
      align-items: flex-start;
    }

    .avatar-ring {
      width: 120px;
      height: 120px;
    }

    .avatar-initials {
      font-size: 2.4rem;
    }

    .hero-stats {
      max-width: 100%;
      border-radius: 0.85rem 0.85rem 0 0;
    }
  }

  /* ── Desktop ─────────────────────────────────────── */
  @media (min-width: 1024px) {
    .panel-content {
      padding: 1.75rem 1.5rem 5rem;
      gap: 1.5rem;
    }

    .avatar-ring {
      width: 136px;
      height: 136px;
    }

    .avatar-initials {
      font-size: 2.75rem;
    }
  }
</style>
