<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import type { PageData } from './$types'
  import type {
    FeedItem,
    UserActivityResponse,
    UserHourlyResponse,
    UserMonthlyResponse,
  } from '@omb/shared'
  import { getInitials, formatHour, getThisWeekBreakdown, getThisWeekTotal } from '$lib/utils'
  import { getLastSseEvent, getResyncCount } from '$lib/sse.svelte'
  import { getUserStats, getUserFeed } from '$lib/api'
  import { addRecentUser } from '$lib/recents'
  import CountryFlag from '$lib/components/CountryFlag.svelte'
  import FeedGrid from '$lib/components/FeedGrid.svelte'
  import MonthlyChart from '$lib/components/MonthlyChart.svelte'
  import HourlyChart from '$lib/components/HourlyChart.svelte'
  import WeekdayBars from '$lib/components/WeekdayBars.svelte'
  import BeerLightbox from '$lib/components/BeerLightbox.svelte'

  let { data }: { data: PageData } = $props()

  let lightboxItem = $state<FeedItem | null>(null)

  onMount(() => {
    addRecentUser({
      slug: data.profile.slug,
      pseudoName: data.profile.pseudoName ?? null,
      countryCode: data.profile.countryCode ?? null,
    })

    // Resolve deferred chart data (non-blocking; page renders without it)
    void Promise.all([data.activity, data.hourly, data.monthly]).then(([a, h, m]) => {
      activity = a
      hourly = h
      monthly = m
    })

    // Animate the hero count in
    const target = stats.totalBeers
    if (target === 0) {
      displayedCount = 0
      return
    }
    const duration = 1400
    const start = performance.now()
    function tick(now: number) {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      displayedCount = Math.floor(eased * target)
      if (t < 1) requestAnimationFrame(tick)
      else displayedCount = target
    }
    requestAnimationFrame(tick)
  })

  let stats = $state(untrack(() => data.stats))
  // Deferred chart data — populated after initial render (see onMount)
  let activity = $state<UserActivityResponse>({ days: [] })
  let hourly = $state<UserHourlyResponse>({ hours: [] })
  let monthly = $state<UserMonthlyResponse>({ months: [] })
  let displayedCount = $state(0)

  let refetchTimer: ReturnType<typeof setTimeout> | null = null

  $effect(() => {
    const event = getLastSseEvent()
    if (!event || event.type !== 'count' || !event.latestBeer) return
    if (event.latestBeer.userSlug !== data.profile.slug) return
    if (refetchTimer) clearTimeout(refetchTimer)
    refetchTimer = setTimeout(async () => {
      stats = await getUserStats(fetch, data.profile.slug)
    }, 1500)
  })

  $effect(() => {
    getResyncCount()
    untrack(async () => {
      stats = await getUserStats(fetch, data.profile.slug)
    })
  })

  // Sync displayedCount when SSE updates arrive after animation
  $effect(() => {
    const t = stats.totalBeers
    untrack(() => {
      if (displayedCount > 0 && displayedCount !== t) displayedCount = t
    })
  })

  const displayName = $derived(
    data.profile.displayName ?? data.profile.pseudoName ?? data.profile.slug,
  )
  const initials = $derived(getInitials(displayName))
  const contributorSince = $derived(
    new Date(data.profile.createdAt).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    }),
  )

  // ── Rank system ──────────────────────────────────────────────
  const RANKS = [
    { name: 'Hoppling', min: 0, icon: '🌱', color: '#6b5233' },
    { name: 'Ale Apprentice', min: 10, icon: '🍶', color: '#a8906c' },
    { name: 'Craft Journeyman', min: 50, icon: '⚗️', color: '#d97706' },
    { name: 'Hop Head', min: 100, icon: '🌿', color: '#f59e0b' },
    { name: 'Head Brewer', min: 250, icon: '🍺', color: '#fbbf24' },
    { name: 'Grand Brewmaster', min: 500, icon: '🏆', color: '#fcd34d' },
    { name: 'Legend', min: 1000, icon: '👑', color: '#ffd700' },
  ]

  const rankIndex = $derived(
    RANKS.reduce((best, r, i) => (stats.totalBeers >= r.min ? i : best), 0),
  )
  const currentRank = $derived(RANKS[rankIndex])
  const nextRank = $derived(rankIndex < RANKS.length - 1 ? RANKS[rankIndex + 1] : null)
  const rankProgress = $derived(
    nextRank ? (stats.totalBeers - currentRank.min) / (nextRank.min - currentRank.min) : 1,
  )
  const beersToNext = $derived(nextRank ? nextRank.min - stats.totalBeers : 0)

  // ── Drinker archetype ────────────────────────────────────────
  type Archetype = { icon: string; title: string; desc: string }

  const archetype = $derived.by((): Archetype | null => {
    const h = stats.favoriteHour
    if (h === null) return null
    if (h <= 5) return { icon: '🌙', title: 'The Midnight Brewer', desc: 'Darkness fuels the pour' }
    if (h <= 10)
      return { icon: '☀️', title: 'The Breakfast Stout', desc: 'Day starts with a cold one' }
    if (h <= 14)
      return { icon: '🌤️', title: 'The Lunchtime Lager', desc: 'Midday refreshment is sacred' }
    if (h <= 19) return { icon: '🌅', title: 'The Sunset Sipper', desc: 'Golden hour, golden pint' }
    return { icon: '🍻', title: 'The Night Cap', desc: 'Ending every day right' }
  })

  // ── Pace projection ──────────────────────────────────────────
  const paceProjection = $derived.by((): { milestone: number; label: string } | null => {
    if (stats.totalBeers < 3) return null
    const created = new Date(data.profile.createdAt)
    const now = new Date()
    const monthsActive = Math.max(
      1,
      (now.getFullYear() - created.getFullYear()) * 12 + (now.getMonth() - created.getMonth()),
    )
    const rate = stats.totalBeers / monthsActive
    if (rate < 0.5) return null
    const milestones = [50, 100, 250, 500, 1000, 2500, 5000, 10000]
    const next = milestones.find((m) => m > stats.totalBeers)
    if (!next) return null
    const monthsLeft = (next - stats.totalBeers) / rate
    const target = new Date(now)
    target.setMonth(target.getMonth() + Math.round(monthsLeft))
    return {
      milestone: next,
      label: target.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    }
  })

  // ── Achievements ─────────────────────────────────────────────
  type Badge = { icon: string; name: string; desc: string; unlocked: boolean }

  const badges = $derived.by((): Badge[] => [
    {
      icon: '🍺',
      name: 'First Pour',
      desc: 'Log your first beer',
      unlocked: stats.totalBeers >= 1,
    },
    {
      icon: '🎯',
      name: 'Double Digits',
      desc: 'Reach 10 beers',
      unlocked: stats.totalBeers >= 10,
    },
    {
      icon: '💯',
      name: 'Century Club',
      desc: 'Log 100 beers',
      unlocked: stats.totalBeers >= 100,
    },
    {
      icon: '🔥',
      name: 'Week Warrior',
      desc: '7-day streak',
      unlocked: stats.longestStreak >= 7,
    },
    {
      icon: '📅',
      name: 'Month Master',
      desc: '30-day streak',
      unlocked: stats.longestStreak >= 30,
    },
    {
      icon: '🌙',
      name: 'Night Owl',
      desc: 'Favourite hour after 10 pm',
      unlocked:
        stats.favoriteHour !== null && (stats.favoriteHour >= 22 || stats.favoriteHour <= 4),
    },
    {
      icon: '☀️',
      name: 'Early Bird',
      desc: 'Favourite hour before 10 am',
      unlocked: stats.favoriteHour !== null && stats.favoriteHour >= 6 && stats.favoriteHour <= 9,
    },
    {
      icon: '👑',
      name: 'Five Hundred',
      desc: 'Log 500 beers',
      unlocked: stats.totalBeers >= 500,
    },
  ])

  const unlockedCount = $derived(badges.filter((b) => b.unlocked).length)

  function formatFavoriteHour(h: number | null): string {
    if (h === null) return '—'
    return formatHour(h)
  }

  // ── Weekday breakdown (derived from activity) ─────────────────
  const weekdayEntries = $derived(getThisWeekBreakdown(activity.days))
  const peakWeekday = $derived(
    weekdayEntries.length > 0
      ? weekdayEntries.reduce((a, b) => (b.count > a.count ? b : a))
      : undefined,
  )
  const beersThisWeek = $derived(getThisWeekTotal(activity.days))

  // ── Tabs ──────────────────────────────────────────────────────
  let activeTab = $state<'feed' | 'stats'>('feed')

  // Feed lazy-load
  let feedItems = $state<FeedItem[]>([])
  let feedTotal = $state(0)
  let feedLoading = $state(false)
  let feedInitialized = $state(false)
  let sentinel = $state<HTMLElement | undefined>(undefined)

  const hasMore = $derived(feedItems.length < feedTotal)

  async function loadFeed(reset = false) {
    if (feedLoading) return
    feedLoading = true
    const offset = reset ? 0 : feedItems.length
    try {
      const res = await getUserFeed(fetch, data.profile.slug, { limit: 20, offset })
      feedItems = reset ? res.items : [...feedItems, ...res.items]
      feedTotal = res.total
      feedInitialized = true
    } finally {
      feedLoading = false
    }
  }

  $effect(() => {
    if (activeTab === 'feed' && !feedInitialized) {
      loadFeed()
    }
  })

  $effect(() => {
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadFeed()
      },
      { rootMargin: '300px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  })
</script>

<svelte:head>
  <title>{displayName} — OneMillionBeers</title>
  <meta
    name="description"
    content="{displayName} has logged {stats.totalBeers} beers on OneMillionBeers."
  />
</svelte:head>

<BeerLightbox
  item={lightboxItem}
  onclose={() => {
    lightboxItem = null
  }}
/>

<!-- ── Hero ─────────────────────────────────────────────────── -->
<section class="hero" style="--rank-color: {currentRank.color};">
  <div class="hero-glow" aria-hidden="true"></div>

  <div class="hero-inner">
    <div class="hero-top">
      <div class="hero-avatar">
        {#if data.profile.countryCode}
          <CountryFlag countryCode={data.profile.countryCode} size={44} />
        {:else}
          <span class="avatar-initials">{initials}</span>
        {/if}
      </div>

      <div class="hero-identity">
        <h1 class="hero-name">{displayName}</h1>
        {#if archetype}
          <p class="hero-archetype">{archetype.icon} {archetype.title}</p>
        {/if}
        <p class="hero-since">since {contributorSince}</p>
      </div>

      <div class="hero-score">
        <span class="hero-count">{displayedCount.toLocaleString()}</span>
        <span class="hero-count-label">beers</span>
      </div>
    </div>

    <!-- Rank strip: flush onto the tab bar, like the group stats bar -->
    <div class="rank-strip">
      <div class="rank-row">
        <span class="rank-current">
          <span class="rank-icon" aria-hidden="true">{currentRank.icon}</span>
          <span class="rank-title">{currentRank.name}</span>
        </span>
        {#if nextRank}
          <span class="rank-next">
            Next: {nextRank.icon}
            {nextRank.name}
          </span>
        {:else}
          <span class="rank-next rank-next--max">👑 Max rank</span>
        {/if}
      </div>
      {#if nextRank}
        <div class="progress-track">
          <div
            class="progress-fill"
            style="--target: {Math.min(rankProgress * 100, 100).toFixed(1)}%;"
          ></div>
        </div>
        <p class="rank-sub">
          {beersToNext} more {beersToNext === 1 ? 'beer' : 'beers'} to {nextRank.name}
        </p>
      {/if}
    </div>
  </div>
</section>

<!-- ── Body ─────────────────────────────────────────────────── -->
<div class="body-wrap">
  <!-- Achievements -->
  <div class="section-header">
    <h2 class="stat-label">Achievements</h2>
    <span class="achievements-tally stat-label">{unlockedCount}/{badges.length} unlocked</span>
  </div>
  <div class="badges-scroll">
    {#each badges as badge (badge.name)}
      <div class="badge-tile card" class:badge-locked={!badge.unlocked} title={badge.desc}>
        <div class="badge-icon-wrap">
          <span class="badge-icon">{badge.icon}</span>
          {#if !badge.unlocked}
            <span class="badge-lock">🔒</span>
          {/if}
        </div>
        <span class="badge-name">{badge.name}</span>
      </div>
    {/each}
  </div>

  <!-- ── Tab bar ───────────────────────────────────────────────── -->
  <div class="tab-bar" role="tablist" aria-label="Profile sections">
    <button
      class="tab-btn"
      class:tab-active={activeTab === 'feed'}
      role="tab"
      aria-selected={activeTab === 'feed'}
      onclick={() => (activeTab = 'feed')}
    >
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
      Photos
    </button>
    <button
      class="tab-btn"
      class:tab-active={activeTab === 'stats'}
      role="tab"
      aria-selected={activeTab === 'stats'}
      onclick={() => (activeTab = 'stats')}
    >
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

  <!-- ── Feed tab ──────────────────────────────────────────────── -->
  {#if activeTab === 'feed'}
    <div class="tab-panel">
      <FeedGrid
        items={feedItems}
        loading={feedLoading && feedItems.length === 0}
        onopen={(item) => {
          lightboxItem = item
        }}
      />
      {#if hasMore}
        <div bind:this={sentinel} class="scroll-sentinel" aria-hidden="true"></div>
      {/if}
      {#if feedLoading && feedItems.length > 0}
        <p class="loading-msg">Loading…</p>
      {/if}
    </div>
  {/if}

  <!-- ── Stats tab ─────────────────────────────────────────────── -->
  {#if activeTab === 'stats'}
    <div class="tab-panel">
      <!-- Monthly trend -->
      {#if monthly.months.length > 1}
        <div class="chart-card card">
          <span class="stat-label chart-label">Your Journey</span>
          <MonthlyChart months={monthly.months} />
        </div>
      {/if}

      <!-- Hourly + Weekday -->
      <div class="charts-row">
        <div class="chart-card card">
          <span class="stat-label chart-label">Peak Hours</span>
          <HourlyChart hours={hourly.hours} />
        </div>
        <div class="chart-card card">
          <span class="stat-label chart-label">This Week by Day</span>
          <WeekdayBars days={weekdayEntries} peakDay={peakWeekday} />
        </div>
      </div>

      <!-- Numbers -->
      <div class="stats-grid">
        <div class="card stat-box">
          <span class="stat-label">This Week</span>
          <span class="stat-val">{beersThisWeek.toLocaleString()}</span>
        </div>
        <div class="card stat-box">
          <span class="stat-label">This Month</span>
          <span class="stat-val">{stats.thisMonth.toLocaleString()}</span>
        </div>
        <div class="card stat-box">
          <span class="stat-label">This Year</span>
          <span class="stat-val">{stats.thisYear.toLocaleString()}</span>
        </div>
        <div class="card stat-box">
          <span class="stat-label">Current Streak</span>
          <span class="stat-val">{stats.currentStreak}<span class="stat-unit">d</span></span>
        </div>
        <div class="card stat-box">
          <span class="stat-label">Longest Streak</span>
          <span class="stat-val">{stats.longestStreak}<span class="stat-unit">d</span></span>
        </div>
        <div class="card stat-box">
          <span class="stat-label">Favourite Hour</span>
          <span class="stat-val">{formatFavoriteHour(stats.favoriteHour)}</span>
        </div>
        {#if paceProjection}
          <div class="card stat-box">
            <span class="stat-label">Next Milestone</span>
            <span class="stat-val pace-val">{paceProjection.milestone.toLocaleString()}</span>
            <span class="pace-sub">by {paceProjection.label}</span>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  /* ── Hero ─────────────────────────────────────────────────── */
  .hero {
    position: relative;
    overflow: hidden;
    background: linear-gradient(165deg, #0d0803 0%, #1e1005 45%, #2d1a08 80%, #3d2510 100%);
    border-bottom: 1px solid #5c3d1a;
    padding: 1.1rem 1rem 0;
  }

  .hero-glow {
    position: absolute;
    top: -110px;
    left: -40px;
    width: 300px;
    height: 300px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(245, 158, 11, 0.16) 0%, transparent 65%);
    pointer-events: none;
  }

  .hero-inner {
    position: relative;
    max-width: 720px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .hero-top {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }

  .hero-avatar {
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 50%;
    border: 2px solid var(--rank-color);
    box-shadow:
      0 0 0 3px color-mix(in srgb, var(--rank-color) 18%, transparent),
      0 0 22px rgba(245, 158, 11, 0.25);
    background: var(--color-bg-surface);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
  }

  .avatar-initials {
    font-family: var(--font-display);
    font-size: 1.2rem;
    font-weight: 800;
    color: var(--rank-color);
  }

  .hero-identity {
    flex: 1;
    min-width: 0;
  }

  .hero-name {
    font-family: var(--font-display);
    font-size: clamp(1.25rem, 5vw, 2rem);
    font-weight: 800;
    color: var(--color-beer-foam);
    letter-spacing: -0.02em;
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hero-archetype {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--rank-color);
    margin-top: 0.15rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hero-since {
    font-size: 0.7rem;
    color: var(--color-text-muted);
    margin-top: 0.1rem;
  }

  .hero-score {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    flex-shrink: 0;
  }

  .hero-count {
    font-family: var(--font-display);
    font-size: clamp(2rem, 8vw, 3.25rem);
    font-weight: 900;
    color: var(--color-beer-amber);
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    text-shadow: 0 0 28px rgba(245, 158, 11, 0.4);
  }

  .hero-count-label {
    font-family: var(--font-body);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    margin-top: 0.15rem;
  }

  /* ── Rank strip ──────────────────────────────────────────── */
  .rank-strip {
    background: rgba(26, 18, 9, 0.75);
    border: 1px solid var(--color-border);
    border-bottom: none;
    border-radius: 0.85rem 0.85rem 0 0;
    padding: 0.6rem 0.85rem 0.55rem;
    backdrop-filter: blur(8px);
  }

  .rank-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .rank-current {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }

  .rank-icon {
    font-size: 1.1rem;
    line-height: 1;
  }

  .rank-title {
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 700;
    color: var(--rank-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rank-next {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .rank-next--max {
    color: var(--color-rank-gold);
  }

  .progress-track {
    height: 6px;
    margin-top: 0.45rem;
    background: var(--color-bg-surface);
    border-radius: 999px;
    overflow: hidden;
    border: 1px solid var(--color-border);
  }

  .progress-fill {
    height: 100%;
    width: 0;
    border-radius: 999px;
    background: var(--rank-color);
    box-shadow: 0 0 8px var(--rank-color);
    animation: bar-fill 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) 0.4s forwards;
  }

  @keyframes bar-fill {
    from {
      width: 0;
    }
    to {
      width: var(--target);
    }
  }

  .rank-sub {
    margin-top: 0.3rem;
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  @media (min-width: 640px) {
    .hero {
      padding: 1.6rem 2rem 0;
    }

    .hero-top {
      gap: 1.25rem;
    }

    .hero-avatar {
      width: 4.5rem;
      height: 4.5rem;
    }

    .avatar-initials {
      font-size: 1.375rem;
    }
  }

  /* ── Body ─────────────────────────────────────────────────── */
  .body-wrap {
    max-width: 720px;
    margin: 0 auto;
    padding: 0.9rem 1rem 5rem;
  }

  /* ── Achievements ────────────────────────────────────────── */
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .badges-scroll {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    padding-bottom: 0.4rem;
    margin-bottom: 0.9rem;
    scrollbar-width: none;
  }

  .badge-tile {
    flex-shrink: 0;
    width: 4.5rem;
    padding: 0.55rem 0.35rem 0.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    text-align: center;
    transition:
      box-shadow 150ms ease,
      opacity 150ms ease;
    cursor: default;
  }

  .badge-tile:not(.badge-locked):hover {
    box-shadow:
      0 0 0 1px var(--color-beer-dark),
      0 4px 24px rgba(245, 158, 11, 0.2);
  }

  .badge-locked {
    opacity: 0.3;
    filter: grayscale(0.5);
  }

  .badge-icon-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .badge-icon {
    font-size: 1.45rem;
    line-height: 1;
  }

  .badge-lock {
    position: absolute;
    bottom: -5px;
    right: -10px;
    font-size: 0.75rem;
  }

  .badge-name {
    font-size: 0.6rem;
    font-weight: 700;
    color: var(--color-text-muted);
    line-height: 1.2;
    letter-spacing: 0.01em;
  }

  /* ── Tabs ────────────────────────────────────────────────── */
  .tab-bar {
    position: sticky;
    top: 0;
    z-index: 50;
    display: grid;
    grid-template-columns: 1fr 1fr;
    margin: 0 -1rem 1rem;
    background: var(--color-bg-nav);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-top: 1px solid var(--color-border);
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
      border-color 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .tab-btn:hover {
    color: var(--color-beer-foam);
  }

  .tab-active {
    color: var(--color-beer-amber);
    border-bottom-color: var(--color-beer-amber);
  }

  .tab-icon {
    width: 17px;
    height: 17px;
    flex-shrink: 0;
  }

  .tab-panel {
    min-height: 12rem;
  }

  /* ── Charts ──────────────────────────────────────────────── */
  .chart-card {
    padding: 1.125rem 1.25rem 1rem;
    margin-bottom: 0.75rem;
  }

  .chart-label {
    display: block;
    margin-bottom: 0.875rem;
  }

  .charts-row {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  @media (min-width: 560px) {
    .charts-row {
      grid-template-columns: 1fr 1fr;
    }
  }

  /* ── Stats grid ──────────────────────────────────────────── */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
    margin-top: 0.75rem;
  }

  @media (min-width: 480px) {
    .stats-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  .stat-box {
    padding: 1rem 1.125rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .stat-val {
    font-family: var(--font-display);
    font-size: 1.875rem;
    font-weight: 700;
    color: var(--color-beer-amber);
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
    margin-top: 0.125rem;
  }

  .stat-unit {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--color-text-muted);
  }

  .pace-val {
    color: var(--color-beer-amber);
  }

  .pace-sub {
    font-size: 0.72rem;
    color: var(--color-text-muted);
    font-family: var(--font-body);
    margin-top: 0.1rem;
  }

  .scroll-sentinel {
    height: 1px;
  }

  .loading-msg {
    text-align: center;
    color: var(--color-text-muted);
    font-size: 0.85rem;
    padding: 1rem 0;
  }
</style>
