<script lang="ts">
  import type { FeedItem } from '@omb/shared'
  import BeerCard from './BeerCard.svelte'

  let { items = [], loading = false }: { items: FeedItem[]; loading?: boolean } = $props()

  const SKELETON_COUNT = 8
</script>

<div
  style="
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  "
  class="feed-grid"
>
  {#if loading}
    {#each Array(SKELETON_COUNT) as _, i (i)}
      <div
        class="card"
        style="
          border-radius: 1rem;
          overflow: hidden;
          animation: pulse 2s ease-in-out infinite;
        "
      >
        <div style="aspect-ratio: 1; background-color: var(--color-bg-surface);"></div>
        <div style="padding: 0.75rem;">
          <div
            style="height: 12px; background-color: var(--color-bg-surface); border-radius: 6px; margin-bottom: 6px; width: 60%;"
          ></div>
          <div
            style="height: 10px; background-color: var(--color-bg-surface); border-radius: 6px; width: 40%;"
          ></div>
        </div>
      </div>
    {/each}
  {:else}
    {#each items as item (item.id)}
      <BeerCard {item} />
    {/each}
  {/if}
</div>

<style>
  @media (min-width: 640px) {
    .feed-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @media (min-width: 1024px) {
    .feed-grid {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
</style>
