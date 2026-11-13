<script lang="ts">
  import { getInitials } from '$lib/utils'
  import CountryFlag from './CountryFlag.svelte'

  export type TopListItem = {
    key: string
    href: string
    name: string
    count: number
    sub?: string
    countryCode?: string | null
    imageUrl?: string | null
  }

  let { title, unit, items }: { title: string; unit: string; items: TopListItem[] } = $props()

  const PODIUM_COLORS = [
    'var(--color-rank-gold)',
    'var(--color-rank-silver)',
    'var(--color-rank-bronze)',
  ]
</script>

<div class="top">
  <div class="top-head">
    <h3 class="top-title">{title}</h3>
    <span class="top-title">{unit}</span>
  </div>
  {#if items.length === 0}
    <p class="top-empty">No data yet.</p>
  {:else}
    <ol class="top-list">
      {#each items as item, i (item.key)}
        <li>
          <a
            href={item.href}
            class="top-row"
            style={PODIUM_COLORS[i] ? `--podium-color: ${PODIUM_COLORS[i]}` : undefined}
          >
            <span class="top-rank" class:top-rank--podium={PODIUM_COLORS[i]}>{i + 1}</span>
            <span class="top-avatar">
              {#if item.imageUrl}
                <img src={item.imageUrl} alt="" loading="lazy" />
              {:else if item.countryCode}
                <CountryFlag countryCode={item.countryCode} size={26} />
              {:else}
                <span class="top-initials">{getInitials(item.name)}</span>
              {/if}
            </span>
            <span class="top-main">
              <span class="top-name">{item.name}</span>
              {#if item.sub}<span class="top-sub">{item.sub}</span>{/if}
            </span>
            <span class="top-count">{item.count.toLocaleString()}</span>
          </a>
        </li>
      {/each}
    </ol>
  {/if}
</div>

<style>
  .top-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.5rem;
  }

  .top-title {
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .top-empty {
    padding: 1rem 0;
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .top-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .top-list li + li {
    border-top: 1px solid var(--color-border);
  }

  .top-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.45rem 0;
    text-decoration: none;
  }

  .top-rank {
    width: 1rem;
    flex-shrink: 0;
    text-align: right;
    font-family: var(--font-display);
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--color-text-muted);
  }

  .top-rank--podium {
    color: var(--podium-color);
  }

  .top-avatar {
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
  }

  .top-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .top-initials {
    font-family: var(--font-display);
    font-size: 0.6rem;
    font-weight: 700;
    color: var(--color-beer-head);
  }

  .top-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .top-name {
    font-size: 0.84rem;
    color: var(--color-beer-foam);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .top-row:hover .top-name {
    color: var(--color-beer-head);
  }

  .top-sub {
    font-size: 0.65rem;
    color: var(--color-text-muted);
  }

  .top-count {
    flex-shrink: 0;
    font-family: var(--font-display);
    font-size: 0.92rem;
    font-weight: 700;
    color: var(--color-beer-amber);
    font-variant-numeric: tabular-nums;
  }
</style>
