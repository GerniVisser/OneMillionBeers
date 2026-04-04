<script lang="ts">
  export type Toast = {
    id: string
    photoUrl: string
    userName: string | null
    groupName: string
    ts: number
  }

  let {
    toasts,
    ondismiss,
  }: {
    toasts: Toast[]
    ondismiss: (id: string) => void
  } = $props()

  function onEnter(el: HTMLElement) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    el.animate(
      [
        { transform: 'translateX(120%)', opacity: 0 },
        { transform: 'translateX(0)', opacity: 1 },
      ],
      { duration: 320, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', fill: 'forwards' },
    )
  }
</script>

<div class="toast-stack" aria-live="polite" aria-label="New beer notifications">
  {#each toasts as toast (toast.id)}
    <div class="toast" use:onEnter>
      <img src={toast.photoUrl} alt="Beer" class="toast-thumb" />
      <div class="toast-body">
        <span class="toast-name">{toast.userName ?? 'Anonymous'}</span>
        <span class="toast-group">{toast.groupName}</span>
      </div>
      <button class="toast-close" onclick={() => ondismiss(toast.id)} aria-label="Dismiss">✕</button
      >
    </div>
  {/each}
</div>

<style>
  .toast-stack {
    position: fixed;
    bottom: 5.5rem;
    right: 1rem;
    z-index: 50;
    display: flex;
    flex-direction: column-reverse;
    gap: 0.5rem;
    pointer-events: none;
  }

  .toast {
    pointer-events: all;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 0.625rem;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-left: 3px solid var(--color-beer-amber);
    border-radius: 0.625rem;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    min-width: 200px;
    max-width: 260px;
    transform: translateX(120%);
  }

  .toast-thumb {
    width: 40px;
    height: 40px;
    border-radius: 0.375rem;
    object-fit: cover;
    flex-shrink: 0;
  }

  .toast-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .toast-name {
    font-family: var(--font-body);
    font-weight: 500;
    font-size: 0.8rem;
    color: var(--color-beer-foam);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .toast-group {
    font-size: 0.65rem;
    font-weight: 500;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--color-beer-amber);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .toast-close {
    flex-shrink: 0;
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: 0.75rem;
    padding: 2px 4px;
    line-height: 1;
    border-radius: 3px;
  }

  .toast-close:hover {
    color: var(--color-beer-foam);
  }
</style>
