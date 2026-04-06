<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { browser } from '$app/environment'
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

  let gridEl = $state<HTMLElement | undefined>()
  let masonry: import('masonry-layout') | undefined

  async function initMasonry() {
    if (!browser || !gridEl) return
    const Masonry = (await import('masonry-layout')).default
    masonry = new Masonry(gridEl, {
      itemSelector: '.masonry-item',
      columnWidth: '.masonry-sizer',
      percentPosition: true,
      gutter: 10,
      transitionDuration: '0.2s',
    })
  }

  async function relayout() {
    await tick()
    masonry?.reloadItems?.()
    masonry?.layout?.()
  }

  onMount(() => {
    initMasonry()
    return () => {
      masonry?.destroy?.()
    }
  })

  // Re-layout whenever items change (new cards added / images load)
  $effect(() => {
    void items
    relayout()
  })
</script>

{#if loading}
  <div class="feed-grid">
    {#each { length: 8 } as _}
      <div class="masonry-item skeleton"></div>
    {/each}
  </div>
{:else if items.length === 0}
  <p class="empty">No beers logged yet. Be the first!</p>
{:else}
  <div class="feed-grid" bind:this={gridEl}>
    <!-- Sizer element controls column width for Masonry -->
    <div class="masonry-sizer"></div>
    {#each items as item (item.id)}
      <div class="masonry-item">
        <BeerCard {item} isNew={item.id === newestId} {onlongpress} onimageload={relayout} />
      </div>
    {/each}
  </div>
{/if}

<style>
  .feed-grid {
    /* Masonry uses absolute positioning; position:relative anchors children */
    position: relative;
    width: 100%;
  }

  /* Sizer and items: 3 columns always */
  .masonry-sizer,
  :global(.masonry-item) {
    width: calc(33.333% - 7px);
    margin-bottom: 10px;
  }

  .skeleton {
    aspect-ratio: 4 / 5;
    border-radius: 0.75rem;
    background-color: var(--color-bg-card);
    border: 1px solid var(--color-border);
    animation: pulse 2s ease-in-out infinite;
    /* Give skeletons varying heights for a natural pre-load feel */
  }

  .skeleton:nth-child(3n) {
    aspect-ratio: 3 / 4;
  }
  .skeleton:nth-child(3n + 1) {
    aspect-ratio: 1 / 1;
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
