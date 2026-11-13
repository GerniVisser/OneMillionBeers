<script lang="ts">
  import type { ActivityDay } from '@omb/shared'

  let {
    count,
    days,
    target = 1_000_000,
    title,
  }: {
    count: number
    days: ActivityDay[]
    target?: number
    /** Defaults to "Road to <target>". */
    title?: string
  } = $props()

  const WINDOW_DAYS = 30

  // Activity dates are UTC calendar days, so the window is counted in UTC too.
  const perDay = $derived.by(() => {
    const since = new Date(Date.now() - (WINDOW_DAYS - 1) * 86_400_000).toISOString().slice(0, 10)
    return days.filter((d) => d.date >= since).reduce((sum, d) => sum + d.count, 0) / WINDOW_DAYS
  })
  const remaining = $derived(Math.max(target - count, 0))
  const eta = $derived(perDay > 0 ? new Date(Date.now() + (remaining / perDay) * 86_400_000) : null)
  const etaLabel = $derived(
    eta?.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) ?? null,
  )
  const pct = $derived(Math.min((count / target) * 100, 100))
  // Under one a day reads as "0", so slower drinkers get a weekly rate.
  const rate = $derived(
    perDay >= 1
      ? `${Math.round(perDay).toLocaleString()} beers a day`
      : `${Math.max(1, Math.round(perDay * 7))} ${Math.round(perDay * 7) === 1 ? 'beer' : 'beers'} a week`,
  )
</script>

<section class="pace">
  <div class="pace-glow" aria-hidden="true"></div>
  <p class="pace-eyebrow">{title ?? `Road to ${target.toLocaleString()}`}</p>
  {#if etaLabel}
    <p class="pace-eta"><span class="pace-eta-prefix">On pace for</span> {etaLabel}</p>
    <p class="pace-sub">
      About <strong>{rate}</strong> over the last {WINDOW_DAYS} days · {remaining.toLocaleString()} to
      go
    </p>
  {:else}
    <p class="pace-eta">{remaining.toLocaleString()} to go</p>
    <p class="pace-sub">No beers in the last {WINDOW_DAYS} days to set a pace from.</p>
  {/if}
  <div class="pace-track" aria-hidden="true">
    <div class="pace-fill" style="width: {pct}%"></div>
  </div>
</section>

<style>
  .pace {
    position: relative;
    overflow: hidden;
    padding: 1rem 1.1rem 1.1rem;
    border-radius: 0.75rem;
    border: 1px solid #5c3d1a;
    background: linear-gradient(165deg, #0d0803 0%, #1e1005 45%, #2d1a08 80%, #3d2510 100%);
  }

  .pace-glow {
    position: absolute;
    top: -120px;
    right: -60px;
    width: 300px;
    height: 300px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(245, 158, 11, 0.16) 0%, transparent 65%);
    pointer-events: none;
  }

  .pace-eyebrow {
    position: relative;
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--color-beer-amber);
    opacity: 0.85;
  }

  .pace-eta {
    position: relative;
    margin-top: 0.3rem;
    font-family: var(--font-display);
    font-size: clamp(1.5rem, 6vw, 2.1rem);
    line-height: 1.1;
    color: var(--color-beer-head);
  }

  .pace-eta-prefix {
    font-size: 0.55em;
    color: var(--color-text-muted);
  }

  .pace-sub {
    position: relative;
    margin-top: 0.3rem;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .pace-sub strong {
    color: var(--color-beer-foam);
    font-weight: 700;
  }

  .pace-track {
    position: relative;
    height: 6px;
    margin-top: 0.8rem;
    border-radius: 9999px;
    background: var(--color-bg-surface);
    overflow: hidden;
  }

  .pace-fill {
    height: 100%;
    border-radius: 9999px;
    background: linear-gradient(90deg, var(--color-beer-dark), var(--color-beer-amber));
    box-shadow: 2px 0 8px var(--color-beer-amber);
  }
</style>
