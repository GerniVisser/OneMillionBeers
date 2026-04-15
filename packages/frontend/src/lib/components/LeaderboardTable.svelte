<script lang="ts">
  import type { LeaderboardEntry } from '@omb/shared'

  let {
    entries = [],
    title = 'Leaderboard',
  }: {
    entries: LeaderboardEntry[]
    title?: string
  } = $props()

  function rankColor(rank: number): string {
    if (rank === 1) return 'var(--color-rank-gold)'
    if (rank === 2) return 'var(--color-rank-silver)'
    if (rank === 3) return 'var(--color-rank-bronze)'
    return 'var(--color-text-muted)'
  }
</script>

<div class="card" style="padding: 1.25rem;">
  {#if title}
    <h2
      style="
        font-family: var(--font-display);
        font-size: 1.5rem;
        color: var(--color-beer-amber);
        letter-spacing: 0.05em;
        margin-bottom: 1rem;
      "
    >
      {title}
    </h2>
  {/if}

  {#if entries.length === 0}
    <p style="color: var(--color-text-muted); text-align: center; padding: 2rem 0;">
      No entries yet. Be the first!
    </p>
  {:else}
    <ol
      style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem;"
    >
      {#each entries as entry (entry.user.id)}
        <li
          style="
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.5rem 0.75rem;
            border-radius: 0.5rem;
            background-color: {entry.rank <= 3 ? 'var(--color-bg-surface)' : 'transparent'};
          "
        >
          <span
            style="
              font-family: var(--font-display);
              font-size: 1.25rem;
              color: {rankColor(entry.rank)};
              min-width: 2rem;
              text-align: center;
              line-height: 1;
            "
          >
            {entry.rank}
          </span>
          <a
            href="/users/{entry.user.slug}"
            style="
              flex: 1;
              min-width: 0;
              color: var(--color-beer-foam);
              font-weight: 500;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            "
          >
            {entry.user.displayName ?? entry.user.pseudoName ?? 'Anonymous'}
          </a>
          <span
            style="
              font-family: var(--font-display);
              font-size: 1.1rem;
              color: var(--color-beer-amber);
              white-space: nowrap;
            "
          >
            {entry.beerCount} 🍺
          </span>
        </li>
      {/each}
    </ol>
  {/if}
</div>
