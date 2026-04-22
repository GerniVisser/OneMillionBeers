<script lang="ts">
  import type { PageData } from './$types'
  import type { GroupListItem } from '@omb/shared'
  import { getInitials } from '$lib/utils'
  import JoinModal from '$lib/components/JoinModal.svelte'

  let { data }: { data: PageData } = $props()

  let selectedGroup = $state<GroupListItem | null>(null)

  const row1 = [
    '/Autumn_Beer_Toast.jpg',
    '/Beach_Sunset_Toast.jpg',
    '/form_the_sky.jpeg',
    '/Game_Day_Excitement.jpg',
    '/Golden_Sunset.jpg',
  ]
  const row2 = [
    '/Cheers_with_beer.jpg',
    '/Oktoberfest_Friends.jpg',
    '/Sunset_Beach.jpg',
    '/Sunset_Beer_Celebration.jpg',
    '/Sunset_Relaxation.jpg',
  ]
</script>

<svelte:head>
  <title>Join a Group — OneMillionBeers</title>
  <meta
    name="description"
    content="One million awesome moments, one beer at a time. Join a group, snap a photo, and become part of something bigger."
  />
</svelte:head>

<!-- Hero -->
<div class="hero">
  <div class="hero-glow" aria-hidden="true"></div>
  <div class="hero-bubbles" aria-hidden="true">
    <span class="bubble"></span>
    <span class="bubble"></span>
    <span class="bubble"></span>
    <span class="bubble"></span>
    <span class="bubble"></span>
  </div>
  <div class="hero-inner">
    <p class="hero-eyebrow">🍺 OneMillionBeers</p>
    <h1 class="hero-title">
      Your stats.<br />Your memories.<br /><em class="hero-accent">Our mission.</em>
    </h1>
    <p class="hero-body">
      One million awesome moments, one beer at a time. Snap a photo of your beer in the group chat
      and it lives here forever — on the leaderboard, in the feed, part of something bigger.
    </p>

    <div class="ticker-wrap" aria-hidden="true">
      <div class="ticker-vignette"></div>
      <div class="ticker-row">
        <div class="ticker-track ticker-track--fwd">
          {#each [...row1, ...row1] as src, i (i)}
            <img {src} alt="" class="ticker-img" loading="lazy" />
          {/each}
        </div>
      </div>
      <div class="ticker-row">
        <div class="ticker-track ticker-track--rev">
          {#each [...row2, ...row2] as src, i (i)}
            <img {src} alt="" class="ticker-img" loading="lazy" />
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Groups -->
<div class="groups-wrap" id="groups">
  {#if data.groups.length === 0}
    <div class="empty">
      <span class="empty-icon">🔒</span>
      <p class="empty-title">No open groups right now</p>
      <p class="empty-body">
        Check back later, or ask your group admin to enable joining from this page.
      </p>
    </div>
  {:else}
    <div class="groups-header">
      <p class="groups-label stat-label">Open groups</p>
      <p class="groups-count">
        {data.groups.length} group{data.groups.length === 1 ? '' : 's'} open
      </p>
    </div>
    <div class="groups-grid">
      {#each data.groups as group (group.id)}
        <button class="group-card" onclick={() => (selectedGroup = group)}>
          <div class="card-accent"></div>
          <div class="card-content">
            <div class="card-avatar">
              {#if group.avatarUrl}
                <img src={group.avatarUrl} alt="" class="avatar-img" />
              {:else}
                <span class="avatar-initials">{getInitials(group.name)}</span>
              {/if}
            </div>
            <h3 class="card-name">{group.name}</h3>
            <div class="card-stats">
              <div class="stat-block">
                <span class="stat-num">{group.totalBeers.toLocaleString()}</span>
                <span class="stat-lbl">beers</span>
              </div>
              <div class="stat-divider"></div>
              <div class="stat-block">
                <span class="stat-num">{group.memberCount.toLocaleString()}</span>
                <span class="stat-lbl">members</span>
              </div>
            </div>
            <div class="card-cta">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
                />
              </svg>
              Tap to scan &amp; join
            </div>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

{#if selectedGroup}
  <JoinModal group={selectedGroup} onclose={() => (selectedGroup = null)} />
{/if}

<style>
  /* ── Hero ───────────────────────────────────────────── */
  .hero {
    position: relative;
    overflow: hidden;
    padding: 2.75rem 1.5rem 2.5rem;
    background: var(--color-bg-deep);
  }

  .hero-glow {
    position: absolute;
    top: -120px;
    right: -100px;
    width: 600px;
    height: 600px;
    border-radius: 50%;
    background: radial-gradient(
      circle,
      rgba(245, 158, 11, 0.18) 0%,
      rgba(245, 158, 11, 0.06) 40%,
      transparent 70%
    );
    pointer-events: none;
  }

  /* Floating bubbles */
  .hero-bubbles {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .bubble {
    position: absolute;
    bottom: -20px;
    border-radius: 50%;
    background: rgba(245, 158, 11, 0.15);
    animation: rise linear infinite;
  }

  .bubble:nth-child(1) {
    width: 10px;
    height: 10px;
    left: 12%;
    animation-duration: 7s;
    animation-delay: 0s;
  }
  .bubble:nth-child(2) {
    width: 6px;
    height: 6px;
    left: 28%;
    animation-duration: 9s;
    animation-delay: 1.5s;
  }
  .bubble:nth-child(3) {
    width: 14px;
    height: 14px;
    left: 55%;
    animation-duration: 11s;
    animation-delay: 0.8s;
  }
  .bubble:nth-child(4) {
    width: 8px;
    height: 8px;
    left: 72%;
    animation-duration: 8s;
    animation-delay: 3s;
  }
  .bubble:nth-child(5) {
    width: 5px;
    height: 5px;
    left: 88%;
    animation-duration: 6s;
    animation-delay: 2s;
  }

  @keyframes rise {
    0% {
      transform: translateY(0) scale(1);
      opacity: 0;
    }
    10% {
      opacity: 1;
    }
    90% {
      opacity: 0.6;
    }
    100% {
      transform: translateY(-110vh) scale(0.6);
      opacity: 0;
    }
  }

  .hero-inner {
    position: relative;
    max-width: 660px;
    margin: 0 auto;
  }

  .hero-eyebrow {
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-beer-amber);
    margin: 0 0 1.25rem;
    opacity: 0.9;
  }

  .hero-title {
    font-family: var(--font-display);
    font-size: clamp(1.9rem, 5vw, 3rem);
    font-weight: 800;
    color: var(--color-beer-foam);
    letter-spacing: -0.04em;
    line-height: 1.08;
    margin: 0 0 1rem;
  }

  .hero-accent {
    font-style: normal;
    color: var(--color-beer-amber);
    text-shadow:
      0 0 40px rgba(245, 158, 11, 0.4),
      0 2px 12px rgba(217, 119, 6, 0.3);
  }

  .hero-body {
    font-size: 0.9rem;
    color: var(--color-text-muted);
    line-height: 1.65;
    max-width: 480px;
    margin: 0 0 1.5rem;
  }

  /* ── Photo ticker ───────────────────────────────────── */
  .ticker-wrap {
    position: relative;
    margin: 1.5rem -1.5rem 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .ticker-vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
    background: linear-gradient(
      to right,
      var(--color-bg-deep) 0%,
      transparent 12%,
      transparent 88%,
      var(--color-bg-deep) 100%
    );
  }

  .ticker-row {
    overflow: hidden;
  }

  .ticker-track {
    display: flex;
    gap: 0.375rem;
    width: max-content;
  }

  .ticker-track--fwd {
    animation: ticker-fwd 28s linear infinite;
  }

  .ticker-track--rev {
    animation: ticker-fwd 36s linear infinite reverse;
  }

  @keyframes ticker-fwd {
    0% {
      transform: translateX(0);
    }
    100% {
      transform: translateX(-50%);
    }
  }

  .ticker-img {
    width: 80px;
    height: 80px;
    object-fit: cover;
    border-radius: 0.625rem;
    flex-shrink: 0;
    opacity: 0.75;
    border: 1px solid var(--color-border);
  }

  /* ── Groups ─────────────────────────────────────────── */
  .groups-wrap {
    padding: 2rem 1.5rem 5rem;
    max-width: 860px;
    margin: 0 auto;
  }

  .groups-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 1.5rem;
  }

  .groups-label {
    margin: 0;
  }

  .groups-count {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--color-beer-amber);
    margin: 0;
  }

  .groups-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
  }

  @media (min-width: 540px) {
    .groups-grid {
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 1rem;
    }
  }

  /* Group card — portrait style */
  .group-card {
    position: relative;
    display: flex;
    flex-direction: column;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 1rem;
    overflow: hidden;
    cursor: pointer;
    text-align: center;
    transition:
      border-color 150ms ease,
      box-shadow 150ms ease,
      transform 120ms ease;
    padding: 0;
    width: 100%;
  }

  .group-card:hover {
    border-color: rgba(245, 158, 11, 0.5);
    box-shadow:
      0 0 0 4px rgba(245, 158, 11, 0.06),
      0 8px 32px rgba(245, 158, 11, 0.15);
    transform: translateY(-2px);
  }

  .card-accent {
    height: 4px;
    background: linear-gradient(
      90deg,
      var(--color-beer-dark),
      var(--color-beer-amber),
      var(--color-beer-head)
    );
    flex-shrink: 0;
  }

  .card-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1rem 0.875rem 1rem;
    gap: 0.5rem;
    flex: 1;
  }

  @media (min-width: 540px) {
    .card-content {
      padding: 1.5rem 1.25rem 1.25rem;
      gap: 0.625rem;
    }
  }

  .card-avatar {
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
    background: var(--color-bg-surface);
    border: 2px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    margin-bottom: 0.25rem;
    transition: border-color 150ms ease;
  }

  .group-card:hover .card-avatar {
    border-color: rgba(245, 158, 11, 0.4);
  }

  .avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-initials {
    font-family: var(--font-display);
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--color-beer-amber);
  }

  .card-name {
    font-family: var(--font-display);
    font-size: 0.975rem;
    font-weight: 700;
    color: var(--color-beer-foam);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 100%;
  }

  /* Stats */
  .card-stats {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.875rem;
    margin: 0.375rem 0;
    width: 100%;
  }

  .stat-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
  }

  .stat-num {
    font-family: var(--font-display);
    font-size: 1.05rem;
    font-weight: 800;
    color: var(--color-beer-foam);
    line-height: 1;
    letter-spacing: -0.03em;
  }

  @media (min-width: 540px) {
    .stat-num {
      font-size: 1.35rem;
    }

    .card-avatar {
      width: 4rem;
      height: 4rem;
    }
  }

  .stat-lbl {
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .stat-divider {
    width: 1px;
    height: 2rem;
    background: var(--color-border);
    flex-shrink: 0;
  }

  /* CTA hint */
  .card-cta {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    margin-top: auto;
    padding-top: 0.75rem;
    border-top: 1px solid var(--color-border);
    width: 100%;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #25d366;
    opacity: 0.7;
    transition: opacity 150ms ease;
  }

  .group-card:hover .card-cta {
    opacity: 1;
  }

  /* Empty state */
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 5rem 1rem;
    text-align: center;
  }

  .empty-icon {
    font-size: 3rem;
    margin-bottom: 0.75rem;
  }

  .empty-title {
    font-family: var(--font-display);
    font-size: 1.2rem;
    font-weight: 700;
    color: var(--color-beer-foam);
    margin: 0;
  }

  .empty-body {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    max-width: 320px;
    line-height: 1.65;
    margin: 0;
  }
</style>
