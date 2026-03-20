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

<article class="card card-hover" style="overflow: hidden; border-radius: 1rem;">
  <div style="aspect-ratio: 1; overflow: hidden;">
    <img
      src={item.photoUrl}
      alt="Beer logged by {displayName}"
      loading="lazy"
      style="width: 100%; height: 100%; object-fit: cover; display: block;"
    />
  </div>
  <div style="padding: 0.75rem;">
    <div
      style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;"
    >
      <div style="min-width: 0;">
        <a
          href="/users/{item.user.slug}"
          style="font-weight: 600; font-size: 0.9rem; color: var(--color-beer-foam); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
        >
          {displayName}
        </a>
        <a
          href="/groups/{item.group.slug}"
          style="font-size: 0.78rem; color: var(--color-text-muted); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
        >
          {item.group.name}
        </a>
      </div>
      <span
        style="font-size: 0.75rem; color: var(--color-text-muted); white-space: nowrap; flex-shrink: 0;"
      >
        {ago}
      </span>
    </div>
  </div>
</article>
