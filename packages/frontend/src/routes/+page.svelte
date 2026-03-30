<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import type { PageData } from './$types'
  import type { FeedItem, SseEvent } from '@omb/shared'
  import { subscribeToStream } from '$lib/sse'
  import HeroCard from '$lib/components/HeroCard.svelte'
  import FeedGrid from '$lib/components/FeedGrid.svelte'
  import LoadMoreButton from '$lib/components/LoadMoreButton.svelte'
  import LeaderboardTable from '$lib/components/LeaderboardTable.svelte'
  import BeerFlash from '$lib/components/BeerFlash.svelte'
  import BeerToast from '$lib/components/BeerToast.svelte'
  import StatsStrip from '$lib/components/StatsStrip.svelte'
  import BeerLightbox from '$lib/components/BeerLightbox.svelte'
  import type { Toast } from '$lib/components/BeerToast.svelte'

  let { data }: { data: PageData } = $props()

  // untrack: intentional one-time capture of SSR data; state is then managed independently (SSE + load-more)
  let liveCount = $state(untrack(() => data.count))
  let feedItems = $state<FeedItem[]>(untrack(() => data.feed.items))
  let feedOffset = $state(untrack(() => data.feed.items.length))
  let feedTotal = $state(untrack(() => data.feed.total))
  let loadingMore = $state(false)
  // Tracks beers logged since page load via SSE (proxy for "today" until API provides it)
  let sessionCount = $state(0)

  // New effect triggers
  let flashCount = $state(0)
  let lightboxItem = $state<FeedItem | null>(null)
  let newestId = $state('')
  let toasts = $state<Toast[]>([])
  let mountTime = $state(Date.now())
  let tick = $state(0) // increments every 60s to refresh rate calculation

  const hasMore = $derived(feedOffset < feedTotal)

  // Beers per hour since page load (re-evaluates on each tick)
  const sseRate = $derived.by(() => {
    void tick // reactive dependency
    const elapsedHours = (Date.now() - mountTime) / 3_600_000
    return elapsedHours < 0.01 ? 0 : Math.round(sessionCount / elapsedHours)
  })

  function transformSseToFeedItem(latestBeer: NonNullable<SseEvent['latestBeer']>): FeedItem {
    return {
      id: latestBeer.id,
      photoUrl: latestBeer.photoUrl,
      loggedAt: latestBeer.loggedAt,
      user: {
        id: latestBeer.id,
        displayName: latestBeer.userName,
        slug: latestBeer.userName?.toLowerCase().replace(/\s+/g, '-') ?? 'anonymous',
      },
      group: {
        id: latestBeer.id,
        name: latestBeer.groupName,
        slug: latestBeer.groupName.toLowerCase().replace(/\s+/g, '-'),
      },
    }
  }

  onMount(() => {
    // Rate tick: re-derive sseRate every 60s
    const tickId = setInterval(() => {
      tick++
    }, 60_000)

    const unsub = subscribeToStream((event: SseEvent) => {
      liveCount = event.count
      sessionCount += 1
      flashCount += 1

      if (event.latestBeer) {
        const item = transformSseToFeedItem(event.latestBeer)
        if (!feedItems.some((f) => f.id === item.id)) {
          feedItems = [item, ...feedItems]
          feedOffset += 1
          feedTotal += 1
          newestId = item.id
          setTimeout(() => {
            if (newestId === item.id) newestId = ''
          }, 2000)
        }
        const toast: Toast = {
          id: event.latestBeer.id,
          photoUrl: event.latestBeer.photoUrl,
          userName: event.latestBeer.userName,
          groupName: event.latestBeer.groupName,
          ts: Date.now(),
        }
        toasts = [...toasts.slice(-2), toast]
        setTimeout(() => {
          toasts = toasts.filter((t) => t.id !== toast.id)
        }, 4500)
      }
    })

    return () => {
      clearInterval(tickId)
      unsub()
    }
  })

  async function loadMore() {
    if (loadingMore || !hasMore) return
    loadingMore = true
    try {
      const res = await fetch(`/api/v1/global/feed?limit=20&offset=${feedOffset}`)
      if (res.ok) {
        const pageData = (await res.json()) as { items: FeedItem[]; total: number }
        feedItems = [...feedItems, ...pageData.items]
        feedOffset += pageData.items.length
        feedTotal = pageData.total
      }
    } finally {
      loadingMore = false
    }
  }
</script>

<svelte:head>
  <title>OneMillionBeers — Live Beer Counter &amp; Leaderboard</title>
  <meta
    name="description"
    content="Track every beer logged across WhatsApp groups. Watch the live counter tick up, browse the photo feed, and see who's leading the race to one million."
  />
</svelte:head>

<BeerFlash trigger={flashCount} />
<BeerToast
  {toasts}
  ondismiss={(id) => {
    toasts = toasts.filter((t) => t.id !== id)
  }}
/>
<BeerLightbox
  item={lightboxItem}
  onclose={() => {
    lightboxItem = null
  }}
/>

<div class="page">
  <HeroCard count={liveCount} {sessionCount} {flashCount} />

  <StatsStrip count={liveCount} {sessionCount} leaderboard={data.leaderboard.entries} {sseRate} />

  <!-- Feed -->
  <section class="feed-section">
    <div class="section-header">
      <h2 class="section-title">Latest Beers</h2>
    </div>
    <FeedGrid
      items={feedItems}
      loading={loadingMore && feedItems.length === 0}
      {newestId}
      onlongpress={(item) => {
        lightboxItem = item
      }}
    />
    <LoadMoreButton {hasMore} onloadmore={loadMore} />
  </section>

  <!-- Leaderboard -->
  <section class="leaderboard-section">
    <LeaderboardTable entries={data.leaderboard.entries} title="Top Drinkers" />
  </section>
</div>

<style>
  .page {
    max-width: 700px;
    margin: 0 auto;
    padding: 1.25rem 1rem 4rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .feed-section {
    width: 100%;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.875rem;
  }

  .section-title {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-beer-foam);
  }

  .leaderboard-section {
    width: 100%;
    margin-top: 0.5rem;
  }
</style>
