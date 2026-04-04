<script lang="ts">
  let { trigger }: { trigger: number } = $props()

  let overlay: HTMLDivElement

  $effect(() => {
    if (trigger === 0 || !overlay) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    overlay.animate(
      [
        {
          opacity: 0,
          background:
            'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(240,168,48,0.28) 0%, transparent 70%)',
        },
        {
          opacity: 1,
          background:
            'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(240,168,48,0.28) 0%, transparent 70%)',
        },
        {
          opacity: 0,
          background:
            'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(240,168,48,0) 0%, transparent 70%)',
        },
      ],
      { duration: 900, easing: 'ease-out' },
    )
  })
</script>

<div bind:this={overlay} class="flash-overlay" aria-hidden="true"></div>

<style>
  .flash-overlay {
    position: fixed;
    inset: 0;
    z-index: 45;
    pointer-events: none;
    opacity: 0;
  }
</style>
