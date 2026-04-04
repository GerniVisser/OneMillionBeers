<script lang="ts">
  import type { LeaderboardEntry } from '@omb/shared'

  let {
    count,
    sessionCount,
    leaderboard,
    sseRate,
  }: {
    count: number
    sessionCount: number
    leaderboard: LeaderboardEntry[]
    sseRate: number
  } = $props()

  const TARGET = 1_000_000
  const MILESTONES = [10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000]

  const nextMilestone = $derived(MILESTONES.find((m) => m > count) ?? TARGET)
  const toNext = $derived((nextMilestone - count).toLocaleString())
  const nextLabel = $derived(
    nextMilestone >= 1_000_000
      ? '1M'
      : nextMilestone >= 1_000
        ? `${nextMilestone / 1_000}k`
        : String(nextMilestone),
  )
  const pct = $derived(Math.min((count / TARGET) * 100, 100).toFixed(2))
  const leader = $derived(leaderboard[0])
</script>

<div class="strip-wrap">
  <div class="strip" role="list" aria-label="Live stats">
    <div class="pill" role="listitem">
      <span class="pill-label">next milestone</span>
      <span class="pill-value">{toNext} to {nextLabel}</span>
    </div>

    {#if sessionCount > 0}
      <div class="pill pill-live" role="listitem">
        <span class="pill-label">this session</span>
        <span class="pill-value">+{sessionCount} beers</span>
      </div>
    {/if}

    {#if sseRate > 0}
      <div class="pill" role="listitem">
        <span class="pill-label">rate</span>
        <span class="pill-value">~{sseRate}/hr</span>
      </div>
    {/if}

    {#if leader}
      <div class="pill" role="listitem">
        <span class="pill-label">leader</span>
        <span class="pill-value"
          >{leader.user.displayName ?? 'Anonymous'} · {leader.beerCount.toLocaleString()}</span
        >
      </div>
    {/if}

    <div class="pill" role="listitem">
      <span class="pill-label">progress</span>
      <span class="pill-value">{pct}%</span>
    </div>
  </div>
</div>

<style>
  .strip-wrap {
    width: 100%;
    overflow: hidden;
  }

  .strip {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    scrollbar-width: none;
    padding-bottom: 4px;
    -webkit-overflow-scrolling: touch;
  }

  .strip::-webkit-scrollbar {
    display: none;
  }

  .pill {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.5rem 0.75rem;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 0.625rem;
    white-space: nowrap;
  }

  .pill-live {
    border-color: rgba(212, 136, 58, 0.4);
    background: rgba(212, 136, 58, 0.08);
  }

  .pill-label {
    font-family: var(--font-body);
    font-size: 0.6rem;
    font-weight: 500;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .pill-value {
    font-family: var(--font-display);
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--color-beer-amber);
  }
</style>
