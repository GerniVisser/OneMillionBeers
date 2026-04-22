<script lang="ts">
  import { onMount } from 'svelte'
  import type { PageData } from './$types'
  import { getInitials } from '$lib/utils'
  import { getRecentGroups, pruneRecentGroups, type RecentGroup } from '$lib/recents'

  let { data }: { data: PageData } = $props()

  let recentGroups = $state<RecentGroup[]>([])

  onMount(() => {
    if (data.total <= data.groups.length) {
      pruneRecentGroups(new Set(data.groups.map((g) => g.slug)))
    }
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
              <div class="card-name-row">
                <span class="card-name">{group.name}</span>
                {#if group.joinable}
                  <span class="joinable-badge">
                    <svg
                      class="badge-icon"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
                      />
                    </svg>
                    Join
                  </span>
                {/if}
              </div>
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
    padding: 4px 4px 0.5rem;
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

  .card-name-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
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

  .joinable-badge {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #25d366;
    background: rgba(37, 211, 102, 0.1);
    border: 1px solid rgba(37, 211, 102, 0.3);
    border-radius: 0.3rem;
    padding: 0.1rem 0.35rem;
    line-height: 1.4;
  }

  .badge-icon {
    width: 8px;
    height: 8px;
    flex-shrink: 0;
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
