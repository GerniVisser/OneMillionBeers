<script lang="ts">
  import type { FeedItem } from '@omb/shared'
  import { getLiveReactions } from '$lib/sse.svelte'
  import CountryFlag from './CountryFlag.svelte'

  let { beer, onopen }: { beer: FeedItem; onopen?: (item: FeedItem) => void } = $props()

  const displayName = $derived(beer.user.displayName ?? beer.user.pseudoName ?? 'Anonymous')
  const reactions = $derived(getLiveReactions(beer.id) ?? beer.reactions)
  const total = $derived(reactions.reduce((sum, r) => sum + r.count, 0))
</script>

<section class="botw card" aria-label="Beer of the week">
  <button
    type="button"
    class="photo"
    onclick={() => onopen?.(beer)}
    aria-label="Enlarge beer of the week by {displayName}"
  >
    <img src={beer.photoUrl} alt="Beer of the week, logged by {displayName}" />
    {#if beer.user.countryCode}
      <span class="flag">
        <CountryFlag countryCode={beer.user.countryCode} />
      </span>
    {/if}
  </button>

  <div class="body">
    <p class="eyebrow">🏆 Beer of the week</p>
    <p class="shoutout">
      Cheers to
      <a href="/users/{beer.user.slug}" class="name">{displayName}</a>
    </p>
    <p class="sub">
      Most-loved beer of the last 7 days in
      <a href="/groups/{beer.group.slug}" class="group">{beer.group.name}</a>
    </p>

    <ul class="reactions" aria-label="{total} {total === 1 ? 'reaction' : 'reactions'}">
      {#each reactions as r (r.emoji)}
        <li class="chip">
          <span class="chip-emoji">{r.emoji}</span>
          <span class="chip-count">{r.count}</span>
        </li>
      {/each}
    </ul>
  </div>
</section>

<style>
  .botw {
    display: flex;
    gap: 0.85rem;
    align-items: center;
    padding: 0.75rem;
    margin-bottom: 1rem;
    border-color: rgba(245, 158, 11, 0.45);
    background:
      radial-gradient(circle at 0% 0%, rgba(245, 158, 11, 0.14), transparent 60%),
      var(--color-bg-card);
  }

  .photo {
    position: relative;
    flex-shrink: 0;
    width: 6.25rem;
    aspect-ratio: 3 / 4;
    padding: 0;
    border: none;
    border-radius: 0.6rem;
    overflow: hidden;
    cursor: zoom-in;
    background: var(--color-bg-surface);
  }

  .photo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .flag {
    position: absolute;
    top: 0.35rem;
    left: 0.35rem;
    width: 18px;
    aspect-ratio: 4 / 3;
    border-radius: 2px;
    overflow: hidden;
    display: flex;
    line-height: 0;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.65);
  }

  .body {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .eyebrow {
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-beer-amber);
  }

  .shoutout {
    font-size: 0.85rem;
    color: var(--color-beer-foam);
  }

  /* Names are single generated words, so they get their own line instead of breaking mid-word */
  .name {
    display: block;
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.25;
    color: var(--color-beer-head);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .name:hover {
    color: var(--color-accent-glow);
  }

  .sub {
    font-size: 0.78rem;
    line-height: 1.35;
    color: var(--color-text-muted);
  }

  .group {
    color: var(--color-beer-foam);
  }

  .group:hover {
    color: var(--color-beer-head);
  }

  .reactions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.25rem;
    padding: 0;
    list-style: none;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    font-size: 0.85rem;
    line-height: 1.2;
  }

  .chip-count {
    font-size: 0.72rem;
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
  }

  @media (min-width: 600px) {
    .botw {
      gap: 1.25rem;
      padding: 1rem;
    }

    .photo {
      width: 10rem;
    }

    .shoutout {
      font-size: 0.95rem;
    }

    .name {
      font-size: 1.5rem;
    }
  }
</style>
