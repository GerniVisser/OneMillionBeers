<script lang="ts">
  import { page } from '$app/stores'
  import FoamBubbles from '$lib/components/FoamBubbles.svelte'

  const STATUS_MESSAGES: Record<number, string> = {
    404: 'Looks like someone drank this page.',
    500: 'The bartender dropped something. Try again?',
    403: 'This keg is off limits.',
    503: "The tap's dry for now. We'll be back soon.",
  }

  const status = $derived($page.status)
  const message = $derived(
    STATUS_MESSAGES[status] ?? $page.error?.message ?? 'Something went wrong.',
  )
</script>

<svelte:head>
  <title>Error {status} — OneMillionBeers</title>
</svelte:head>

<section
  style="
    position: relative;
    overflow: hidden;
    min-height: calc(100vh - 8rem);
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 2rem 1rem;
  "
>
  <FoamBubbles />

  <div style="position: relative; z-index: 1; max-width: 500px;">
    <div
      style="
        font-family: var(--font-display);
        font-size: clamp(5rem, 20vw, 9rem);
        color: var(--color-beer-amber);
        line-height: 1;
        letter-spacing: 0.05em;
      "
      class="glow-amber"
    >
      {status}
    </div>

    <p
      style="
        font-family: var(--font-body);
        font-size: 1.25rem;
        color: var(--color-beer-foam);
        margin: 1.5rem 0 2rem;
      "
    >
      {message}
    </p>

    <a
      href="/"
      style="
        display: inline-block;
        background-color: var(--color-beer-amber);
        color: var(--color-bg-deep);
        font-family: var(--font-display);
        font-size: 1.25rem;
        letter-spacing: 0.05em;
        padding: 0.625rem 2rem;
        border-radius: 9999px;
        transition: box-shadow 150ms ease;
      "
      class="error-btn"
    >
      Back to the bar
    </a>
  </div>
</section>

<style>
  .error-btn:hover {
    box-shadow: 0 0 20px rgba(251, 191, 36, 0.5);
    color: var(--color-bg-deep);
  }
</style>
