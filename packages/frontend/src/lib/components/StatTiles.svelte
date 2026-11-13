<script lang="ts">
  export type StatTile = {
    label: string
    value: string
    note?: string | null
    /** Colours the note: up is good news, down is plain. */
    trend?: 'up' | 'down'
  }

  let { tiles }: { tiles: StatTile[] } = $props()
</script>

<!-- Styled like the header stats bars: three across, hairline dividers -->
<div class="tiles">
  {#each tiles as tile (tile.label)}
    <div class="tile">
      <span class="tile-value">{tile.value}</span>
      <span class="tile-label">{tile.label}</span>
      {#if tile.note}
        <span class="tile-note" class:tile-note--up={tile.trend === 'up'}>{tile.note}</span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .tiles {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 0.75rem;
    overflow: hidden;
  }

  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    min-width: 0;
    padding: 0.8rem 0.35rem;
    text-align: center;
    border-right: 1px solid var(--color-border);
    border-bottom: 1px solid var(--color-border);
  }

  .tile:nth-child(3n) {
    border-right: none;
  }

  .tile:nth-last-child(-n + 3) {
    border-bottom: none;
  }

  .tile-value {
    font-family: var(--font-display);
    font-size: clamp(1.1rem, 4.4vw, 1.5rem);
    font-weight: 700;
    line-height: 1;
    color: var(--color-beer-amber);
    font-variant-numeric: tabular-nums;
  }

  .tile-label {
    font-size: 0.55rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .tile-note {
    font-size: 0.6rem;
    color: var(--color-text-muted);
  }

  .tile-note--up {
    color: var(--color-positive);
  }
</style>
