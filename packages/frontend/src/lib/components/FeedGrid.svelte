<script lang="ts">
  import type { FeedItem } from '@omb/shared'
  import BeerCard from './BeerCard.svelte'

  let {
    items = [],
    loading = false,
    newestId = '',
    onlongpress,
  }: {
    items?: FeedItem[]
    loading?: boolean
    newestId?: string
    onlongpress?: (item: FeedItem) => void
  } = $props()
</script>

{#if loading}
  <div class="grid" aria-busy="true" aria-label="Loading feed">
    {#each { length: 9 } as _, i}
      <div class="skeleton-card" style="animation-delay: {(i % 3) * 120}ms"></div>
    {/each}
  </div>
{:else if items.length === 0}
  <p class="empty">No beers logged yet. Be the first!</p>
{:else}
  <div class="grid">
    {#each items as item (item.id)}
      <BeerCard {item} isNew={item.id === newestId} {onlongpress} />
    {/each}
  </div>
{/if}

<style>
  /* ── Feed grid ──────────────────────────────────────────────────────── */

  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    width: 100%;
  }

  @media (min-width: 600px) {
    .grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @media (min-width: 900px) {
    .grid {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  /* ── Skeleton loading state ─────────────────────────────────────────── */

  .skeleton-card {
    /* Match BeerCard's fixed aspect-ratio so the skeleton has the same size */
    aspect-ratio: 3 / 4;
    border-radius: 0.75rem;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    animation: pulse 1.6s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }

  /* ── Empty state ────────────────────────────────────────────────────── */

  .empty {
    text-align: center;
    color: var(--color-text-muted);
    font-size: 0.9rem;
    padding: 2rem 0;
  }
</style>
