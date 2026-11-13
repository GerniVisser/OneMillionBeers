<script lang="ts">
  import { untrack } from 'svelte'
  import type { GlobalStatsResponse } from '@omb/shared'

  let {
    count = 0,
    sessionCount = 0,
    flashCount = 0,
    stats,
  }: {
    count: number
    sessionCount?: number
    flashCount?: number
    stats: GlobalStatsResponse
  } = $props()

  const TARGET = 1_000_000
  const MILESTONES = [10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000]

  const pct = $derived(Math.min((count / TARGET) * 100, 100).toFixed(2))
  const formatted = $derived(count.toLocaleString())
  const remaining = $derived(Math.max(TARGET - count, 0).toLocaleString())

  // Bubbles for background decoration
  const bubbles = Array.from({ length: 10 }, (_, i) => ({
    id: i,
    left: `${8 + i * 9}%`,
    size: `${6 + (i % 4) * 4}px`,
    delay: `${i * 0.6}s`,
    duration: `${5 + (i % 3) * 2}s`,
    opacity: 0.2 + (i % 3) * 0.1,
  }))

  // Flash effect on count element
  let countEl: HTMLElement

  $effect(() => {
    if (flashCount === 0 || !countEl) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    countEl.animate(
      [
        { color: 'var(--color-beer-amber)' },
        {
          color: 'var(--color-beer-dark)',
          textShadow: '0 2px 12px rgba(245, 158, 11, 0.5)',
        },
        { color: 'var(--color-beer-amber)' },
      ],
      { duration: 600, easing: 'ease-out' },
    )
  })

  // Milestone banner
  let milestoneBanner = $state<number | null>(null)
  let prevCount = $state(untrack(() => count))

  $effect(() => {
    const crossed = MILESTONES.find((m) => prevCount < m && count >= m)
    if (crossed) {
      milestoneBanner = crossed
      setTimeout(() => {
        milestoneBanner = null
      }, 5000)
    }
    prevCount = count
  })
</script>

<div class="hero-card">
  <div class="hero-glow" aria-hidden="true"></div>

  <!-- Foam bubbles background -->
  <div aria-hidden="true" class="bubbles-wrap">
    {#each bubbles as b (b.id)}
      <div
        class="bubble"
        style="left: {b.left}; width: {b.size}; height: {b.size}; opacity: {b.opacity}; animation-delay: {b.delay}; animation-duration: {b.duration};"
      ></div>
    {/each}
  </div>

  <div class="hero-body">
    <div class="hero-layout">
      <div class="avatar-ring">
        <div class="avatar-inner">
          <img class="avatar-img" src="/logo-mark.svg" alt="" width="80" height="74" />
        </div>
      </div>

      <div class="hero-text">
        <h1 class="hero-eyebrow">One Million Beers</h1>
        <div aria-live="polite" aria-label="{count} beers logged" class="counter">
          <span class="count glow-amber" bind:this={countEl}>{formatted}</span>
          <span class="counter-label">beers</span>
        </div>
        <div class="progress-wrap">
          <div
            class="progress-track"
            role="progressbar"
            aria-valuenow={count}
            aria-valuemin={0}
            aria-valuemax={TARGET}
            aria-label="Progress to one million beers"
          >
            <div class="progress-fill" style="width: {pct}%;"></div>
          </div>
          <div class="progress-labels">
            <span><strong>{pct}%</strong> of the way</span>
            <span>{remaining} to go</span>
          </div>
        </div>
      </div>
    </div>

    <div class="hero-stats">
      <div class="hstat">
        <span class="hstat-value">{stats.activeMemberCount.toLocaleString()}</span>
        <span class="hstat-label">Contributors</span>
      </div>
      <div class="hstat-sep" aria-hidden="true"></div>
      <div class="hstat">
        <span class="hstat-value">{stats.activeGroupCount.toLocaleString()}</span>
        <span class="hstat-label">Groups</span>
      </div>
      <div class="hstat-sep" aria-hidden="true"></div>
      <div class="hstat">
        <span class="hstat-value">{stats.avgPerDay}</span>
        <span class="hstat-label">Avg / day</span>
      </div>
      <div class="hstat-sep" aria-hidden="true"></div>
      {#if stats.peakDay}
        <div class="hstat">
          <span class="hstat-value">{stats.peakDay.count.toLocaleString()}</span>
          <span class="hstat-label">Record day</span>
        </div>
      {:else}
        <div class="hstat">
          <span class="hstat-value hstat-value--dim">{stats.daysActive}</span>
          <span class="hstat-label">Days active</span>
        </div>
      {/if}
    </div>
  </div>

  <!-- Milestone banner -->
  {#if milestoneBanner}
    <div class="milestone-banner" role="status">
      🎉 {milestoneBanner.toLocaleString()} beers!
    </div>
  {/if}
</div>

<style>
  .hero-card {
    position: relative;
    overflow: hidden;
    padding: 1.25rem 1rem 0;
    background: linear-gradient(165deg, #0d0803 0%, #1e1005 45%, #2d1a08 80%, #3d2510 100%);
    border-bottom: 1px solid #5c3d1a;
  }

  /* Amber bloom behind the logo, as on the group header */
  .hero-glow {
    position: absolute;
    top: -110px;
    left: 0;
    width: 320px;
    height: 320px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(245, 158, 11, 0.18) 0%, transparent 65%);
    pointer-events: none;
  }

  .bubbles-wrap {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .bubble {
    position: absolute;
    bottom: -20px;
    border-radius: 50%;
    background: var(--color-beer-amber);
    animation: float-up 7s ease-in infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .bubble {
      animation: none !important;
    }
  }

  .hero-body {
    position: relative;
    z-index: 1;
    max-width: 860px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .hero-layout {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    width: 100%;
  }

  .avatar-ring {
    flex-shrink: 0;
    width: 76px;
    height: 76px;
    border-radius: 50%;
    padding: 3px;
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
    background: radial-gradient(circle at 40% 35%, #fde68a, #fbbf24 55%, #f59e0b);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .avatar-img {
    width: 80%;
    height: auto;
  }

  .hero-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .hero-eyebrow {
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--color-beer-amber);
    opacity: 0.8;
  }

  .counter {
    display: flex;
    align-items: baseline;
    gap: 0.45rem;
  }

  .count {
    font-family: var(--font-display);
    font-size: clamp(1.9rem, 8vw, 3rem);
    color: var(--color-beer-head);
    letter-spacing: 0.02em;
    line-height: 1.05;
    font-variant-numeric: tabular-nums;
  }

  .counter-label {
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .progress-wrap {
    width: 100%;
    max-width: 440px;
    margin-top: 0.15rem;
  }

  .progress-track {
    height: 6px;
    border-radius: 9999px;
    background-color: var(--color-bg-surface);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    border-radius: 9999px;
    background: linear-gradient(90deg, var(--color-beer-dark), var(--color-beer-amber));
    box-shadow: 2px 0 8px var(--color-beer-amber);
    transition: width 1s ease-out;
  }

  .progress-labels {
    display: flex;
    justify-content: space-between;
    margin-top: 0.35rem;
    font-size: 0.72rem;
    color: var(--color-text-muted);
  }

  .progress-labels strong {
    font-weight: 700;
    color: var(--color-beer-foam);
  }

  /* Stats bar, flush onto the tab bar like the group header's */
  .hero-stats {
    display: flex;
    align-items: stretch;
    width: 100%;
    background: rgba(26, 18, 9, 0.75);
    border: 1px solid var(--color-border);
    border-bottom: none;
    border-radius: 0.85rem 0.85rem 0 0;
    padding: 0.65rem 0.5rem;
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
    font-size: clamp(1rem, 3.4vw, 1.3rem);
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

  @media (min-width: 640px) {
    .hero-card {
      padding: 1.75rem 2rem 0;
    }

    .hero-layout {
      gap: 1.5rem;
    }

    .avatar-ring {
      width: 92px;
      height: 92px;
    }
  }

  @media (min-width: 1024px) {
    .avatar-ring {
      width: 104px;
      height: 104px;
    }
  }

  .milestone-banner {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-display);
    font-size: clamp(1.5rem, 5vw, 2.5rem);
    font-weight: 800;
    color: var(--color-beer-head);
    text-shadow:
      0 0 30px rgba(245, 158, 11, 0.8),
      0 2px 8px rgba(245, 158, 11, 0.4);
    background: rgba(13, 8, 3, 0.92);
    border-radius: inherit;
    animation: count-glow 5s ease-out forwards;
    backdrop-filter: blur(4px);
  }

  @keyframes count-glow {
    0% {
      opacity: 0;
    }
    10% {
      opacity: 1;
    }
    80% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
</style>
