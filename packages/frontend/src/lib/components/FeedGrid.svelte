<script lang="ts">
  import { onMount, tick, untrack } from 'svelte'
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

  onMount(() => {
    if (!browser) return

    // Tick ensures Svelte has committed the current items to the DOM.
    // Because BeerCard uses a fixed aspect-ratio, every item already has a
    // real, measurable height — Masonry can position the grid correctly on
    // the very first call without waiting for any images to load.
    tick().then(async () => {
      if (!gridEl) return
      const Masonry = (await import('masonry-layout')).default
      masonry = new Masonry(gridEl, {
        itemSelector: '.item',
        columnWidth: '.sizer',
        percentPosition: true,
        gutter: 10,
        transitionDuration: '0.15s',
      })
    })

    return () => masonry?.destroy?.()
  })

  // Re-layout whenever the items array changes (load-more appends or
  // navigation replaces the list). With fixed-ratio cards all items have
  // stable heights so a single reloadItems + layout is sufficient —
  // no per-image relayout is needed.
  $effect(() => {
    void items // reactive dependency
    untrack(async () => {
      if (!masonry) return
      await tick() // wait for Svelte to add/remove DOM nodes
      masonry.reloadItems?.()
      masonry.layout?.()
    })
  })
</script>

{#if loading}
  <!-- Skeleton grid uses plain CSS grid — no Masonry needed since all
       cards are the same fixed ratio. -->
  <div class="skeleton-grid" aria-busy="true" aria-label="Loading feed">
    {#each { length: 9 } as _, i}
      <div class="skeleton-card" style="animation-delay: {(i % 3) * 120}ms"></div>
    {/each}
  </div>
{:else if items.length === 0}
  <p class="empty">No beers logged yet. Be the first!</p>
{:else}
  <div class="grid" bind:this={gridEl}>
    <!-- Zero-width sizer element tells Masonry the column width -->
    <div class="sizer" aria-hidden="true"></div>
    {#each items as item (item.id)}
      <div class="item">
        <BeerCard {item} isNew={item.id === newestId} {onlongpress} />
      </div>
    {/each}
  </div>
{/if}

<style>
  /* ── Masonry grid ───────────────────────────────────────────────────── */

  .grid {
    /* Masonry absolutely positions children; this anchors them */
    position: relative;
    width: 100%;
  }

  /* Column width: 3 columns with 10px gutters on each side */
  .sizer,
  :global(.item) {
    width: calc(33.333% - 7px);
    margin-bottom: 10px;
  }

  /* ── Skeleton loading state ─────────────────────────────────────────── */

  /* Use CSS grid for skeletons — same 3-column layout without Masonry */
  .skeleton-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

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
