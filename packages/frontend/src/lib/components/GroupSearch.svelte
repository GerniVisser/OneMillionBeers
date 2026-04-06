<script lang="ts">
  import { getGroups } from '$lib/api'
  import { getInitials } from '$lib/utils'
  import type { GroupListItem } from '@omb/shared'

  interface Props {
    placeholder?: string
    autofocus?: boolean
  }

  let { placeholder = 'Search groups…', autofocus = false }: Props = $props()

  $effect(() => {
    if (autofocus && inputRef) inputRef.focus()
  })

  let query = $state('')
  let results = $state<GroupListItem[]>([])
  let loading = $state(false)
  let open = $state(false)
  let noResults = $state(false)

  let inputRef: HTMLInputElement | undefined = $state()
  let containerRef: HTMLElement | undefined = $state()
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  function onInput(e: Event) {
    const value = (e.target as HTMLInputElement).value
    query = value
    noResults = false

    if (debounceTimer) clearTimeout(debounceTimer)

    if (!value.trim()) {
      results = []
      open = false
      return
    }

    debounceTimer = setTimeout(() => search(value), 300)
  }

  async function search(term: string) {
    loading = true
    open = true
    try {
      const res = await getGroups(fetch, { search: term, limit: 8, offset: 0 })
      results = res.items
      noResults = res.items.length === 0
    } finally {
      loading = false
    }
  }

  function dismiss() {
    open = false
    query = ''
    results = []
    noResults = false
  }

  function onWindowClick(e: MouseEvent) {
    if (containerRef && !containerRef.contains(e.target as Node)) {
      open = false
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      open = false
      inputRef?.blur()
    }
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onKeydown} />

<div class="search-wrap" bind:this={containerRef}>
  <!-- Input row -->
  <div class="search-input-wrap">
    <svg
      class="search-icon"
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L20 20" />
    </svg>

    <input
      bind:this={inputRef}
      type="search"
      {placeholder}
      value={query}
      oninput={onInput}
      onfocus={() => {
        if (query && results.length) open = true
      }}
      class="search-input"
      aria-label="Search groups"
      aria-haspopup="listbox"
      autocomplete="off"
    />

    {#if loading}
      <div class="spinner" aria-hidden="true"></div>
    {/if}
  </div>

  <!-- Dropdown -->
  {#if open}
    <div class="dropdown" role="listbox" aria-label="Group results">
      {#if results.length > 0}
        {#each results as group (group.id)}
          <a
            href="/groups/{group.slug}"
            class="result-item"
            role="option"
            aria-selected="false"
            onclick={dismiss}
          >
            <div class="result-avatar" aria-hidden="true">
              {#if group.avatarUrl}
                <img src={group.avatarUrl} alt="" class="result-avatar-img" />
              {:else}
                {getInitials(group.name)}
              {/if}
            </div>
            <div class="result-text">
              <span class="result-name">{group.name}</span>
              <span class="result-meta">{group.memberCount.toLocaleString()} members</span>
            </div>
          </a>
        {/each}
      {:else if noResults}
        <p class="no-results">No groups found for "{query}"</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .search-wrap {
    position: relative;
    width: 100%;
  }

  .search-input-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 0.875rem;
    color: var(--color-text-muted);
    pointer-events: none;
    flex-shrink: 0;
  }

  .search-input {
    width: 100%;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 9999px;
    color: var(--color-beer-head);
    font-size: 0.95rem;
    padding: 0.65rem 2.5rem 0.65rem 2.5rem;
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
    box-shadow: 0 0 0 3px rgba(212, 136, 58, 0.18);
  }

  /* Hide browser default clear button */
  .search-input::-webkit-search-cancel-button {
    display: none;
  }

  /* Spinner */
  .spinner {
    position: absolute;
    right: 0.875rem;
    width: 15px;
    height: 15px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-beer-amber);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Dropdown */
  .dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    z-index: 60;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 0.75rem;
    box-shadow:
      0 8px 24px rgba(0, 0, 0, 0.5),
      0 2px 6px rgba(0, 0, 0, 0.3);
    overflow: hidden;
    animation: drop-in 140ms ease both;
  }

  @keyframes drop-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .result-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.7rem 1rem;
    text-decoration: none;
    color: var(--color-beer-head);
    border-bottom: 1px solid var(--color-border);
    transition: background 120ms ease;
  }

  .result-item:last-child {
    border-bottom: none;
  }

  .result-item:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .result-avatar {
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    color: var(--color-beer-amber);
    font-family: var(--font-display);
    font-size: 0.7rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
  }

  .result-avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .result-text {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }

  .result-name {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--color-beer-foam);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .result-meta {
    font-size: 0.72rem;
    color: var(--color-text-muted);
  }

  .no-results {
    padding: 1rem;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 0.85rem;
  }
</style>
