<script lang="ts">
  import { untrack } from 'svelte'
  import type { PageData } from './$types'
  import type { GroupListItem } from '@omb/shared'
  import { getGroups } from '$lib/api'
  import LoadMoreButton from '$lib/components/LoadMoreButton.svelte'

  let { data }: { data: PageData } = $props()

  let groups = $state<GroupListItem[]>(untrack(() => data.items))
  let total = $state(untrack(() => data.total))
  let offset = $state(untrack(() => data.items.length))
  let search = $state('')
  let loading = $state(false)

  const hasMore = $derived(offset < total)

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  function onSearchInput(e: Event) {
    const value = (e.target as HTMLInputElement).value
    search = value
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => runSearch(value), 300)
  }

  async function runSearch(term: string) {
    loading = true
    try {
      const result = await getGroups(fetch, { search: term || undefined, limit: 20, offset: 0 })
      groups = result.items
      total = result.total
      offset = result.items.length
    } finally {
      loading = false
    }
  }

  async function loadMore() {
    if (loading || !hasMore) return
    loading = true
    try {
      const result = await getGroups(fetch, {
        search: search || undefined,
        limit: 20,
        offset,
      })
      groups = [...groups, ...result.items]
      total = result.total
      offset += result.items.length
    } finally {
      loading = false
    }
  }

  function getInitials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('')
  }

  // Deterministic warm-palette gradient per group
  const GRADIENTS = [
    'linear-gradient(135deg, #7a3a0a 0%, #c97020 100%)',
    'linear-gradient(135deg, #5c2d00 0%, #a0521a 100%)',
    'linear-gradient(135deg, #8a4800 0%, #d4883a 100%)',
    'linear-gradient(135deg, #3d1a00 0%, #8a5e22 100%)',
    'linear-gradient(135deg, #6b2f05 0%, #b86018 100%)',
  ]

  function cardGradient(id: string): string {
    let hash = 0
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
    return GRADIENTS[hash % GRADIENTS.length]
  }
</script>

<svelte:head>
  <title>Groups — OneMillionBeers</title>
  <meta name="description" content="Browse all beer groups on OneMillionBeers." />
</svelte:head>

<!-- Page header -->
<section
  style="
    background: linear-gradient(180deg, #2d1200 0%, var(--color-bg-deep) 100%);
    padding: 1rem 0 2rem;
    text-align: center;
  "
>
  <!-- Search -->
  <div style="max-width: 480px; margin: 0 auto; padding: 0 1rem;">
    <input
      type="search"
      placeholder="Search groups…"
      value={search}
      oninput={onSearchInput}
      class="search-input"
      aria-label="Search groups"
    />
  </div>
</section>

<!-- Grid -->
<section style="max-width: 900px; margin: 0 auto; padding: 1rem 1rem 5rem;">
  {#if loading && groups.length === 0}
    <div class="groups-grid">
      {#each { length: 4 } as _}
        <div class="card skeleton-card" aria-hidden="true"></div>
      {/each}
    </div>
  {:else if groups.length === 0}
    <p style="text-align: center; color: var(--color-text-muted); margin-top: 3rem;">
      No groups found{search ? ` for "${search}"` : ''}.
    </p>
  {:else}
    <div class="groups-grid">
      {#each groups as group (group.id)}
        <div class="card card-hover group-card">
          <!-- Coloured banner -->
          <div class="card-banner" style="background: {cardGradient(group.id)};">
            <div class="avatar" aria-hidden="true">{getInitials(group.name)}</div>
          </div>

          <!-- Body -->
          <div class="card-body">
            <h2 class="group-name">{group.name}</h2>
            <p class="member-count">
              🍺 {group.memberCount.toLocaleString()}
              {group.memberCount === 1 ? 'member' : 'members'}
            </p>
            <a href="/groups/{group.slug}" class="view-btn">View Group</a>
          </div>
        </div>
      {/each}
    </div>

    <LoadMoreButton {hasMore} onloadmore={loadMore} />
  {/if}
</section>

<style>
  .search-input {
    width: 100%;
    background: var(--color-bg-card);
    border: 1px solid var(--color-beer-dark);
    border-radius: 9999px;
    color: var(--color-beer-head);
    font-size: 1rem;
    padding: 0.625rem 1.25rem;
    outline: none;
    box-sizing: border-box;
    transition:
      border-color 150ms ease,
      box-shadow 150ms ease;
  }

  .search-input::placeholder {
    color: var(--color-text-muted);
  }

  .search-input:focus {
    border-color: var(--color-beer-amber);
    box-shadow: 0 0 0 3px rgba(212, 136, 58, 0.2);
  }

  .groups-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }

  .group-card {
    display: flex;
    flex-direction: column;
    padding: 0;
    overflow: hidden;
    border: none;
  }

  /* Coloured top banner with avatar hanging below */
  .card-banner {
    position: relative;
    height: 72px;
    flex-shrink: 0;
  }

  .avatar {
    position: absolute;
    bottom: -1.75rem;
    left: 50%;
    transform: translateX(-50%);
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 50%;
    background-color: var(--color-bg-card);
    border: 3px solid var(--color-bg-card);
    color: var(--color-beer-amber);
    font-family: var(--font-display);
    font-size: 1.125rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  }

  .card-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 2.25rem 0.875rem 1rem;
    flex: 1;
  }

  .group-name {
    font-family: var(--font-display);
    font-size: clamp(0.875rem, 3vw, 1.1rem);
    color: var(--color-beer-head);
    letter-spacing: 0.03em;
    margin-bottom: 0.3rem;
    line-height: 1.3;
    word-break: break-word;
  }

  .member-count {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-bottom: 1rem;
  }

  .view-btn {
    display: block;
    width: 100%;
    background-color: var(--color-beer-amber);
    color: var(--color-bg-deep);
    font-family: var(--font-display);
    font-size: 0.875rem;
    letter-spacing: 0.05em;
    padding: 0.5rem 0;
    border-radius: 0.5rem;
    text-decoration: none;
    text-align: center;
    margin-top: auto;
    transition:
      background-color 150ms ease,
      box-shadow 150ms ease;
  }

  .view-btn:hover {
    background-color: var(--color-accent-glow);
    box-shadow: 0 0 12px rgba(251, 191, 36, 0.4);
  }

  .skeleton-card {
    height: 200px;
    background: linear-gradient(
      90deg,
      var(--color-bg-card) 25%,
      var(--color-bg-surface) 50%,
      var(--color-bg-card) 75%
    );
    background-size: 200% 100%;
    animation: progress-shimmer 1.5s infinite;
    border-radius: 0.75rem;
  }
</style>
