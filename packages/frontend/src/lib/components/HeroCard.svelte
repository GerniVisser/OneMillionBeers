<script lang="ts">
  import ProgressBar from './ProgressBar.svelte'

  let {
    count,
    sessionCount,
    target = 1_000_000,
  }: {
    count: number
    sessionCount: number
    target?: number
  } = $props()

  const pct = $derived(Math.min((count / target) * 100, 100))
  const remaining = $derived(Math.max(target - count, 0).toLocaleString())

  // Percentage vs yesterday — requires API support; shown only when available
  const vsYesterday: number | null = null
</script>

<div class="hero card">
  <div class="hero-grid">
    <!-- Left: Global Progress -->
    <div class="hero-left">
      <span class="stat-label">Global Progress</span>
      <div class="hero-count">{count.toLocaleString()}</div>
      <div class="hero-sub">of 1,000,000 beers</div>
    </div>

    <!-- Right: Today -->
    <div class="hero-right">
      <span class="stat-label">Today</span>
      <div class="hero-today">+{sessionCount.toLocaleString()}</div>
      {#if vsYesterday !== null}
        <div class="hero-vs">
          {vsYesterday >= 0 ? '↑' : '↓'}
          {Math.abs(vsYesterday)}% vs yesterday
        </div>
      {:else if sessionCount > 0}
        <div class="hero-vs">↑ live right now</div>
      {/if}
    </div>
  </div>

  <!-- Full-width progress bar -->
  <div class="hero-bar">
    <ProgressBar {count} {target} {remaining} />
  </div>
</div>

<style>
  .hero {
    padding: 1.375rem 1.5rem 1.25rem;
    display: flex;
    flex-direction: column;
  }

  .hero-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 1rem;
    align-items: start;
  }

  /* Left */
  .hero-left {
    display: flex;
    flex-direction: column;
  }

  .hero-count {
    font-family: var(--font-display);
    font-size: clamp(2.5rem, 10vw, 3.5rem);
    font-weight: 700;
    color: var(--color-beer-amber);
    line-height: 1;
    margin-top: 0.2rem;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
  }

  .hero-sub {
    font-family: var(--font-body);
    font-size: 0.82rem;
    color: var(--color-text-muted);
    margin-top: 0.35rem;
  }

  /* Right */
  .hero-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .hero-today {
    font-family: var(--font-display);
    font-size: clamp(2rem, 8vw, 3rem);
    font-weight: 700;
    color: var(--color-beer-foam);
    line-height: 1;
    margin-top: 0.2rem;
    font-variant-numeric: tabular-nums;
  }

  .hero-vs {
    margin-top: 0.35rem;
    font-family: var(--font-body);
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--color-positive);
  }

  /* Bottom bar */
  .hero-bar {
    margin-top: 1.25rem;
  }
</style>
