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

  const PODIUM_COLORS: Record<number, string> = {
    1: 'var(--color-rank-gold)',
    2: 'var(--color-rank-silver)',
    3: 'var(--color-rank-bronze)',
  }

  const name = (e: LeaderboardEntry) => e.user.displayName ?? e.user.pseudoName ?? 'Anonymous'
  const hasMore = $derived(entries.length < total)

  function standing(i: number): string {
    if (i === 0) return entries[0].rank === 1 ? 'Leading the group' : ''
    const above = entries[i - 1]
    const gap = above.beerCount - entries[i].beerCount
    return gap > 0 ? `${gap.toLocaleString()} behind #${above.rank}` : `Level with #${above.rank}`
  }
</script>

<div class="board">
  <div class="board-head">
    <h3 class="board-title">Leaderboard</h3>
    <span class="board-title">Beers</span>
  </div>

  {#if entries.length === 0}
    <p class="empty">No beers logged yet. Be the first!</p>
  {:else}
    <ol class="board-list">
      {#each entries as entry, i (entry.user.id)}
        {@const podiumColor = PODIUM_COLORS[entry.rank]}
        <li>
          <a
            href="/users/{entry.user.slug}"
            class="row"
            class:row--podium={podiumColor}
            style={podiumColor ? `--podium-color: ${podiumColor}` : undefined}
          >
            <span class="rank">{entry.rank}</span>
            <span class="avatar">
              {#if entry.user.countryCode}
                <CountryFlag countryCode={entry.user.countryCode} size={22} />
              {:else}
                <span class="initials">{getInitials(name(entry))}</span>
              {/if}
            </span>
            <span class="name-wrap">
              <span class="name">{name(entry)}</span>
              <span class="sub">{standing(i)}</span>
            </span>
            <span class="count">{entry.beerCount.toLocaleString()}</span>
          </a>
        </li>
      {/each}
    </ol>

    <div class="board-foot">
      <span class="foot-count">
        Showing {entries.length.toLocaleString()} of {total.toLocaleString()}
        {total === 1 ? 'drinker' : 'drinkers'}
      </span>
      {#if hasMore && onloadmore}
        <button class="more-btn" onclick={onloadmore} disabled={loading}>
          {loading ? 'Loading…' : 'Show more'}
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .board {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 0.75rem;
    padding: 0.875rem 1rem 0;
  }

  .board-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.6rem;
  }

  .board-title {
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .empty {
    padding: 2rem 0;
    text-align: center;
    color: var(--color-text-muted);
  }

  .board-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .board-list li + li {
    border-top: 1px solid var(--color-border);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.35rem 0;
    text-decoration: none;
  }

  /* Same treatment as the top three in the map's country list */
  .row--podium {
    box-shadow: inset 2px 0 0 var(--podium-color);
    background: linear-gradient(
      to right,
      color-mix(in srgb, var(--podium-color) 6%, transparent),
      transparent 60%
    );
  }

  .rank {
    width: 1.6rem;
    flex-shrink: 0;
    text-align: right;
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .row--podium .rank {
    color: var(--podium-color);
  }

  .avatar {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-surface);
  }

  .initials {
    font-family: var(--font-display);
    font-size: 0.55rem;
    font-weight: 700;
    color: var(--color-beer-head);
  }

  .name-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .name {
    font-size: 0.82rem;
    line-height: 1.25;
    color: var(--color-beer-foam);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row:hover .name {
    color: var(--color-beer-head);
  }

  .row--podium .name {
    font-weight: 600;
  }

  .sub {
    font-size: 0.65rem;
    line-height: 1.2;
    color: var(--color-text-muted);
  }

  .count {
    flex-shrink: 0;
    font-family: var(--font-display);
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--color-beer-amber);
    font-variant-numeric: tabular-nums;
  }

  .board-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
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
</style>
