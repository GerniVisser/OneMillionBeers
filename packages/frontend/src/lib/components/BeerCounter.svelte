<script lang="ts">
  let { count = 0 }: { count: number } = $props()

  const DIGITS = 7
  const digits = $derived(String(count).padStart(DIGITS, '0').split(''))
</script>

<div aria-live="polite" aria-label="{count} beers logged" style="text-align: center;">
  <div style="display: inline-flex; gap: 0.125rem;">
    {#each digits as digit, i (i)}
      <span
        style="
          font-family: var(--font-display);
          font-size: clamp(3rem, 10vw, 6rem);
          line-height: 1;
          color: var(--color-beer-amber);
          display: inline-block;
        ">{digit}</span
      >
    {/each}
  </div>
  <p
    style="
      font-family: var(--font-body);
      color: var(--color-text-muted);
      font-size: 1rem;
      margin-top: 0.5rem;
      letter-spacing: 0.05em;
    "
  >
    beers and counting
  </p>
</div>
