<script lang="ts">
  import { onMount } from 'svelte'
  import UserSearch from '$lib/components/UserSearch.svelte'
  import CountryFlag from '$lib/components/CountryFlag.svelte'
  import { getInitials } from '$lib/utils'
  import { getRecentUsers, pruneRecentUsers, type RecentUser } from '$lib/recents'

  let recentUsers = $state<RecentUser[]>([])

  onMount(async () => {
    const stored = getRecentUsers()
    if (stored.length > 0) {
      const checks = await Promise.all(
        stored.map((u) =>
          fetch(`/api/v1/users/${u.slug}`)
            .then((r) => (r.ok ? u.slug : null))
            .catch(() => null),
        ),
      )
      pruneRecentUsers(new Set(checks.filter((s): s is string => s !== null)))
    }
    recentUsers = getRecentUsers()
  })

  function displayLabel(u: RecentUser): string {
    return u.pseudoName ?? u.slug
  }
</script>

<svelte:head>
  <title>Find a Profile — OneMillionBeers</title>
  <meta
    name="description"
    content="Find your OneMillionBeers profile by beer name or phone number."
  />
</svelte:head>

<div class="page-wrap">
  <div class="page-header">
    <h1 class="page-title">Find a Profile</h1>
    <p class="page-subtitle">Search for your profile by beer name or phone number</p>
  </div>

  {#if recentUsers.length > 0}
    <section class="section">
      <h2 class="section-label stat-label">Recently Visited</h2>
      <div class="cards-row">
        {#each recentUsers as u (u.slug)}
          <a href="/users/{u.slug}" class="user-card card card-hover">
            <div class="card-avatar">
              {#if u.countryCode}
                <CountryFlag countryCode={u.countryCode} size={44} />
              {:else}
                <span class="avatar-initials">{getInitials(displayLabel(u))}</span>
              {/if}
            </div>
            <span class="card-name">{displayLabel(u)}</span>
          </a>
        {/each}
      </div>
    </section>
  {/if}

  <section class="section">
    <h2 class="section-label stat-label">Search</h2>
    <div class="search-wrap">
      <UserSearch />
    </div>
  </section>
</div>

<style>
  .page-wrap {
    max-width: 600px;
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
    margin-bottom: 0.25rem;
  }

  .page-subtitle {
    font-size: 0.875rem;
    color: var(--color-text-muted);
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

  .user-card {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem 1.25rem;
    min-width: 8rem;
    text-decoration: none;
    text-align: center;
    border-radius: 0.75rem;
  }

  .card-avatar {
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
  }

  .avatar-initials {
    font-family: var(--font-display);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--color-beer-amber);
  }

  .card-name {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--color-beer-foam);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 7rem;
  }

  .search-wrap {
    max-width: 480px;
  }
</style>
