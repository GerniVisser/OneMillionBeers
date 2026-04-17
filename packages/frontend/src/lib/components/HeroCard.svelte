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

  const DIGITS = 7
  const digits = $derived(String(count).padStart(DIGITS, '0').split(''))
  const pct = $derived(Math.min((count / TARGET) * 100, 100).toFixed(2))
  const formatted = $derived(count.toLocaleString())

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
    <!-- Live badge -->
    <div class="badge-wrap">
      <span class="live-badge">
        <span class="live-dot"></span>
        LIVE
      </span>
    </div>

    <h1 class="hero-title glow-amber">One Million Beers</h1>

    <!-- Counter -->
    <div aria-live="polite" aria-label="{count} beers logged" class="counter-wrap">
      <div class="digits" bind:this={countEl}>
        {#each digits as digit, i (i)}
          <span class="digit">{digit}</span>
        {/each}
      </div>
      <p class="counter-label">beers and counting</p>
    </div>

    <!-- Progress bar -->
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
        <span>{formatted} / 1,000,000</span>
        <span>{pct}%</span>
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
    padding: 1.5rem 1rem 1.25rem;
    text-align: center;
    background: linear-gradient(135deg, #0d0803 0%, #1e1005 40%, #2d1a08 75%, #3d2510 100%);
    border-radius: 1rem;
    border: 1px solid #5c3d1a;
    box-shadow:
      0 0 0 1px rgba(245, 158, 11, 0.08),
      0 8px 48px rgba(0, 0, 0, 0.6),
      inset 0 1px 0 rgba(245, 158, 11, 0.12);
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
    max-width: 500px;
    margin: 0 auto;
  }

  .badge-wrap {
    margin-bottom: 0.5rem;
  }

  .live-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    background-color: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.4);
    border-radius: 9999px;
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    color: var(--color-beer-amber);
    text-transform: uppercase;
    box-shadow: 0 0 12px rgba(245, 158, 11, 0.15);
  }

  .live-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-beer-amber);
    animation: pulse-dot 1.5s ease-in-out infinite;
  }

  .hero-title {
    font-family: var(--font-display);
    font-size: clamp(1.25rem, 4vw, 1.75rem);
    color: var(--color-beer-head);
    letter-spacing: 0.05em;
    margin-bottom: 0.75rem;
  }

  .counter-wrap {
    text-align: center;
    margin-bottom: 0.75rem;
  }

  .digits {
    display: inline-flex;
    gap: 0.125rem;
  }

  .digit {
    font-family: var(--font-display);
    font-size: clamp(2rem, 7vw, 3.5rem);
    line-height: 1;
    color: var(--color-beer-amber);
    display: inline-block;
    text-shadow:
      0 0 20px rgba(245, 158, 11, 0.6),
      0 0 40px rgba(245, 158, 11, 0.3);
  }

  .counter-label {
    font-family: var(--font-body);
    color: var(--color-text-muted);
    font-size: 0.8rem;
    margin-top: 0.25rem;
    letter-spacing: 0.05em;
  }

  .progress-wrap {
    width: 100%;
  }

  .progress-track {
    background-color: var(--color-bg-surface);
    border-radius: 9999px;
    height: 8px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(
      90deg,
      var(--color-beer-dark),
      var(--color-beer-amber),
      var(--color-accent-glow)
    );
    border-radius: 9999px;
    transition: width 1s ease-out;
  }

  .progress-labels {
    display: flex;
    justify-content: space-between;
    margin-top: 0.25rem;
    font-size: 0.7rem;
    color: var(--color-text-muted);
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
