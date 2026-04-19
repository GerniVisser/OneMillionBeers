<script lang="ts">
  import { onDestroy, tick } from 'svelte'
  import { searchUsers } from '$lib/api'
  import CountryFlag from '$lib/components/CountryFlag.svelte'
  import type { UserSummary } from '@omb/shared'
  import { getCountries, getCountryCallingCode } from 'libphonenumber-js'

  type Country = { code: string; name: string; dialCode: string }
  type Mode = 'name' | 'phone'

  const displayNames = new Intl.DisplayNames(['en'], { type: 'region' })

  // Built once at module load — sorted A–Z with ZA pinned first.
  const COUNTRIES: Country[] = (() => {
    const all = getCountries()
      .map((code) => {
        let name: string
        try {
          name = displayNames.of(code) ?? code
        } catch {
          name = code
        }
        return { code, name, dialCode: getCountryCallingCode(code) }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
    const za = all.findIndex((c) => c.code === 'ZA')
    if (za !== -1) all.unshift(all.splice(za, 1)[0])
    return all
  })()

  // ── Mode (name is the default) ───────────────────────────
  let mode = $state<Mode>('name')

  // ── Shared results state ────────────────────────────────
  let results = $state<UserSummary[]>([])
  let loading = $state(false)
  let open = $state(false)
  let noResults = $state(false)

  // ── Name mode ───────────────────────────────────────────
  let nameQuery = $state('')
  let nameInputRef: HTMLInputElement | undefined = $state()

  // ── Phone mode ──────────────────────────────────────────
  let localNumber = $state('')
  let selectedCountry = $state<Country | null>(null)
  let countryOpen = $state(false)
  let phoneInputRef: HTMLInputElement | undefined = $state()

  // ── Shared refs ─────────────────────────────────────────
  let containerRef: HTMLElement | undefined = $state()
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  // ── Mode switching ───────────────────────────────────────
  function switchMode(next: Mode) {
    if (mode === next) return
    mode = next
    results = []
    open = false
    noResults = false
    loading = false
    nameQuery = ''
    localNumber = ''
    countryOpen = false
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    tick().then(() => {
      if (next === 'name') nameInputRef?.focus()
      else phoneInputRef?.focus()
    })
  }

  // ── Name mode ────────────────────────────────────────────
  function onNameInput(e: Event) {
    const value = (e.target as HTMLInputElement).value
    nameQuery = value
    noResults = false
    if (debounceTimer) clearTimeout(debounceTimer)
    if (value.trim().length < 4) {
      results = []
      open = false
      return
    }
    debounceTimer = setTimeout(() => search(value.trim()), 300)
  }

  // ── Phone mode ───────────────────────────────────────────
  function buildPhoneQuery(): string | null {
    if (!selectedCountry) return null
    const stripped = localNumber.replace(/[\s\-().]/g, '').replace(/^0+/, '')
    if (stripped.length < 6) return null
    return `+${selectedCountry.dialCode}${stripped}`
  }

  function onPhoneInput(e: Event) {
    const raw = (e.target as HTMLInputElement).value.replace(/[^\d\s\-().]/g, '')
    localNumber = raw
    ;(e.target as HTMLInputElement).value = raw
    noResults = false
    if (debounceTimer) clearTimeout(debounceTimer)
    const q = buildPhoneQuery()
    if (!q) {
      results = []
      open = false
      return
    }
    debounceTimer = setTimeout(() => search(q), 300)
  }

  function selectCountry(c: Country) {
    selectedCountry = c
    countryOpen = false
    phoneInputRef?.focus()
    const q = buildPhoneQuery()
    if (q) search(q)
  }

  function clearCountry() {
    selectedCountry = null
    countryOpen = false
    results = []
    open = false
    noResults = false
  }

  // ── Core search ──────────────────────────────────────────
  async function search(term: string) {
    loading = true
    open = true
    try {
      const res = await searchUsers(fetch, term, 3)
      results = res.results
      noResults = res.results.length === 0
    } catch {
      results = []
      noResults = false
    } finally {
      loading = false
    }
  }

  function dismiss() {
    open = false
    nameQuery = ''
    localNumber = ''
    results = []
    noResults = false
  }

  // ── Global event handlers ────────────────────────────────
  function onWindowClick(e: MouseEvent) {
    if (containerRef && !containerRef.contains(e.target as Node)) {
      open = false
      countryOpen = false
    }
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (countryOpen) {
        countryOpen = false
        return
      }
      open = false
    }
  }

  onDestroy(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
  })

  // ── Derived ──────────────────────────────────────────────
  const phoneReady = $derived(selectedCountry !== null)
  const phonePlaceholder = $derived(
    selectedCountry ? `Local number for ${selectedCountry.name}…` : 'Select a country first',
  )
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeydown} />

<div class="search-wrap" bind:this={containerRef}>
  <!-- ── Name mode ─────────────────────────────────────── -->
  {#if mode === 'name'}
    <div class="input-row">
      <svg
        class="input-icon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M15.5 15.5L20 20" />
      </svg>
      <input
        bind:this={nameInputRef}
        type="search"
        placeholder="Search by beer name…"
        value={nameQuery}
        oninput={onNameInput}
        onfocus={() => {
          if (nameQuery && results.length) open = true
        }}
        class="search-input"
        aria-label="Search by beer name"
        aria-haspopup="listbox"
        autocomplete="off"
      />
      {#if loading}
        <div class="spinner" aria-hidden="true"></div>
      {/if}
    </div>

    <p class="mode-switch">
      Can't find yourself?
      <button class="mode-link" onclick={() => switchMode('phone')}>
        Search by phone number instead
      </button>
    </p>
  {/if}

  <!-- ── Phone mode ────────────────────────────────────── -->
  {#if mode === 'phone'}
    <div class="input-row">
      <!-- Country picker -->
      <div class="country-prefix">
        <button
          type="button"
          class="country-btn"
          aria-label={selectedCountry ? `Country: ${selectedCountry.name}` : 'Select country code'}
          aria-expanded={countryOpen}
          aria-haspopup="listbox"
          onclick={() => (countryOpen = !countryOpen)}
        >
          {#if selectedCountry}
            <CountryFlag countryCode={selectedCountry.code} size={16} />
            <span class="country-dial">+{selectedCountry.dialCode}</span>
          {:else}
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              class="country-phone-icon"
            >
              <path
                d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.77a16 16 0 0 0 6.29 6.29l1.62-1.62a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"
              />
            </svg>
            <span class="country-dial country-dial--empty">+</span>
          {/if}
          <svg
            class="chevron"
            class:open={countryOpen}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {#if countryOpen}
          <div class="country-dropdown" role="listbox" aria-label="Select country code">
            {#if selectedCountry}
              <button
                type="button"
                class="country-option country-option--clear"
                onclick={clearCountry}
              >
                <span class="clear-icon" aria-hidden="true">✕</span>
                <span>Clear selection</span>
              </button>
              <div class="country-divider"></div>
            {/if}
            {#each COUNTRIES as c (c.code)}
              <button
                type="button"
                class="country-option"
                class:selected={selectedCountry?.code === c.code}
                role="option"
                aria-selected={selectedCountry?.code === c.code}
                onclick={() => selectCountry(c)}
              >
                <CountryFlag countryCode={c.code} size={18} />
                <span class="country-name">{c.name}</span>
                <span class="country-code">+{c.dialCode}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <div class="prefix-divider" aria-hidden="true"></div>

      <input
        bind:this={phoneInputRef}
        type="tel"
        inputmode="numeric"
        placeholder={phonePlaceholder}
        value={localNumber}
        oninput={onPhoneInput}
        disabled={!phoneReady}
        class="search-input"
        class:input--disabled={!phoneReady}
        aria-label="Local phone number"
        autocomplete="off"
      />

      {#if loading}
        <div class="spinner" aria-hidden="true"></div>
      {/if}
    </div>

    <p class="mode-switch">
      {#if phoneReady}
        {selectedCountry!.name} · leading 0 is fine ·
      {/if}
      <button class="mode-link" onclick={() => switchMode('name')}> Search by name instead </button>
    </p>
  {/if}

  <!-- ── Results dropdown (shared) ─────────────────────── -->
  {#if open}
    <div class="dropdown" role="listbox" aria-label="User results">
      {#if results.length > 0}
        {#each results as user (user.id)}
          <a
            href="/users/{user.slug}"
            class="result-item"
            role="option"
            aria-selected="false"
            onclick={dismiss}
          >
            <div class="result-avatar" aria-hidden="true">
              {#if user.countryCode}
                <CountryFlag countryCode={user.countryCode} size={32} />
              {:else}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
              {/if}
            </div>
            <div class="result-text">
              <span class="result-name">{user.pseudoName ?? user.displayName ?? user.slug}</span>
              {#if user.countryCode}
                <span class="result-meta">{user.countryCode.toUpperCase()}</span>
              {/if}
            </div>
          </a>
        {/each}
      {:else if noResults}
        <p class="no-results">No profile found — try a different spelling or phone number</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .search-wrap {
    position: relative;
    width: 100%;
  }

  /* ── Input row ──────────────────────────────────────────── */

  .input-row {
    display: flex;
    align-items: center;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 9999px;
    position: relative;
    transition:
      border-color 150ms ease,
      box-shadow 150ms ease;
  }

  .input-row:focus-within {
    border-color: var(--color-beer-amber);
    box-shadow: 0 0 0 3px rgba(212, 136, 58, 0.18);
  }

  /* ── Name mode: search icon ─────────────────────────────── */

  .input-icon {
    flex-shrink: 0;
    margin-left: 0.875rem;
    color: var(--color-text-muted);
    pointer-events: none;
  }

  /* ── Shared text input ──────────────────────────────────── */

  .search-input {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    outline: none;
    color: var(--color-beer-foam);
    font-family: var(--font-body);
    font-size: 0.95rem;
    padding: 0.65rem 2.25rem 0.65rem 0.75rem;
  }

  .search-input::placeholder {
    color: var(--color-text-muted);
  }

  .search-input::-webkit-search-cancel-button {
    display: none;
  }

  .input--disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  /* ── Spinner ────────────────────────────────────────────── */

  .spinner {
    position: absolute;
    right: 0.875rem;
    width: 15px;
    height: 15px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-beer-amber);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    pointer-events: none;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* ── Mode switcher ──────────────────────────────────────── */

  .mode-switch {
    margin: 0.45rem 0.25rem 0;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .mode-link {
    background: none;
    border: none;
    padding: 0;
    font-size: inherit;
    font-family: inherit;
    color: var(--color-beer-amber);
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: rgba(212, 136, 58, 0.4);
    text-underline-offset: 2px;
    transition:
      color 120ms ease,
      text-decoration-color 120ms ease;
  }

  .mode-link:hover {
    color: var(--color-beer-foam);
    text-decoration-color: var(--color-beer-foam);
  }

  /* ── Country prefix ─────────────────────────────────────── */

  .country-prefix {
    position: relative;
    flex-shrink: 0;
  }

  .country-btn {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.6rem 0.6rem 0.6rem 0.875rem;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-beer-foam);
    border-radius: 9999px 0 0 9999px;
    transition: background 120ms ease;
    white-space: nowrap;
  }

  .country-btn:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .country-phone-icon {
    color: var(--color-text-muted);
  }

  .country-dial {
    font-family: var(--font-body);
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-beer-foam);
  }

  .country-dial--empty {
    color: var(--color-text-muted);
  }

  .chevron {
    color: var(--color-text-muted);
    transition: transform 150ms ease;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  /* ── Divider between prefix and input ───────────────────── */

  .prefix-divider {
    width: 1px;
    height: 1.25rem;
    background: var(--color-border);
    flex-shrink: 0;
  }

  /* ── Country dropdown ───────────────────────────────────── */

  .country-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 70;
    width: 230px;
    max-height: 280px;
    overflow-y: auto;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 0.75rem;
    box-shadow:
      0 8px 24px rgba(0, 0, 0, 0.5),
      0 2px 6px rgba(0, 0, 0, 0.3);
    animation: drop-in 140ms ease both;
    scrollbar-width: thin;
    scrollbar-color: var(--color-border) transparent;
  }

  .country-option {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.55rem 0.875rem;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    color: var(--color-beer-foam);
    transition: background 100ms ease;
  }

  .country-option:hover,
  .country-option.selected {
    background: rgba(255, 255, 255, 0.05);
  }

  .country-option.selected {
    color: var(--color-beer-amber);
  }

  .country-option--clear {
    color: var(--color-text-muted);
    font-size: 0.82rem;
  }

  .country-option--clear:hover {
    color: var(--color-beer-foam);
  }

  .clear-icon {
    font-size: 0.7rem;
    width: 18px;
    text-align: center;
  }

  .country-divider {
    height: 1px;
    background: var(--color-border);
    margin: 0.25rem 0;
  }

  .country-name {
    flex: 1;
    font-size: 0.85rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .country-code {
    font-size: 0.78rem;
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  /* ── Results dropdown ───────────────────────────────────── */

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
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
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
