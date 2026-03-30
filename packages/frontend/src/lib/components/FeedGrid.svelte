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
  <div class="feed-grid">
    {#each { length: 8 } as _}
      <div class="skeleton"></div>
    {/each}
  </div>
{:else if items.length === 0}
  <p class="empty">No beers logged yet. Be the first!</p>
{:else}
  <div class="feed-grid">
    {#each items as item (item.id)}
      <BeerCard {item} isNew={item.id === newestId} {onlongpress} />
    {/each}
  </div>
{/if}

<style>
  .feed-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.625rem;
  }

  @media (min-width: 480px) {
    .feed-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @media (min-width: 1024px) {
    .feed-grid {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  .skeleton {
    aspect-ratio: 4 / 5;
    border-radius: 0.75rem;
    background-color: var(--color-bg-card);
    border: 1px solid var(--color-border);
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  .empty {
    text-align: center;
    color: var(--color-text-muted);
    font-size: 0.9rem;
    padding: 2rem 0;
  }
</style>
