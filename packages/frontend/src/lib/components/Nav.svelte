<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/stores'
  import AboutModal from '$lib/components/AboutModal.svelte'

  const VISITED_KEY = 'omb:visited'

  let moreOpen = $state(false)
  let aboutOpen = $state(false)

  onMount(() => {
    if (!localStorage.getItem(VISITED_KEY)) {
      localStorage.setItem(VISITED_KEY, '1')
      aboutOpen = true
    }
  })

  const isActive = (path: string) => {
    if (path === '/') return $page.url.pathname === '/'
    return $page.url.pathname.startsWith(path)
  }

  function toggleMore() {
    moreOpen = !moreOpen
  }

  function closeMore() {
    moreOpen = false
  }

  function openAbout() {
    aboutOpen = true
    moreOpen = false
  }
</script>

<!-- Desktop sidebar -->
<aside class="sidebar">
  <a href="/" class="sidebar-logo">
    <span class="logo-icon">🍺</span>
    <span class="logo-text">OneMillionBeers</span>
  </a>

  <nav class="sidebar-nav">
    <div class="sidebar-section">
      <a href="/" class="sidebar-link" class:active={isActive('/')}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path
            d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
          />
        </svg>
        Global
      </a>

      <a href="/groups" class="sidebar-link" class:active={isActive('/groups')}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="9" cy="7" r="3" />
          <circle cx="17" cy="8" r="2.5" />
          <path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
          <path d="M22 20c0-2.5-2-4.5-5-5.2" />
        </svg>
        Groups
      </a>

      <a href="/users" class="sidebar-link" class:active={isActive('/users')}>
        <svg
          width="18"
          height="18"
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
        Users
      </a>
    </div>

    <div class="sidebar-divider"></div>

    <div class="sidebar-section sidebar-section--bottom">
      <button class="sidebar-link sidebar-link--muted" onclick={openAbout}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        About
      </button>

      <a
        href="https://github.com/GerniVisser/OMB/issues/new"
        target="_blank"
        rel="noopener"
        class="sidebar-link sidebar-link--muted"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
        Report a Bug
      </a>
    </div>
  </nav>
</aside>

<!-- Mobile bottom bar -->
<nav class="bottom-nav">
  <a href="/" class="nav-item" class:active={isActive('/')}>
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path
        d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
      />
    </svg>
    <span>Global</span>
  </a>

  <a href="/groups" class="nav-item" class:active={isActive('/groups')}>
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="9" cy="7" r="3" />
      <circle cx="17" cy="8" r="2.5" />
      <path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
      <path d="M22 20c0-2.5-2-4.5-5-5.2" />
    </svg>
    <span>Groups</span>
  </a>

  <a href="/users" class="nav-item" class:active={isActive('/users')}>
    <svg
      width="19"
      height="19"
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
    <span>Users</span>
  </a>

  <button
    class="nav-item nav-item--more"
    class:active={moreOpen}
    onclick={toggleMore}
    aria-label="More options"
    aria-expanded={moreOpen}
  >
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="12" cy="5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" />
    </svg>
    <span>More</span>
  </button>
</nav>

<!-- More sheet (mobile) -->
{#if moreOpen}
  <div class="sheet-backdrop" role="presentation" onclick={closeMore}></div>
  <div class="more-sheet" role="dialog" aria-label="More options">
    <div class="sheet-handle"></div>

    <button class="sheet-item" onclick={openAbout}>
      <span class="sheet-item-icon">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
      </span>
      <span class="sheet-item-label">About</span>
      <svg
        class="sheet-item-chevron"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>

    <a
      href="https://github.com/GerniVisser/OMB/issues/new"
      target="_blank"
      rel="noopener"
      class="sheet-item"
      onclick={closeMore}
    >
      <span class="sheet-item-icon">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </span>
      <span class="sheet-item-label">Report a Bug</span>
      <svg
        class="sheet-item-chevron"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </a>
  </div>
{/if}

{#if aboutOpen}
  <AboutModal onclose={() => (aboutOpen = false)} />
{/if}

<style>
  /* ── Sidebar (desktop) ─────────────────────────────── */
  .sidebar {
    display: none;
  }

  @media (min-width: 768px) {
    .sidebar {
      display: flex;
      flex-direction: column;
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      width: 220px;
      background-color: rgba(18, 12, 5, 0.97);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-right: 1px solid var(--color-border);
      z-index: 50;
      padding: 1.5rem 0.75rem;
    }
  }

  .sidebar-logo {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 0.75rem 1.5rem;
    text-decoration: none;
    color: var(--color-beer-foam);
  }

  .logo-icon {
    font-size: 1.4rem;
    line-height: 1;
  }

  .logo-text {
    font-family: var(--font-display);
    font-size: 0.9rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--color-beer-foam);
  }

  .sidebar-nav {
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  .sidebar-section {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .sidebar-section--bottom {
    margin-top: auto;
  }

  .sidebar-divider {
    flex: 1;
  }

  .sidebar-link {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.75rem;
    border-radius: 0.5rem;
    font-family: var(--font-body);
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-decoration: none;
    transition:
      color 120ms ease,
      background-color 120ms ease;
  }

  .sidebar-link:hover {
    color: var(--color-beer-foam);
    background-color: var(--color-bg-surface);
  }

  .sidebar-link.active {
    color: var(--color-beer-amber);
    background-color: rgba(245, 158, 11, 0.08);
  }

  .sidebar-link--muted {
    font-size: 0.82rem;
    font-weight: 500;
  }

  /* ── Bottom nav (mobile only) ─────────────────────── */
  .bottom-nav {
    display: none;
  }

  @media (max-width: 767px) {
    .bottom-nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 50;
      display: flex;
      align-items: flex-end;
      justify-content: space-around;
      padding: 0.25rem 0.25rem calc(0.25rem + env(safe-area-inset-bottom));
      background-color: rgba(18, 12, 5, 0.97);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-top: 1px solid var(--color-border);
      box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.5);
    }
  }

  .nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    padding: 0.25rem 0.5rem;
    color: var(--color-cream-faint);
    text-decoration: none;
    background: none;
    border: none;
    cursor: pointer;
    transition: color 120ms ease;
    flex: 1;
  }

  .nav-item span {
    font-family: var(--font-body);
    font-size: 0.58rem;
    font-weight: 500;
    letter-spacing: 0.04em;
  }

  .nav-item:hover,
  .nav-item.active {
    color: var(--color-beer-amber);
  }

  /* ── More sheet (mobile only) ─────────────────────── */
  .sheet-backdrop,
  .more-sheet {
    display: none;
  }

  @media (max-width: 767px) {
    .sheet-backdrop,
    .more-sheet {
      display: revert;
    }
  }

  .sheet-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
    animation: fade-in 150ms ease forwards;
  }

  .more-sheet {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 70;
    background-color: var(--color-bg-card);
    border-top: 1px solid var(--color-border);
    border-radius: 1rem 1rem 0 0;
    padding: 0.5rem 0 calc(1.5rem + env(safe-area-inset-bottom));
    box-shadow: 0 -8px 40px rgba(0, 0, 0, 0.6);
    animation: slide-up 220ms cubic-bezier(0.34, 1.2, 0.64, 1) forwards;
  }

  .sheet-handle {
    width: 36px;
    height: 4px;
    background: var(--color-border);
    border-radius: 2px;
    margin: 0.625rem auto 1.25rem;
  }

  .sheet-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.875rem 1.5rem;
    color: var(--color-beer-foam);
    text-decoration: none;
    transition: background-color 120ms ease;
  }

  .sheet-item:hover {
    background-color: var(--color-bg-surface);
    color: var(--color-beer-foam);
  }

  .sheet-item-icon {
    width: 36px;
    height: 36px;
    border-radius: 0.5rem;
    background-color: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-beer-amber);
    flex-shrink: 0;
  }

  .sheet-item-label {
    flex: 1;
    font-family: var(--font-body);
    font-size: 0.95rem;
    font-weight: 600;
  }

  .sheet-item-chevron {
    color: var(--color-text-muted);
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slide-up {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  button.sheet-item {
    width: 100%;
    text-align: left;
    cursor: pointer;
  }

  button.sidebar-link {
    background: none;
    border: none;
    cursor: pointer;
    width: 100%;
    text-align: left;
  }
</style>
