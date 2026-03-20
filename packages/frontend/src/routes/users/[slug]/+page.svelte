<script lang="ts">
  import type { PageData } from './$types'
  import StatCard from '$lib/components/StatCard.svelte'

  let { data }: { data: PageData } = $props()

  const displayName = $derived(data.profile.displayName ?? data.profile.slug)

  const initials = $derived(
    displayName
      .split(' ')
      .slice(0, 2)
      .map((w: string) => w[0]?.toUpperCase() ?? '')
      .join(''),
  )

  const memberSince = $derived(
    new Date(data.profile.createdAt).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    }),
  )

  function formatHour(h: number | null): string {
    if (h === null) return '—'
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour = h % 12 === 0 ? 12 : h % 12
    return `${hour} ${ampm}`
  }
</script>

<svelte:head>
  <title>{displayName} — OneMillionBeers</title>
  <meta
    name="description"
    content="{displayName} has logged {data.stats.totalBeers} beers on OneMillionBeers."
  />
</svelte:head>

<!-- Profile header -->
<section
  style="
    background: linear-gradient(180deg, #2d1200 0%, var(--color-bg-deep) 100%);
    padding: 3rem 1rem 2rem;
  "
>
  <div style="max-width: 600px; margin: 0 auto; text-align: center;">
    <!-- Avatar circle -->
    <div
      style="
        width: 5rem;
        height: 5rem;
        border-radius: 50%;
        background-color: var(--color-beer-amber);
        color: var(--color-bg-deep);
        font-family: var(--font-display);
        font-size: 2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 1rem;
        letter-spacing: 0.05em;
      "
      class="glow-box-amber"
    >
      {initials}
    </div>

    <h1
      style="
        font-family: var(--font-display);
        font-size: clamp(2rem, 7vw, 3rem);
        color: var(--color-beer-head);
        letter-spacing: 0.05em;
        margin-bottom: 0.25rem;
      "
      class="glow-amber"
    >
      {displayName}
    </h1>

    <p style="color: var(--color-text-muted); font-size: 0.9rem;">
      Member since {memberSince}
    </p>
  </div>
</section>

<!-- Stats grid -->
<section style="max-width: 900px; margin: 0 auto; padding: 2rem 1rem 4rem;">
  <h2
    style="
      font-family: var(--font-display);
      font-size: 1.75rem;
      color: var(--color-beer-amber);
      letter-spacing: 0.05em;
      margin-bottom: 1.25rem;
    "
  >
    Stats
  </h2>

  <div class="stats-grid">
    <StatCard label="Total Beers" value={data.stats.totalBeers.toLocaleString()} icon="🍺" />
    <StatCard label="This Month" value={data.stats.thisMonth.toLocaleString()} icon="📅" />
    <StatCard label="This Year" value={data.stats.thisYear.toLocaleString()} icon="🗓️" />
    <StatCard label="Current Streak" value="{data.stats.currentStreak}d" icon="🔥" />
    <StatCard label="Longest Streak" value="{data.stats.longestStreak}d" icon="🏆" />
    <StatCard label="Favourite Hour" value={formatHour(data.stats.favoriteHour)} icon="⏰" />
  </div>
</section>

<style>
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
