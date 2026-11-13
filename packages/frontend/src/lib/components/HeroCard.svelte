<script lang="ts">
  import { untrack } from 'svelte'

  let {
    count = 0,
    sessionCount = 0,
    flashCount = 0,
  }: {
    count: number
    sessionCount?: number
    flashCount?: number
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
  <!-- Foam bubbles background -->
  <div aria-hidden="true" class="bubbles-wrap">
    {#each bubbles as b (b.id)}
      <div
        class="bubble"
        style="left: {b.left}; width: {b.size}; height: {b.size}; opacity: {b.opacity}; animation-delay: {b.delay}; animation-duration: {b.duration};"
      ></div>
    {/each}
  </div>

  <div class="hero-content">
    <div class="brand">
      <img class="brand-logo" src="/logo.svg" alt="" width="80" height="80" />
      <div class="brand-text">
        <h1 class="hero-title">One Million Beers</h1>
        <div aria-live="polite" aria-label="{count} beers logged" class="counter">
          <span class="count glow-amber" bind:this={countEl}>{formatted}</span>
          <span class="counter-label">beers and counting</span>
        </div>
      </div>
    </div>

    <div class="progress-wrap">
      <div class="progress-labels">
        <span><strong>{pct}%</strong> of the way to 1,000,000</span>
        <span>{remaining} to go</span>
      </div>
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
    padding: 1.25rem 1rem 1.1rem;
    background: linear-gradient(135deg, #0d0803 0%, #1e1005 40%, #2d1a08 75%, #3d2510 100%);
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

  .hero-content {
    position: relative;
    z-index: 1;
    max-width: 560px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    text-align: left;
  }

  .brand-logo {
    width: 4rem;
    height: 4rem;
    flex-shrink: 0;
    filter: drop-shadow(0 4px 16px rgba(245, 158, 11, 0.25));
  }

  .brand-text {
    min-width: 0;
  }

  .hero-title {
    font-family: var(--font-body);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--color-beer-head);
  }

  .counter {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    column-gap: 0.5rem;
  }

  .count {
    font-family: var(--font-display);
    font-size: clamp(2.1rem, 9vw, 3.25rem);
    font-weight: 600;
    line-height: 1.05;
    color: var(--color-beer-amber);
    font-variant-numeric: tabular-nums;
  }

  .counter-label {
    font-family: var(--font-body);
    color: var(--color-text-muted);
    font-size: 0.8rem;
    letter-spacing: 0.03em;
  }

  @media (min-width: 600px) {
    .brand {
      gap: 1.25rem;
    }

    .brand-logo {
      width: 5rem;
      height: 5rem;
    }
  }

  .progress-wrap {
    width: 100%;
  }

  .progress-labels {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.35rem;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .progress-labels strong {
    font-weight: 700;
    color: var(--color-beer-foam);
  }

  .progress-track {
    height: 0.7rem;
    border-radius: 9999px;
    background: rgba(13, 8, 3, 0.85);
    border: 1px solid rgba(245, 158, 11, 0.25);
    overflow: hidden;
  }

  /* Beer with a thin foam head where it ends */
  .progress-fill {
    position: relative;
    height: 100%;
    border-radius: 9999px;
    background: linear-gradient(
      90deg,
      var(--color-beer-dark),
      var(--color-beer-amber),
      var(--color-accent-glow)
    );
    box-shadow: 0 0 8px rgba(245, 158, 11, 0.35);
    transition: width 1s ease-out;
  }

  .progress-fill::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 0.35rem;
    border-radius: 9999px;
    background: #fff7e0;
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
