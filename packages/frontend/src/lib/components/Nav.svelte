<script lang="ts">
  import { page } from '$app/stores'

  const isActive = (path: string) => $page.url.pathname === path
</script>

<nav class="bottom-nav">
  <a href="/" class="nav-item" class:active={isActive('/')}>
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
    <span>Feed</span>
  </a>

  <a href="/groups" class="nav-item" class:active={isActive('/groups')}>
    <svg
      width="22"
      height="22"
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

  <!-- Capture -->
  <div class="nav-capture-wrap">
    <button class="capture-btn" aria-label="Log a beer">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path
          d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
        />
        <circle cx="12" cy="13" r="4" />
      </svg>
    </button>
    <span class="capture-label">Capture</span>
  </div>

  <a href="/leaderboard" class="nav-item" class:active={isActive('/leaderboard')}>
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect x="18" y="3" width="4" height="18" rx="1" />
      <rect x="10" y="8" width="4" height="13" rx="1" />
      <rect x="2" y="13" width="4" height="8" rx="1" />
    </svg>
    <span>Ranks</span>
  </a>

  <a href="/profile" class="nav-item" class:active={isActive('/profile')}>
    <svg
      width="22"
      height="22"
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
    <span>Me</span>
  </a>
</nav>

<style>
  .bottom-nav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 50;
    display: flex;
    align-items: flex-end;
    justify-content: space-around;
    padding: 0.5rem 0.5rem calc(0.5rem + env(safe-area-inset-bottom));
    background-color: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-top: 1px solid var(--color-border);
  }

  .nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.375rem 0.75rem;
    color: var(--color-cream-faint);
    text-decoration: none;
    transition: color 120ms ease;
    flex: 1;
  }

  .nav-item span {
    font-family: var(--font-body);
    font-size: 0.62rem;
    font-weight: 500;
    letter-spacing: 0.04em;
  }

  .nav-item:hover,
  .nav-item.active {
    color: var(--color-beer-amber);
  }

  /* Capture button */
  .nav-capture-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    flex: 1;
    padding-bottom: 0.375rem;
  }

  .capture-btn {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--color-beer-amber);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    margin-top: -1.25rem;
    box-shadow:
      0 0 0 3px rgba(255, 255, 255, 0.96),
      0 4px 20px rgba(245, 158, 11, 0.4);
    transition:
      background 150ms ease,
      box-shadow 150ms ease,
      transform 120ms ease;
  }

  .capture-btn:hover {
    background: var(--color-beer-dark);
    box-shadow:
      0 0 0 3px rgba(255, 255, 255, 0.96),
      0 4px 28px rgba(245, 158, 11, 0.5);
    transform: scale(1.06);
  }

  .capture-btn:active {
    transform: scale(0.96);
  }

  .capture-label {
    font-family: var(--font-body);
    font-size: 0.62rem;
    font-weight: 500;
    letter-spacing: 0.04em;
    color: var(--color-beer-amber);
  }
</style>
