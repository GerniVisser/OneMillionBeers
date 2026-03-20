<script lang="ts">
  let { count = 0, target = 1_000_000 }: { count: number; target?: number } = $props()

  const pct = $derived(Math.min((count / target) * 100, 100).toFixed(2))
  const formatted = $derived(count.toLocaleString())
  const targetFormatted = $derived(target.toLocaleString())
</script>

<div style="width: 100%;">
  <div
    style="
      background-color: var(--color-bg-surface);
      border-radius: 9999px;
      height: 12px;
      overflow: hidden;
    "
    role="progressbar"
    aria-valuenow={count}
    aria-valuemin={0}
    aria-valuemax={target}
    aria-label="Progress to one million beers"
  >
    <div
      style="
        height: 100%;
        width: {pct}%;
        background: linear-gradient(90deg, var(--color-beer-dark), var(--color-beer-amber), var(--color-accent-glow));
        border-radius: 9999px;
        transition: width 1s ease-out;
      "
    ></div>
  </div>
  <div
    style="
      display: flex;
      justify-content: space-between;
      margin-top: 0.375rem;
      font-size: 0.8rem;
      color: var(--color-text-muted);
    "
  >
    <span>{formatted} / {targetFormatted}</span>
    <span>{pct}%</span>
  </div>
</div>
