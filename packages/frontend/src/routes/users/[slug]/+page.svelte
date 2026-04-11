<script lang="ts">
  import { untrack } from 'svelte'
  import type { PageData } from './$types'
  import StatCard from '$lib/components/StatCard.svelte'
  import GroupSearch from '$lib/components/GroupSearch.svelte'
  import { getInitials, formatHour } from '$lib/utils'
  import { getLastSseEvent, getResyncCount } from '$lib/sse.svelte'
  import { getUserStats } from '$lib/api'

  let { data }: { data: PageData } = $props()

  let stats = $state(untrack(() => data.stats))

  let refetchTimer: ReturnType<typeof setTimeout> | null = null

  $effect(() => {
    const event = getLastSseEvent()
    if (!event || !event.latestBeer) return

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

  const displayName = $derived(data.profile.displayName ?? data.profile.slug)

  const initials = $derived(getInitials(displayName))

  const contributorSince = $derived(
    new Date(data.profile.createdAt).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    }),
  )

  function formatFavoriteHour(h: number | null): string {
    if (h === null) return '—'
    return formatHour(h)
  }
</script>

<svelte:head>
  <title>{displayName} — OneMillionBeers</title>
  <meta
    name="description"
    content="{displayName} has logged {stats.totalBeers} beers on OneMillionBeers."
  />
</svelte:head>

<!-- Page header -->
<header class="page-header">
  <a
    href="/"
    class="page-header-btn back-btn"
    aria-label="Go back"
    onclick={(e) => {
      e.preventDefault()
      history.back()
    }}
  >
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
      <path d="M15 18l-6-6 6-6" />
    </svg>
    Back
  </a>
  <div class="header-search">
    <GroupSearch />
  </div>
</header>

<!-- Profile header -->
<section class="profile-hero">
  <div class="profile-hero-inner">
    <!-- Avatar circle -->
    <div class="avatar glow-box-amber">
      {initials}
    </div>

    <h1 class="profile-name glow-amber">
      {displayName}
    </h1>

    <p class="profile-since">
      Contributors since {contributorSince}
    </p>
  </div>
</section>

<!-- Stats grid -->
<section class="stats-section">
  <h2 class="stats-heading">Stats</h2>

  <div class="stats-grid">
    <StatCard label="Total Beers" value={stats.totalBeers.toLocaleString()} icon="🍺" />
    <StatCard label="This Month" value={stats.thisMonth.toLocaleString()} icon="📅" />
    <StatCard label="This Year" value={stats.thisYear.toLocaleString()} icon="🗓️" />
    <StatCard label="Current Streak" value="{stats.currentStreak}d" icon="🔥" />
    <StatCard label="Longest Streak" value="{stats.longestStreak}d" icon="🏆" />
    <StatCard label="Favourite Hour" value={formatFavoriteHour(stats.favoriteHour)} icon="⏰" />
  </div>
</section>

<style>
  .page-header {
    position: sticky;
    top: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.25rem;
    background-color: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--color-border);
    min-height: 3.25rem;
  }

  .page-header-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--color-cream-faint);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    text-decoration: none;
    font-size: 0.85rem;
    transition: color 120ms ease;
  }

  .page-header-btn:hover {
    color: var(--color-beer-amber);
  }

  .back-btn {
    flex-shrink: 0;
  }

  .header-search {
    flex: 1;
    max-width: 320px;
  }

  .profile-hero {
    background: linear-gradient(180deg, #fef3c7 0%, #fafaf9 100%);
    border-bottom: 1px solid #fde68a;
    padding: 3rem 1rem 2rem;
  }

  .profile-hero-inner {
    max-width: 600px;
    margin: 0 auto;
    text-align: center;
  }

  .avatar {
    width: 5rem;
    height: 5rem;
    border-radius: 50%;
    background-color: var(--color-beer-amber);
    color: #ffffff;
    font-family: var(--font-display);
    font-size: 2rem;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 1rem;
    letter-spacing: 0.05em;
  }

  .profile-name {
    font-family: var(--font-display);
    font-size: clamp(2rem, 7vw, 3rem);
    color: var(--color-beer-head);
    letter-spacing: 0.05em;
    margin-bottom: 0.25rem;
  }

  .profile-since {
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }

  .stats-section {
    max-width: 900px;
    margin: 0 auto;
    padding: 2rem 1rem 4rem;
  }

  .stats-heading {
    font-family: var(--font-display);
    font-size: 1.75rem;
    color: var(--color-beer-amber);
    letter-spacing: 0.05em;
    margin-bottom: 1.25rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }

  @media (min-width: 640px) {
    .stats-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }
</style>
