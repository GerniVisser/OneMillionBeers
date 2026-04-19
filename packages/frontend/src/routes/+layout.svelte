<script lang="ts">
  import '../app.css'
  import { onMount } from 'svelte'
  import { navigating } from '$app/stores'
  import { initSseConnection } from '$lib/sse.svelte'
  import Nav from '$lib/components/Nav.svelte'

  let { children } = $props()

  onMount(() => initSseConnection())
</script>

{#if $navigating}
  <div class="nav-progress" aria-hidden="true"></div>
{/if}

<Nav />

<main class="layout-main" class:loading={$navigating}>
  {@render children()}
</main>

<style>
  /* Navigation progress bar */
  .nav-progress {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    z-index: 200;
    box-shadow:
      0 0 8px var(--color-beer-amber),
      0 0 2px var(--color-beer-dark);
    background: linear-gradient(
      90deg,
      transparent 0%,
      var(--color-beer-amber) 30%,
      var(--color-beer-dark) 50%,
      var(--color-beer-amber) 70%,
      transparent 100%
    );
    background-size: 200% 100%;
    animation: nav-shimmer 1s linear infinite;
  }

  @keyframes nav-shimmer {
    0% {
      background-position: 100% 0;
    }
    100% {
      background-position: -100% 0;
    }
  }

  /* Mobile: clear the fixed bottom bar */
  .layout-main {
    padding-bottom: calc(3.5rem + env(safe-area-inset-bottom));
    transition: opacity 0.15s ease;
  }

  .layout-main.loading {
    opacity: 0.4;
    pointer-events: none;
  }

  /* Desktop: indent content past the sidebar */
  @media (min-width: 768px) {
    .layout-main {
      margin-left: 220px;
      padding-bottom: 0;
    }
  }
</style>
