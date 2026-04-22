<script lang="ts">
  import { onMount } from 'svelte'
  import QRCode from 'qrcode'
  import { getGroupInviteCode } from '$lib/api'
  import { getInitials } from '$lib/utils'

  type GroupLike = {
    slug: string
    name: string
    avatarUrl?: string | null
    totalBeers: number
    memberCount?: number
  }

  let { group, onclose }: { group: GroupLike; onclose: () => void } = $props()

  let dialog = $state<HTMLDialogElement | null>(null)
  let inviteUrl = $state<string | null>(null)
  let qrDataUrl = $state<string | null>(null)
  let loading = $state(true)
  let error = $state(false)
  let copied = $state(false)

  onMount(() => {
    dialog?.showModal()
    loadInvite()

    return () => dialog?.close()
  })

  async function loadInvite() {
    try {
      const result = await getGroupInviteCode(fetch, group.slug)
      inviteUrl = result.inviteUrl
      qrDataUrl = await QRCode.toDataURL(inviteUrl, {
        width: 240,
        margin: 2,
        color: { dark: '#1c0f00', light: '#fef3c7' },
        errorCorrectionLevel: 'M',
      })
    } catch {
      error = true
    } finally {
      loading = false
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === dialog) onclose()
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose()
  }

  async function handleShare() {
    if (!inviteUrl) return
    if (navigator.share) {
      await navigator.share({ title: `Join ${group.name} on OneMillionBeers`, url: inviteUrl })
    } else {
      await navigator.clipboard.writeText(inviteUrl)
      copied = true
      setTimeout(() => (copied = false), 2000)
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<dialog
  bind:this={dialog}
  class="join-dialog"
  onclick={handleBackdropClick}
  aria-label="Join {group.name}"
>
  <div class="modal-inner" role="presentation" onclick={(e) => e.stopPropagation()}>
    <button class="close-btn" onclick={onclose} aria-label="Close">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>

    <div class="modal-header">
      <div class="group-avatar">
        {#if group.avatarUrl}
          <img src={group.avatarUrl} alt="" class="avatar-img" />
        {:else}
          <span class="avatar-initials">{getInitials(group.name)}</span>
        {/if}
      </div>
      <div class="group-info">
        <h2 class="group-name">{group.name}</h2>
        <p class="group-meta">
          {#if group.memberCount != null}{group.memberCount.toLocaleString()} contributors ·
          {/if}{group.totalBeers.toLocaleString()} beers
        </p>
      </div>
    </div>

    <div class="qr-section">
      {#if loading}
        <div class="qr-skeleton"></div>
        <p class="qr-caption skeleton-text">Loading invite...</p>
      {:else if error || !qrDataUrl}
        <div class="qr-error">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <p>Invite link not available for this group.</p>
        </div>
      {:else}
        <div class="qr-wrap">
          <img src={qrDataUrl} alt="QR code to join {group.name}" class="qr-img" />
        </div>
        <p class="qr-caption">Scan with your camera to join on WhatsApp</p>
      {/if}
    </div>

    {#if !loading && !error && inviteUrl}
      <div class="modal-actions">
        <a href={inviteUrl} target="_blank" rel="noopener noreferrer" class="btn btn-join">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path
              d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
            />
          </svg>
          Join on WhatsApp
        </a>
        <button class="btn btn-share" onclick={handleShare}>
          {#if copied}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Copied!
          {:else}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
            </svg>
            Share invite
          {/if}
        </button>
      </div>
    {/if}
  </div>
</dialog>

<style>
  .join-dialog {
    border: none;
    background: transparent;
    padding: 0;
    max-width: min(92vw, 420px);
    width: 100%;
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
  }

  .join-dialog::backdrop {
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  .join-dialog {
    animation: modal-pop 220ms cubic-bezier(0.34, 1.3, 0.64, 1) forwards;
  }

  .modal-inner {
    position: relative;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 1.25rem;
    overflow: hidden;
  }

  @keyframes modal-pop {
    from {
      opacity: 0;
      transform: translate(-50%, -48%) scale(0.94);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  .close-btn {
    position: absolute;
    top: 0.875rem;
    right: 0.875rem;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: color 120ms ease;
    z-index: 1;
  }

  .close-btn:hover {
    color: var(--color-beer-foam);
  }

  .modal-header {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 1.25rem 1.25rem 0;
  }

  .group-avatar {
    width: 3.25rem;
    height: 3.25rem;
    border-radius: 50%;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-initials {
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 700;
    color: var(--color-beer-amber);
  }

  .group-info {
    min-width: 0;
    padding-right: 2.5rem;
  }

  .group-name {
    font-family: var(--font-display);
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--color-beer-foam);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 0;
  }

  .group-meta {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin: 0.15rem 0 0;
  }

  /* QR section */
  .qr-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1.5rem 1.25rem 1rem;
    gap: 0.75rem;
  }

  .qr-wrap {
    padding: 0.75rem;
    background: var(--color-beer-foam);
    border-radius: 0.875rem;
    border: 2px solid rgba(245, 158, 11, 0.4);
    box-shadow:
      0 0 0 4px rgba(245, 158, 11, 0.08),
      0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .qr-img {
    display: block;
    width: 200px;
    height: 200px;
    border-radius: 0.375rem;
  }

  .qr-skeleton {
    width: 216px;
    height: 216px;
    border-radius: 0.875rem;
    background: linear-gradient(
      90deg,
      var(--color-bg-surface) 25%,
      rgba(245, 158, 11, 0.06) 50%,
      var(--color-bg-surface) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
  }

  .skeleton-text {
    opacity: 0.4;
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  .qr-caption {
    font-size: 0.78rem;
    color: var(--color-text-muted);
    text-align: center;
    margin: 0;
  }

  .qr-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 1.5rem 0;
    color: var(--color-text-muted);
    text-align: center;
    font-size: 0.875rem;
  }

  /* Action buttons */
  .modal-actions {
    display: flex;
    gap: 0.625rem;
    padding: 0 1.25rem 1.25rem;
  }

  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.7rem 1rem;
    border-radius: 0.625rem;
    font-family: var(--font-body);
    font-size: 0.875rem;
    font-weight: 700;
    cursor: pointer;
    text-decoration: none;
    transition:
      opacity 120ms ease,
      background 120ms ease;
    flex: 1;
  }

  .btn-join {
    background: #25d366;
    color: #fff;
    border: none;
  }

  .btn-join:hover {
    opacity: 0.9;
  }

  .btn-share {
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-beer-foam);
  }

  .btn-share:hover {
    background: var(--color-bg-surface);
  }
</style>
