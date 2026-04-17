<script lang="ts">
  import { onMount } from 'svelte'
  import type { PageData } from './$types'
  import { getInitials } from '$lib/utils'
  import { getRecentGroups, type RecentGroup } from '$lib/recents'

  let { data }: { data: PageData } = $props()

  let recentGroups = $state<RecentGroup[]>([])

  onMount(() => {
    recentGroups = getRecentGroups()
  })
</script>

<svelte:head>
  <title>Groups — OneMillionBeers</title>
  <meta name="description" content="Browse all beer-tracking WhatsApp groups on OneMillionBeers." />
</svelte:head>

<div class="page-wrap">
  <div class="page-header">
    <h1 class="page-title">Groups</h1>
  </div>

  {#if recentGroups.length > 0}
    <section class="section">
      <h2 class="section-label stat-label">Recently Visited</h2>
      <div class="cards-row">
        {#each recentGroups as g (g.slug)}
          <a href="/groups/{g.slug}" class="group-card group-card--recent card card-hover">
            <div class="card-avatar">
              {#if g.avatarUrl}
                <img src={g.avatarUrl} alt="" class="avatar-img" />
              {:else}
                <span class="avatar-initials">{getInitials(g.name)}</span>
              {/if}
            </div>
            <span class="card-name">{g.name}</span>
          </a>
        {/each}
      </div>
    </section>
  {/if}

  <section class="section">
    <h2 class="section-label stat-label">All Groups</h2>
    {#if data.groups.length === 0}
      <p class="empty">No groups yet.</p>
    {:else}
      <div class="groups-grid">
        {#each data.groups as group (group.id)}
          <a href="/groups/{group.slug}" class="group-card card card-hover">
            <div class="card-avatar">
              {#if group.avatarUrl}
                <img src={group.avatarUrl} alt="" class="avatar-img" />
              {:else}
                <span class="avatar-initials">{getInitials(group.name)}</span>
              {/if}
            </div>
            <div class="card-body">
              <span class="card-name">{group.name}</span>
              <span class="card-meta">{group.memberCount.toLocaleString()} contributors</span>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .page-wrap {
    max-width: 860px;
    margin: 0 auto;
    padding: 1.5rem 1.25rem 3rem;
  }

  .page-header {
    margin-bottom: 2rem;
  }

  .page-title {
    font-family: var(--font-display);
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--color-beer-foam);
    letter-spacing: -0.02em;
  }

  .section {
    margin-bottom: 2.5rem;
  }

  .section-label {
    margin-bottom: 0.875rem;
  }

  /* Recently visited — horizontal scroll row */
  .cards-row {
    display: flex;
    gap: 0.75rem;
    overflow-x: auto;
    padding-bottom: 0.25rem;
    scrollbar-width: none;
  }

  .cards-row::-webkit-scrollbar {
    display: none;
  }

  .group-card--recent {
    flex-shrink: 0;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem 1.25rem;
    min-width: 9rem;
    text-align: center;
  }

  /* All groups — responsive grid */
  .groups-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 0.875rem;
  }

  .group-card {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 0.875rem 1rem;
    text-decoration: none;
    border-radius: 0.75rem;
  }

  .card-avatar {
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-initials {
    font-family: var(--font-display);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--color-beer-amber);
  }

  .card-body {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .card-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-beer-foam);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-meta {
    font-size: 0.72rem;
    color: var(--color-text-muted);
  }

  .empty {
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }
</style>
