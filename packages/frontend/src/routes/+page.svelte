<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import type { PageData } from './$types'
  import type { FeedItem, SseEvent } from '@omb/shared'
  import { subscribeToStream } from '$lib/sse'
  import FoamBubbles from '$lib/components/FoamBubbles.svelte'
  import LiveBadge from '$lib/components/LiveBadge.svelte'
  import BeerCounter from '$lib/components/BeerCounter.svelte'
  import ProgressBar from '$lib/components/ProgressBar.svelte'
  import FeedGrid from '$lib/components/FeedGrid.svelte'
  import LoadMoreButton from '$lib/components/LoadMoreButton.svelte'
  import LeaderboardTable from '$lib/components/LeaderboardTable.svelte'

  let { data }: { data: PageData } = $props()

  // untrack: intentional one-time capture of SSR data; state is then managed independently (SSE + load-more)
  let liveCount = $state(untrack(() => data.count))
  let feedItems = $state<FeedItem[]>(untrack(() => data.feed.items))
  let feedOffset = $state(untrack(() => data.feed.items.length))
  let feedTotal = $state(untrack(() => data.feed.total))
  let loadingMore = $state(false)

  const hasMore = $derived(feedOffset < feedTotal)

  function transformSseToFeedItem(latestBeer: NonNullable<SseEvent['latestBeer']>): FeedItem {
    return {
      id: latestBeer.id,
      photoUrl: latestBeer.photoUrl,
      loggedAt: latestBeer.loggedAt,
      user: {
        id: latestBeer.id, // SSE doesn't carry userId — use beer id as fallback key
        displayName: latestBeer.userName,
        slug: latestBeer.userName?.toLowerCase().replace(/\s+/g, '-') ?? 'anonymous',
      },
      group: {
        id: latestBeer.id, // fallback key
        name: latestBeer.groupName,
        slug: latestBeer.groupName.toLowerCase().replace(/\s+/g, '-'),
      },
    }
  }

  onMount(() =>
    subscribeToStream((event: SseEvent) => {
      liveCount = event.count
      if (event.latestBeer) {
        const item = transformSseToFeedItem(event.latestBeer)
        // Only prepend if not already in the feed (SSR may have already fetched it)
        if (!feedItems.some((f) => f.id === item.id)) {
          feedItems = [item, ...feedItems]
          feedOffset += 1
          feedTotal += 1
        }
      }
    }),
  )

  async function loadMore() {
    if (loadingMore || !hasMore) return
    loadingMore = true
    try {
      const res = await fetch(`/api/v1/global/feed?limit=20&offset=${feedOffset}`)
      if (res.ok) {
        const data = (await res.json()) as { items: FeedItem[]; total: number }
        feedItems = [...feedItems, ...data.items]
        feedOffset += data.items.length
        feedTotal = data.total
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

<!-- Hero -->
<section
  style="
    position: relative;
    overflow: hidden;
    padding: 4rem 1rem 3rem;
    text-align: center;
    background: linear-gradient(180deg, #2d1200 0%, var(--color-bg-deep) 100%);
  "
>
  <FoamBubbles />

  <div style="position: relative; z-index: 1; max-width: 600px; margin: 0 auto;">
    <div style="margin-bottom: 1rem;">
      <LiveBadge />
    </div>

    <h1
      style="
        font-family: var(--font-display);
        font-size: clamp(2rem, 6vw, 3rem);
        color: var(--color-beer-head);
        letter-spacing: 0.05em;
        margin-bottom: 1.5rem;
      "
      class="glow-amber"
    >
      One Million Beers
    </h1>

    <BeerCounter count={liveCount} />

    <div style="margin-top: 2rem;">
      <ProgressBar count={liveCount} />
    </div>
  </div>
</section>

<!-- Body -->
<section style="max-width: 1200px; margin: 0 auto; padding: 2rem 1rem 4rem;">
  <div class="dashboard-grid">
    <!-- Feed -->
    <div>
      <h2
        style="
          font-family: var(--font-display);
          font-size: 1.75rem;
          color: var(--color-beer-amber);
          letter-spacing: 0.05em;
          margin-bottom: 1rem;
        "
      >
        Latest Beers
      </h2>
      <FeedGrid items={feedItems} loading={loadingMore && feedItems.length === 0} />
      <LoadMoreButton {hasMore} onloadmore={loadMore} />
    </div>

    <!-- Leaderboard -->
    <div>
      <LeaderboardTable entries={data.leaderboard.entries} title="Top Drinkers" />
    </div>
  </div>
</section>

<style>
  .dashboard-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 2rem;
  }

  @media (min-width: 1024px) {
    .dashboard-grid {
      grid-template-columns: 1fr 320px;
    }
  }
</style>
