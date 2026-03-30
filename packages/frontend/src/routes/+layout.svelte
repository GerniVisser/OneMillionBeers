<script lang="ts">
  import '../app.css'
  import Nav from '$lib/components/Nav.svelte'

  let { children } = $props()
</script>

<header class="app-header">
  <a href="/" class="app-logo">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 2h10l1 4H5L6 2Z" fill="var(--color-beer-amber)" opacity="0.9" />
      <rect
        x="5"
        y="6"
        width="14"
        height="14"
        rx="2"
        fill="var(--color-beer-amber)"
        opacity="0.15"
        stroke="var(--color-beer-amber)"
        stroke-width="1.5"
      />
      <path
        d="M17 10h2a2 2 0 0 1 0 4h-2"
        stroke="var(--color-beer-amber)"
        stroke-width="1.5"
        stroke-linecap="round"
      />
      <path
        d="M8 10v6M12 10v6"
        stroke="var(--color-beer-foam)"
        stroke-width="1.2"
        stroke-linecap="round"
        opacity="0.5"
      />
    </svg>
    <span class="app-logo-text">OneMillionBeers</span>
  </a>
</header>

<main style="padding-bottom: calc(5rem + env(safe-area-inset-bottom));">
  {@render children()}
</main>
<Nav />

<style>
  .app-header {
    position: sticky;
    top: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    padding: 0.875rem 1.25rem;
    background-color: rgba(24, 17, 10, 0.92);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--color-border);
  }

  .app-logo {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    text-decoration: none;
  }

  .app-logo-text {
    font-family: var(--font-display);
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--color-beer-foam);
    letter-spacing: -0.01em;
  }

  .app-logo:hover .app-logo-text {
    color: var(--color-beer-amber);
  }
</style>
