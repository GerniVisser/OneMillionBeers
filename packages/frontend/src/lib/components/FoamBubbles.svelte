<script lang="ts">
  const bubbles = Array.from({ length: 10 }, (_, i) => ({
    id: i,
    left: `${8 + i * 9}%`,
    size: `${6 + (i % 4) * 4}px`,
    delay: `${i * 0.6}s`,
    duration: `${5 + (i % 3) * 2}s`,
    opacity: 0.2 + (i % 3) * 0.1,
  }))
</script>

<div
  aria-hidden="true"
  style="position: absolute; inset: 0; overflow: hidden; pointer-events: none;"
>
  {#each bubbles as b (b.id)}
    <div
      style="
        position: absolute;
        bottom: -20px;
        left: {b.left};
        width: {b.size};
        height: {b.size};
        border-radius: 50%;
        background: var(--color-beer-amber);
        opacity: {b.opacity};
        animation: float-up {b.duration} ease-in {b.delay} infinite;
      "
    ></div>
  {/each}
</div>

<style>
  @media (prefers-reduced-motion: reduce) {
    div > div {
      animation: none !important;
    }
  }
</style>
