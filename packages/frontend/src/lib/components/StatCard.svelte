<script lang="ts">
  let {
    label,
    value,
    icon,
  }: {
    label: string
    value: string | number
    icon?: string
  } = $props()
</script>

<div class="card" style="padding: 1.25rem; text-align: center;">
  {#if icon}
    <div style="font-size: 1.75rem; margin-bottom: 0.5rem;">{icon}</div>
  {/if}
  <div
    style="
      font-family: var(--font-display);
      font-size: 2.25rem;
      color: var(--color-beer-amber);
      line-height: 1;
      letter-spacing: 0.02em;
    "
  >
    {value}
  </div>
  <div
    style="
      font-family: var(--font-body);
      font-size: 0.875rem;
      color: var(--color-text-muted);
      margin-top: 0.375rem;
    "
  >
    {label}
  </div>
</div>
