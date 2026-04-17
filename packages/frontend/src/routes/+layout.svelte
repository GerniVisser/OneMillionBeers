<script lang="ts">
  import '../app.css'
  import { onMount } from 'svelte'
  import { initSseConnection } from '$lib/sse.svelte'
  import Nav from '$lib/components/Nav.svelte'

  let { children } = $props()

  onMount(() => initSseConnection())
</script>

<Nav />

<main class="layout-main">
  {@render children()}
</main>

<style>
  /* Mobile: clear the fixed bottom bar */
  .layout-main {
    padding-bottom: calc(3.5rem + env(safe-area-inset-bottom));
  }

  /* Desktop: indent content past the sidebar */
  @media (min-width: 768px) {
    .layout-main {
      margin-left: 220px;
      padding-bottom: 0;
    }
  }
</style>
