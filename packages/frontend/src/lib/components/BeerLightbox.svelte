<script lang="ts">
  import type { FeedItem } from '@omb/shared'
  import { timeAgo } from '$lib/utils'

  let {
    item,
    onclose,
  }: {
    item: FeedItem | null
    onclose: () => void
  } = $props()

  let dialog: HTMLDialogElement
  let imgLoaded = $state(false)
  let touchStartY = 0

  $effect(() => {
    if (!dialog) return
    if (item) {
      imgLoaded = false
      dialog.showModal()
    } else {
      dialog.close()
    }
  })

  function handleCancel(e: Event) {
    e.preventDefault()
    onclose()
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === dialog) onclose()
  }

  function handleTouchStart(e: TouchEvent) {
    touchStartY = e.touches[0].clientY
  }

  function handleTouchMove(e: TouchEvent) {
    const dy = e.touches[0].clientY - touchStartY
    if (dy > 60) onclose()
  }
</script>

<dialog
  bind:this={dialog}
  class="lightbox"
  oncancel={handleCancel}
  onclick={handleBackdropClick}
  ontouchstart={handleTouchStart}
  ontouchmove={handleTouchMove}
>
  {#if item}
    <div class="lightbox-inner">
      {#if !imgLoaded}
        <div class="lightbox-skeleton"></div>
      {/if}
      <img
        src={item.photoUrl}
        alt="Beer by {item.user.displayName ?? 'Anonymous'}"
        class="lightbox-img"
        class:loaded={imgLoaded}
        onload={() => {
          imgLoaded = true
        }}
      />
      <div class="lightbox-meta">
        <span class="lmeta-name">{item.user.displayName ?? 'Anonymous'}</span>
        <span class="lmeta-group">{item.group.name}</span>
        <span class="lmeta-time">{timeAgo(item.loggedAt)}</span>
      </div>
      <button class="lightbox-close" onclick={onclose} aria-label="Close image">✕</button>
    </div>
  {/if}
</dialog>

<style>
  .lightbox {
    background: transparent;
    border: none;
    padding: 0;
    margin: auto;
    max-width: min(90vw, 500px);
    width: 100%;
    outline: none;
  }

  .lightbox::backdrop {
    background: rgba(28, 25, 23, 0.88);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .lightbox-inner {
    position: relative;
    border-radius: 1rem;
    overflow: hidden;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    animation: lightbox-in 280ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }

  @media (prefers-reduced-motion: reduce) {
    .lightbox-inner {
      animation: none;
    }
  }

  .lightbox-skeleton {
    position: absolute;
    inset: 0;
    background: var(--color-bg-surface);
    animation: pulse 1.5s ease-in-out infinite;
    z-index: 1;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  .lightbox-img {
    display: block;
    width: 100%;
    aspect-ratio: 4 / 5;
    object-fit: cover;
    opacity: 0;
    transition: opacity 200ms ease;
  }

  .lightbox-img.loaded {
    opacity: 1;
  }

  .lightbox-meta {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 1rem 1rem 0.875rem;
    background: linear-gradient(to top, rgba(18, 8, 2, 0.9) 0%, transparent 100%);
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .lmeta-name {
    font-family: var(--font-body);
    font-weight: 600;
    font-size: 1rem;
    color: var(--color-beer-foam);
  }

  .lmeta-group {
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-beer-amber);
  }

  .lmeta-time {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .lightbox-close {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #ffffff;
    font-size: 0.875rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    backdrop-filter: blur(4px);
  }

  .lightbox-close:hover {
    background: rgba(245, 158, 11, 0.3);
    border-color: var(--color-beer-amber);
  }
</style>
