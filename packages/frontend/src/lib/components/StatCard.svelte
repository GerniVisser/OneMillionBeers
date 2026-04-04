<script lang="ts">
  let {
    label,
    value,
    sub,
    icon,
    highlight = false,
  }: {
    label: string
    value: string | number
    sub?: string
    icon?: string
    highlight?: boolean
  } = $props()
</script>

<div class="card" style="padding: 1rem 1.125rem;">
  <span class="stat-label">{label}</span>
  <div
    style="
      font-family: var(--font-display);
      font-size: 1.75rem;
      font-weight: 700;
      line-height: 1.1;
      margin-top: 0.25rem;
      font-variant-numeric: tabular-nums;
      color: {highlight ? 'var(--color-accent-glow)' : 'var(--color-beer-amber)'};
    "
  >
    {#if icon}<span
        style="margin-right: 0.2em; font-style: normal; font-family: var(--font-body); font-size: 1.25rem;"
        >{icon}</span
      >{/if}{value}
  </div>
  {#if sub}
    <div
      style="
        font-family: var(--font-body);
        font-size: 0.72rem;
        color: var(--color-text-muted);
        margin-top: 0.2rem;
      "
    >
      {sub}
    </div>
  {/if}
</div>
