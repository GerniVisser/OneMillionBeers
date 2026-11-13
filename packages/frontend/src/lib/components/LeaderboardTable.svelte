<script lang="ts">
  import type { LeaderboardEntry } from '@omb/shared'
  import { getInitials } from '$lib/utils'
  import CountryFlag from './CountryFlag.svelte'

  let {
    entries = [],
    title = 'Leaderboard',
  }: {
    entries: LeaderboardEntry[]
    title?: string
  } = $props()

  const RANK_COLORS: Record<number, string> = {
    1: 'var(--color-rank-gold)',
    2: 'var(--color-rank-silver)',
    3: 'var(--color-rank-bronze)',
  }

  const name = (e: LeaderboardEntry) => e.user.displayName ?? e.user.pseudoName ?? 'Anonymous'
  const rankColor = (rank: number) => RANK_COLORS[rank] ?? 'var(--color-text-muted)'

  const podium = $derived(entries.slice(0, 3))
  const rest = $derived(entries.slice(3))
  const leaderCount = $derived(entries[0]?.beerCount ?? 0)

  // Shown left to right as 2nd, 1st, 3rd so the leader stands in the middle.
  const podiumOrder = $derived(
    [podium[1], podium[0], podium[2]].filter((e): e is LeaderboardEntry => !!e),
  )
</script>

<section class="board" aria-label={title}>
  <header class="board-head">
    <h2 class="board-title">{title}</h2>
    {#if entries.length > 0}
      <span class="board-meta">Top {entries.length} · all time</span>
    {/if}
  </header>

  {#if entries.length === 0}
    <p class="empty">No beers logged yet. Be the first!</p>
  {:else}
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
              <span class="rank-chip" aria-label="Rank {entry.rank}">{entry.rank}</span>
            </span>
            <span class="podium-name">{name(entry)}</span>
            <span class="podium-count">{entry.beerCount.toLocaleString()}</span>
            <span class="podium-unit">beers</span>
          </a>
          <span class="pedestal" aria-hidden="true"></span>
        </li>
      {/each}
    </ol>

    {#if rest.length > 0}
      <ol class="rows" start={rest[0].rank}>
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
                {#if gap > 0}
                  <span class="row-gap">{gap.toLocaleString()} behind #{above.rank}</span>
                {/if}
              </span>
            </a>
          </li>
        {/each}
      </ol>
    {/if}
  {/if}
</section>

<style>
  .board {
    background:
      radial-gradient(ellipse at 50% 0%, rgba(245, 158, 11, 0.12), transparent 60%),
      var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 0.85rem;
    padding: 1rem 0.85rem 0.75rem;
  }

  .board-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 1.1rem;
  }

  .board-title {
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--color-beer-amber);
  }

  .board-meta {
    font-size: 0.68rem;
    color: var(--color-text-muted);
  }

  .empty {
    padding: 2rem 0;
    text-align: center;
    color: var(--color-text-muted);
  }

  /* ── Podium ─────────────────────────────────────────────── */
  .podium {
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
    text-decoration: none;
    padding-bottom: 0.55rem;
  }

  .ring {
    position: relative;
    width: 3.4rem;
    height: 3.4rem;
    border-radius: 50%;
    padding: 2.5px;
    background: conic-gradient(
      from 0deg,
      var(--rank-color),
      color-mix(in srgb, var(--rank-color) 55%, #2d1a08) 35%,
      var(--rank-color) 50%,
      color-mix(in srgb, var(--rank-color) 55%, #2d1a08) 65%,
      var(--rank-color)
    );
    box-shadow: 0 0 22px color-mix(in srgb, var(--rank-color) 35%, transparent);
    margin-bottom: 0.65rem;
  }

  .podium-spot--first .ring {
    width: 4.4rem;
    height: 4.4rem;
    padding: 3px;
    box-shadow: 0 0 30px color-mix(in srgb, var(--rank-color) 50%, transparent);
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
    font-size: 1.1rem;
    font-weight: 800;
    color: var(--color-beer-head);
  }

  .rank-chip {
    position: absolute;
    left: 50%;
    bottom: -0.55rem;
    transform: translateX(-50%);
    min-width: 1.3rem;
    height: 1.3rem;
    padding: 0 0.3rem;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--rank-color);
    color: #1a0f05;
    font-family: var(--font-display);
    font-size: 0.72rem;
    font-weight: 800;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  }

  .podium-name {
    max-width: 100%;
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--color-beer-foam);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .podium-person:hover .podium-name {
    color: var(--color-beer-head);
  }

  .podium-count {
    margin-top: 0.15rem;
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 700;
    line-height: 1.1;
    color: var(--rank-color);
    font-variant-numeric: tabular-nums;
  }

  .podium-spot--first .podium-count {
    font-size: 1.55rem;
    text-shadow: 0 0 18px color-mix(in srgb, var(--rank-color) 45%, transparent);
  }

  .podium-unit {
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .pedestal {
    width: 100%;
    height: 1.6rem;
    border-radius: 0.5rem 0.5rem 0 0;
    border-top: 2px solid var(--rank-color);
    background: linear-gradient(
      to bottom,
      color-mix(in srgb, var(--rank-color) 22%, transparent),
      transparent
    );
  }

  .podium-spot--first .pedestal {
    height: 2.6rem;
  }

  .podium-spot--third .pedestal {
    height: 1rem;
  }

  /* ── Ranks 4+ ──────────────────────────────────────────── */
  .rows {
    margin: 0.5rem 0 0;
    padding: 0;
    list-style: none;
    border-top: 1px solid var(--color-border);
  }

  .rows li + li {
    border-top: 1px solid var(--color-border-muted);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.55rem 0.15rem;
    text-decoration: none;
  }

  .row-rank {
    width: 1.3rem;
    flex-shrink: 0;
    text-align: right;
    font-family: var(--font-display);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--color-text-muted);
  }

  .row-avatar {
    flex-shrink: 0;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
  }

  .initials--small {
    font-size: 0.65rem;
  }

  .row-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .row-name {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--color-beer-foam);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row:hover .row-name {
    color: var(--color-beer-head);
  }

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
    font-size: 1rem;
    font-weight: 700;
    color: var(--color-beer-amber);
    font-variant-numeric: tabular-nums;
  }

  .row-gap {
    font-size: 0.6rem;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  @media (min-width: 640px) {
    .board {
      padding: 1.25rem 1.5rem 1rem;
    }

    .podium {
      gap: 1rem;
      max-width: 560px;
      margin: 0 auto;
    }

    .ring {
      width: 4.25rem;
      height: 4.25rem;
    }

    .podium-spot--first .ring {
      width: 5.5rem;
      height: 5.5rem;
    }

    .podium-name {
      font-size: 0.85rem;
    }
  }
</style>
