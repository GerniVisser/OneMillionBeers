<script lang="ts">
  import type { LeaderboardEntry } from '@omb/shared'
  import { getInitials } from '$lib/utils'
  import CountryFlag from './CountryFlag.svelte'

  let {
    entries = [],
    total = entries.length,
    loading = false,
    onloadmore,
  }: {
    entries: LeaderboardEntry[]
    total?: number
    loading?: boolean
    onloadmore?: () => void
  } = $props()

  const RANK_COLORS: Record<number, string> = {
    1: 'var(--color-rank-gold)',
    2: 'var(--color-rank-silver)',
    3: 'var(--color-rank-bronze)',
  }

  const name = (e: LeaderboardEntry) => e.user.displayName ?? e.user.pseudoName ?? 'Anonymous'
  const rankColor = (rank: number) => RANK_COLORS[rank] ?? 'var(--color-beer-amber)'

  const podium = $derived(entries.slice(0, 3))
  const rest = $derived(entries.slice(3))
  const leaderCount = $derived(entries[0]?.beerCount ?? 0)
  const hasMore = $derived(entries.length < total)

  // Shown left to right as 2nd, 1st, 3rd so the leader stands in the middle.
  const podiumOrder = $derived(
    [podium[1], podium[0], podium[2]].filter((e): e is LeaderboardEntry => !!e),
  )
</script>

<section class="board" aria-label="Group leaderboard">
  {#if entries.length === 0}
    <p class="empty">No beers logged yet. Be the first!</p>
  {:else}
    <div class="stage">
      <div class="stage-glow" aria-hidden="true"></div>
      <header class="board-head">
        <h2 class="board-title">Group leaders</h2>
        <span class="board-meta"
          >{total.toLocaleString()} {total === 1 ? 'drinker' : 'drinkers'}</span
        >
      </header>

      <ol class="podium" aria-label="Top three">
        {#each podiumOrder as entry (entry.user.id)}
          <li
            class="podium-spot"
            class:podium-spot--first={entry === podium[0]}
            class:podium-spot--third={entry === podium[2]}
            style="--rank-color: {rankColor(entry.rank)}"
          >
            <a href="/users/{entry.user.slug}" class="podium-person">
              <span class="ring">
                <span class="ring-inner">
                  {#if entry.user.countryCode}
                    <CountryFlag countryCode={entry.user.countryCode} size={72} />
                  {:else}
                    <span class="initials">{getInitials(name(entry))}</span>
                  {/if}
                </span>
              </span>
              <span class="podium-name">{name(entry)}</span>
            </a>
            <span class="pedestal">
              <span class="pedestal-rank" aria-label="Rank {entry.rank}">#{entry.rank}</span>
              <span class="pedestal-count">{entry.beerCount.toLocaleString()}</span>
              <span class="pedestal-unit">beers</span>
            </span>
          </li>
        {/each}
      </ol>
    </div>

    {#if rest.length > 0}
      <ol class="rows">
        {#each rest as entry, i (entry.user.id)}
          {@const above = i === 0 ? podium[podium.length - 1] : rest[i - 1]}
          {@const gap = above.beerCount - entry.beerCount}
          <li>
            <a href="/users/{entry.user.slug}" class="row">
              <span class="row-rank">{entry.rank}</span>
              <span class="row-avatar">
                {#if entry.user.countryCode}
                  <CountryFlag countryCode={entry.user.countryCode} size={28} />
                {:else}
                  <span class="initials initials--small">{getInitials(name(entry))}</span>
                {/if}
              </span>
              <span class="row-main">
                <span class="row-name">{name(entry)}</span>
                <span class="row-bar" aria-hidden="true">
                  <span
                    class="row-bar-fill"
                    style="width: {leaderCount ? (entry.beerCount / leaderCount) * 100 : 0}%"
                  ></span>
                </span>
              </span>
              <span class="row-score">
                <span class="row-count">{entry.beerCount.toLocaleString()}</span>
                <span class="row-gap">
                  {gap > 0
                    ? `${gap.toLocaleString()} behind #${above.rank}`
                    : `Level with #${above.rank}`}
                </span>
              </span>
            </a>
          </li>
        {/each}
      </ol>
    {/if}

    <div class="board-foot">
      <span class="foot-count">
        Showing {entries.length.toLocaleString()} of {total.toLocaleString()}
      </span>
      {#if hasMore && onloadmore}
        <button class="more-btn" onclick={onloadmore} disabled={loading}>
          {loading ? 'Loading…' : 'Show more'}
        </button>
      {/if}
    </div>
  {/if}
</section>

<style>
  .board {
    overflow: hidden;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 0.85rem;
  }

  .empty {
    padding: 2rem 0;
    text-align: center;
    color: var(--color-text-muted);
  }

  /* ── Podium stage: the header gradient and glow ─────────── */
  .stage {
    position: relative;
    overflow: hidden;
    padding: 1rem 0.85rem 0;
    background: linear-gradient(165deg, #0d0803 0%, #1e1005 45%, #2d1a08 80%, #3d2510 100%);
    border-bottom: 1px solid #5c3d1a;
  }

  .stage-glow {
    position: absolute;
    top: -90px;
    left: 50%;
    transform: translateX(-50%);
    width: 300px;
    height: 300px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(245, 158, 11, 0.16) 0%, transparent 65%);
    pointer-events: none;
  }

  .board-head {
    position: relative;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .board-title {
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--color-beer-amber);
    opacity: 0.85;
  }

  .board-meta {
    font-size: 0.68rem;
    color: var(--color-text-muted);
  }

  .podium {
    position: relative;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: end;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .podium-spot {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 0;
  }

  .podium-person {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    min-width: 0;
    gap: 0.45rem;
    padding-bottom: 0.6rem;
    text-decoration: none;
  }

  /* The group avatar's ring, slimmer */
  .ring {
    width: 3.2rem;
    height: 3.2rem;
    border-radius: 50%;
    padding: 2px;
    background: conic-gradient(
      from 0deg,
      var(--rank-color),
      color-mix(in srgb, var(--rank-color) 45%, #2d1a08) 35%,
      var(--rank-color) 50%,
      color-mix(in srgb, var(--rank-color) 45%, #2d1a08) 65%,
      var(--rank-color)
    );
  }

  .podium-spot--first .ring {
    width: 4rem;
    height: 4rem;
    padding: 2.5px;
    box-shadow: 0 0 22px rgba(189, 109, 9, 0.35);
  }

  .ring-inner {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    overflow: hidden;
    background: radial-gradient(circle at 40% 35%, #2d1a08, #1a0f05);
  }

  .initials {
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 800;
    color: var(--color-beer-head);
  }

  .podium-name {
    max-width: 100%;
    font-family: var(--font-display);
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--color-beer-foam);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .podium-person:hover .podium-name {
    color: var(--color-beer-head);
  }

  /* Pedestals take the header stats bar's look */
  .pedestal {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 0.1rem;
    width: 100%;
    padding: 0.5rem 0.25rem 0.6rem;
    background: rgba(26, 18, 9, 0.75);
    border: 1px solid var(--color-border);
    border-top: 2px solid var(--rank-color);
    border-bottom: none;
    border-radius: 0.6rem 0.6rem 0 0;
    backdrop-filter: blur(8px);
  }

  .podium-spot--first .pedestal {
    padding-bottom: 1.4rem;
  }

  .podium-spot--third .pedestal {
    padding-bottom: 0.3rem;
  }

  .pedestal-rank {
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--rank-color);
  }

  .pedestal-count {
    font-family: var(--font-display);
    font-size: clamp(1rem, 3.6vw, 1.3rem);
    font-weight: 700;
    line-height: 1;
    color: var(--color-beer-amber);
    font-variant-numeric: tabular-nums;
  }

  .podium-spot--first .pedestal-count {
    font-size: clamp(1.2rem, 4.4vw, 1.55rem);
  }

  .pedestal-unit {
    font-size: 0.52rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  /* ── Ranks 4+ ──────────────────────────────────────────── */
  .rows {
    margin: 0;
    padding: 0 0.85rem;
    list-style: none;
  }

  .rows li + li {
    border-top: 1px solid var(--color-border);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 0;
    text-decoration: none;
  }

  .row-rank {
    width: 1.5rem;
    flex-shrink: 0;
    text-align: right;
    font-family: var(--font-display);
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .row-avatar {
    flex-shrink: 0;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 50%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
  }

  .initials--small {
    font-size: 0.6rem;
  }

  .row-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .row-name {
    font-size: 0.84rem;
    color: var(--color-beer-foam);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row:hover .row-name {
    color: var(--color-beer-head);
  }

  /* Same bar as the hero progress bars */
  .row-bar {
    height: 4px;
    border-radius: 999px;
    background: var(--color-bg-surface);
    overflow: hidden;
  }

  .row-bar-fill {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--color-beer-dark), var(--color-beer-amber));
  }

  .row-score {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    min-width: 4.5rem;
  }

  .row-count {
    font-family: var(--font-display);
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--color-beer-amber);
    font-variant-numeric: tabular-nums;
  }

  .row-gap {
    font-size: 0.6rem;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .board-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin: 0 0.85rem;
    padding: 0.6rem 0 0.75rem;
    border-top: 1px solid var(--color-border);
  }

  .foot-count {
    font-size: 0.7rem;
    color: var(--color-text-muted);
  }

  .more-btn {
    padding: 0.35rem 0.9rem;
    border-radius: 9999px;
    border: 1px solid var(--color-border);
    background: var(--color-bg-surface);
    color: var(--color-beer-amber);
    font-family: var(--font-body);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      border-color 120ms ease,
      color 120ms ease;
  }

  .more-btn:hover:not(:disabled) {
    border-color: var(--color-beer-amber);
    color: var(--color-beer-head);
  }

  .more-btn:disabled {
    cursor: default;
    opacity: 0.6;
  }

  @media (min-width: 640px) {
    .stage {
      padding: 1.25rem 1.5rem 0;
    }

    .podium {
      gap: 0.9rem;
      max-width: 540px;
      margin: 0 auto;
    }

    .ring {
      width: 3.8rem;
      height: 3.8rem;
    }

    .podium-spot--first .ring {
      width: 4.8rem;
      height: 4.8rem;
    }

    .rows {
      padding: 0 1.5rem;
    }

    .board-foot {
      margin: 0 1.5rem;
    }
  }
</style>
