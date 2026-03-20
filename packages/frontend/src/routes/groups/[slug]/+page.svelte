<script lang="ts">
  import { untrack } from 'svelte'
  import type { PageData } from './$types'
  import type { FeedItem } from '@omb/shared'
  import FeedGrid from '$lib/components/FeedGrid.svelte'
  import LoadMoreButton from '$lib/components/LoadMoreButton.svelte'
  import LeaderboardTable from '$lib/components/LeaderboardTable.svelte'
  import ProgressBar from '$lib/components/ProgressBar.svelte'

  let { data }: { data: PageData } = $props()

  // untrack: intentional one-time capture of SSR data; state is then managed independently (load-more)
  let feedItems = $state<FeedItem[]>(untrack(() => data.feed.items))
  let feedOffset = $state(untrack(() => data.feed.items.length))
  let feedTotal = $state(untrack(() => data.feed.total))
  let loadingMore = $state(false)

  const hasMore = $derived(feedOffset < feedTotal)

  async function loadMore() {
    if (loadingMore || !hasMore) return
    loadingMore = true
    try {
      const res = await fetch(
        `/api/v1/groups/${data.profile.slug}/feed?limit=20&offset=${feedOffset}`,
      )
      if (res.ok) {
        const json = (await res.json()) as { items: FeedItem[]; total: number }
        feedItems = [...feedItems, ...json.items]
        feedOffset += json.items.length
        feedTotal = json.total
      }
    } finally {
      loadingMore = false
    }
  }
</script>

<svelte:head>
  <title>{data.profile.name} — OneMillionBeers</title>
  <meta
    name="description"
    content="{data.profile.name} has logged {data.profile.totalBeers} beers on OneMillionBeers."
  />
</svelte:head>

<!-- Group header -->
<section
  style="
    background: linear-gradient(180deg, #2d1200 0%, var(--color-bg-deep) 100%);
    padding: 3rem 1rem 2rem;
  "
>
  <div style="max-width: 700px; margin: 0 auto; text-align: center;">
    <h1
      style="
        font-family: var(--font-display);
        font-size: clamp(2rem, 7vw, 3.5rem);
        color: var(--color-beer-head);
        letter-spacing: 0.05em;
        margin-bottom: 0.5rem;
      "
      class="glow-amber"
    >
      {data.profile.name}
    </h1>
    <p style="color: var(--color-text-muted); margin-bottom: 1.5rem;">
      {data.profile.totalBeers.toLocaleString()} beers logged
    </p>
    <ProgressBar count={data.profile.totalBeers} />
  </div>
</section>

<!-- Body -->
<section style="max-width: 1200px; margin: 0 auto; padding: 2rem 1rem 4rem;">
  <div class="group-grid">
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
        Beer Feed
      </h2>
      <FeedGrid items={feedItems} loading={loadingMore && feedItems.length === 0} />
      <LoadMoreButton {hasMore} onloadmore={loadMore} />
    </div>

    <div>
      <LeaderboardTable entries={data.leaderboard.entries} title="Group Leaders" />
    </div>
  </div>
</section>

<style>
  .group-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 2rem;
  }

  @media (min-width: 1024px) {
    .group-grid {
      grid-template-columns: 1fr 320px;
    }
  }
</style>
