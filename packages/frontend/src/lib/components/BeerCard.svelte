<script lang="ts">
  import type { FeedItem } from '@omb/shared'

  let { item }: { item: FeedItem } = $props()

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  const displayName = $derived(item.user.displayName ?? 'Anonymous')
  const ago = $derived(timeAgo(item.loggedAt))
</script>

<article class="beer-card card-hover">
  <div class="photo-wrap">
    <img src={item.photoUrl} alt="Beer logged by {displayName}" loading="lazy" class="photo" />
    <div class="overlay"></div>
    <div class="meta">
      <div class="meta-left">
        <a href="/users/{item.user.slug}" class="meta-name">{displayName}</a>
        <a href="/groups/{item.group.slug}" class="meta-group">{item.group.name}</a>
      </div>
      <span class="meta-time">{ago}</span>
    </div>
  </div>
</article>

<style>
  .beer-card {
    border-radius: 0.75rem;
    overflow: hidden;
    background-color: var(--color-bg-card);
    border: 1px solid var(--color-border);
  }

  .photo-wrap {
    position: relative;
    aspect-ratio: 4 / 5;
    overflow: hidden;
  }

  .photo {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 300ms ease;
  }

  .beer-card:hover .photo {
    transform: scale(1.03);
  }

  .overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(26, 18, 8, 0.88) 0%, transparent 55%);
    pointer-events: none;
  }

  .meta {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 0.75rem;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 0.5rem;
  }

  .meta-left {
    min-width: 0;
    flex: 1;
  }

  .meta-name {
    display: block;
    font-family: var(--font-body);
    font-weight: 500;
    font-size: 0.85rem;
    color: var(--color-beer-foam);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .meta-name:hover {
    color: var(--color-beer-head);
  }

  .meta-group {
    display: inline-block;
    margin-top: 0.2rem;
    font-size: 0.65rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-beer-amber);
    background: rgba(200, 132, 42, 0.15);
    border: 1px solid rgba(200, 132, 42, 0.3);
    border-radius: 3px;
    padding: 1px 5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .meta-group:hover {
    color: var(--color-accent-glow);
  }

  .meta-time {
    font-family: var(--font-body);
    font-size: 0.7rem;
    color: var(--color-cream-faint);
    white-space: nowrap;
    flex-shrink: 0;
  }
</style>
