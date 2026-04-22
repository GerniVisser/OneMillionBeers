<script lang="ts">
  import { browser } from '$app/environment'
  import { onMount, untrack } from 'svelte'
  import type { PageData } from './$types'
  import type {
    FeedItem,
    GroupActivityResponse,
    GroupHourlyResponse,
    GroupMonthlyResponse,
  } from '@omb/shared'
  import FeedGrid from '$lib/components/FeedGrid.svelte'
  import LeaderboardTable from '$lib/components/LeaderboardTable.svelte'
  import ProgressBar from '$lib/components/ProgressBar.svelte'
  import BeerLightbox from '$lib/components/BeerLightbox.svelte'
  import JoinModal from '$lib/components/JoinModal.svelte'
  import ContributionGraph from '$lib/components/ContributionGraph.svelte'
  import ActivityBarChart from '$lib/components/ActivityBarChart.svelte'
  import HourlyChart from '$lib/components/HourlyChart.svelte'
  import MonthlyChart from '$lib/components/MonthlyChart.svelte'
  import WeekdayBars from '$lib/components/WeekdayBars.svelte'
  import {
    formatDate,
    getInitials,
    getThisWeekBreakdown,
    getPeakHour,
    transformSseToFeedItem,
  } from '$lib/utils'
  import { getLastSseEvent, getResyncCount } from '$lib/sse.svelte'
  import {
    getGroupFeed,
    getGroupStats,
    getGroupLeaderboard,
    getGroupActivity,
    getGroupHourly,
    getGroupMonthly,
    getGroupInviteCode,
  } from '$lib/api'
  import { addRecentGroup } from '$lib/recents'

  let { data }: { data: PageData } = $props()

  onMount(() =>
    addRecentGroup({
      slug: data.profile.slug,
      name: data.profile.name,
      avatarUrl: data.profile.avatarUrl ?? null,
    }),
  )

  // Initialised from SSR data; $effect below resets when the slug changes (search navigation)
  let feedItems = $state<FeedItem[]>(untrack(() => data.feed.items))
  let feedOffset = $state(untrack(() => data.feed.items.length))
  let feedTotal = $state(untrack(() => data.feed.total))
  let stats = $state(untrack(() => data.stats))
  let leaderboard = $state(untrack(() => data.leaderboard))
  // Deferred chart data — populated after initial render
  let activity = $state<GroupActivityResponse>({ days: [] })
  let hourly = $state<GroupHourlyResponse>({ hours: [] })
  let monthly = $state<GroupMonthlyResponse>({ months: [] })

  $effect(() => {
    // Track the slug so this runs on group-to-group navigation
    const _ = data.profile.slug
    untrack(async () => {
      feedItems = data.feed.items
      feedOffset = data.feed.items.length
      feedTotal = data.feed.total
      stats = data.stats
      leaderboard = data.leaderboard
      // Reset to empty while deferred data loads for the new group
      activity = { days: [] }
      hourly = { hours: [] }
      monthly = { months: [] }
      const [a, h, m] = await Promise.all([data.activity, data.hourly, data.monthly])
      activity = a
      hourly = h
      monthly = m
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

  let refetchTimer: ReturnType<typeof setTimeout> | null = null

  $effect(() => {
    const event = getLastSseEvent()
    if (!event || event.type !== 'count' || !event.latestBeer) return

    // untrack: only lastEvent should be a reactive dependency.
    // Reads of feedItems inside here must not re-trigger this effect.
    untrack(() => {
      const isThisGroup = event.latestBeer!.groupSlug === data.profile.slug

      if (isThisGroup) {
        const item = transformSseToFeedItem(event.latestBeer!)
        const isDupe = feedItems.some((f) => f.id === item.id)
        if (!isDupe) {
          feedItems = [item, ...feedItems]
          feedOffset += 1
          feedTotal += 1
        }
      }

      if (!isThisGroup) return

      if (refetchTimer) clearTimeout(refetchTimer)
      refetchTimer = setTimeout(async () => {
        const slug = data.profile.slug
        const [newStats, newLeaderboard, newActivity, newHourly, newMonthly] = await Promise.all([
          getGroupStats(fetch, slug),
          getGroupLeaderboard(fetch, slug),
          getGroupActivity(fetch, slug),
          getGroupHourly(fetch, slug),
          getGroupMonthly(fetch, slug),
        ])
        stats = newStats
        leaderboard = newLeaderboard
        activity = newActivity
        hourly = newHourly
        monthly = newMonthly
      }, 1500)
    })
  })

  $effect(() => {
    getResyncCount()
    untrack(async () => {
      const slug = data.profile.slug
      const [feedData, newStats, newLeaderboard, newActivity, newHourly, newMonthly] =
        await Promise.all([
          getGroupFeed(fetch, slug, { limit: 20, offset: 0 }),
          getGroupStats(fetch, slug),
          getGroupLeaderboard(fetch, slug),
          getGroupActivity(fetch, slug),
          getGroupHourly(fetch, slug),
          getGroupMonthly(fetch, slug),
        ])
      feedItems = feedData.items
      feedOffset = feedData.items.length
      feedTotal = feedData.total
      stats = newStats
      leaderboard = newLeaderboard
      activity = newActivity
      hourly = newHourly
      monthly = newMonthly
    })
  })

  const peakHour = $derived(getPeakHour(hourly.hours))
  const weekdayData = $derived(getThisWeekBreakdown(activity.days))
  const peakWeekday = $derived(
    weekdayData.reduce((a, b) => (b.count > a.count ? b : a), weekdayData[0]),
  )

  let activeTab = $state<'feed' | 'stats' | 'leaderboard'>('feed')

  const initials = $derived(getInitials(data.profile.name))

  let joinModalOpen = $state(false)
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

{#if joinModalOpen}
  <JoinModal group={data.profile} onclose={() => (joinModalOpen = false)} />
{/if}

<!-- ── Hero ──────────────────────────────────────────────────────────── -->
<section class="hero">
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
        {#if data.profile.joinable}
          <button class="join-btn" onclick={() => (joinModalOpen = true)}>
            <svg class="join-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path
                d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
              />
            </svg>
            Join Group
          </button>
        {/if}
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
        <span class="hstat-value">{stats.activeMemberCount.toLocaleString()}</span>
        <span class="hstat-label">Contributors</span>
      </div>
      <div class="hstat-sep" aria-hidden="true"></div>
      <div class="hstat">
        <span class="hstat-value">{stats.avgPerDay}</span>
        <span class="hstat-label">Avg / day</span>
      </div>
      <div class="hstat-sep" aria-hidden="true"></div>
      {#if stats.peakDay}
        <div class="hstat">
          <span class="hstat-value">{stats.peakDay.count}</span>
          <span class="hstat-label">Record</span>
        </div>
      {:else}
        <div class="hstat">
          <span class="hstat-value hstat-value--dim">{stats.daysActive}</span>
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

        <!-- Last 30 days -->
        <div class="chart-card">
          <h3 class="chart-title">Daily Activity — Last 30 Days</h3>
          {#if browser && activity.days.length > 0}
            <ActivityBarChart days={activity.days} />
          {:else if activity.days.length === 0}
            <p class="empty-msg">No activity data yet.</p>
          {/if}
        </div>

        <!-- Hour of day + Weekday — side-by-side on tablet -->
        <div class="charts-pair">
          <div class="chart-card">
            <h3 class="chart-title">When Does This Group Drink?</h3>
            {#if browser && hourly.hours.some((h) => h.count > 0)}
              <HourlyChart hours={hourly.hours} />
            {:else}
              <p class="empty-msg">No data yet.</p>
            {/if}
          </div>

          <div class="chart-card">
            <h3 class="chart-title">This Week by Day</h3>
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
          {#if browser && monthly.months.length > 0}
            <MonthlyChart months={monthly.months} />
          {:else if monthly.months.length === 0}
            <p class="empty-msg">Not enough data yet.</p>
          {/if}
        </div>
      </div>
    </div>

    <!-- LEADERBOARD TAB -->
  {:else}
    <div class="tab-panel" id="panel-leaderboard" role="tabpanel">
      <div class="panel-content">
        <LeaderboardTable entries={leaderboard.entries} title="Group Leaders" />
      </div>
    </div>
  {/if}
</div>

<style>
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

  .join-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.2rem 0.45rem;
    background: rgba(37, 211, 102, 0.1);
    color: #25d366;
    font-family: var(--font-body);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border: 1px solid rgba(37, 211, 102, 0.3);
    border-radius: 0.3rem;
    cursor: pointer;
    line-height: 1.4;
    transition:
      background 120ms ease,
      border-color 120ms ease;
    white-space: nowrap;
  }

  .join-btn:hover {
    background: rgba(37, 211, 102, 0.18);
    border-color: rgba(37, 211, 102, 0.55);
  }

  .join-icon {
    width: 8px;
    height: 8px;
    flex-shrink: 0;
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
