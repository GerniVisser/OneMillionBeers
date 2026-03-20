<script lang="ts">
  let {
    hasMore = false,
    onloadmore,
  }: {
    hasMore: boolean
    onloadmore: () => void
  } = $props()
</script>

{#if hasMore}
  <div style="text-align: center; margin-top: 1.5rem;">
    <button
      onclick={onloadmore}
      style="
        background-color: var(--color-beer-amber);
        color: var(--color-bg-deep);
        font-family: var(--font-display);
        font-size: 1.125rem;
        letter-spacing: 0.05em;
        padding: 0.625rem 2rem;
        border: none;
        border-radius: 9999px;
        cursor: pointer;
        transition: box-shadow 150ms ease, background-color 150ms ease;
      "
      class="load-more-btn"
    >
      Load more
    </button>
  </div>
{/if}

<style>
  .load-more-btn:hover {
    background-color: var(--color-accent-glow);
    box-shadow: 0 0 16px rgba(251, 191, 36, 0.5);
  }
</style>
