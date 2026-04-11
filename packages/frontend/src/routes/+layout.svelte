<script lang="ts">
  import '../app.css'
  import { onMount } from 'svelte'
  import { initSseConnection } from '$lib/sse.svelte'

  let { children } = $props()

  onMount(() => initSseConnection())
</script>

<main>
  {@render children()}
</main>
