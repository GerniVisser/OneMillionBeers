<script lang="ts">
  let { onclose }: { onclose: () => void } = $props()

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose()
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="backdrop"
  role="presentation"
  onclick={onclose}
  onkeydown={(e) => e.key === 'Escape' && onclose()}
></div>

<div class="modal" role="dialog" aria-modal="true" aria-label="About OneMillionBeers">
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
    <div class="beer-icon">🍺</div>
    <h2 class="modal-title">OneMillionBeers</h2>
    <p class="modal-tagline">One mission. One million beers.</p>
  </div>

  <div class="modal-body">
    <p class="modal-description">
      Friends log beers in their WhatsApp groups every day. We thought —
      <em>what if we counted them all?</em>
    </p>

    <div class="how-it-works">
      <div class="step">
        <span class="step-icon">📸</span>
        <div>
          <strong>Snap it</strong>
          <span>Send a beer photo to your WhatsApp group</span>
        </div>
      </div>
      <div class="step">
        <span class="step-icon">🤖</span>
        <div>
          <strong>Bot logs it</strong>
          <span>Our bot catches every beer, every group</span>
        </div>
      </div>
      <div class="step">
        <span class="step-icon">📊</span>
        <div>
          <strong>Watch it grow</strong>
          <span>Live stats, leaderboards, and the grand total</span>
        </div>
      </div>
    </div>

    <div class="goal-bar">
      <span class="goal-label">The goal</span>
      <span class="goal-number">1,000,000 beers</span>
    </div>
  </div>

  <div class="modal-footer">
    <a
      href="https://github.com/GerniVisser/OMB/issues/new"
      target="_blank"
      rel="noopener"
      class="footer-link"
    >
      Found a bug?
    </a>
    <span class="footer-dot">·</span>
    <span class="footer-credit">Made with 🍺 by friends</span>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    animation: fade-in 150ms ease forwards;
  }

  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 90;
    width: min(480px, calc(100vw - 2rem));
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
    background-color: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 1.25rem;
    box-shadow:
      0 0 0 1px rgba(245, 158, 11, 0.1),
      0 24px 64px rgba(0, 0, 0, 0.7),
      0 8px 32px rgba(245, 158, 11, 0.08);
    animation: modal-in 240ms cubic-bezier(0.34, 1.3, 0.64, 1) forwards;
  }

  .close-btn {
    position: absolute;
    top: 1rem;
    right: 1rem;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1px solid var(--color-border);
    background: var(--color-bg-surface);
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition:
      color 120ms ease,
      background-color 120ms ease;
  }

  .close-btn:hover {
    color: var(--color-beer-foam);
    background-color: var(--color-border);
  }

  /* Header */
  .modal-header {
    padding: 1.375rem 2rem 1rem;
    text-align: center;
    background: linear-gradient(160deg, rgba(245, 158, 11, 0.07) 0%, transparent 60%);
    border-bottom: 1px solid var(--color-border-muted);
  }

  .beer-icon {
    font-size: 2rem;
    line-height: 1;
    margin-bottom: 0.5rem;
    display: block;
    filter: drop-shadow(0 0 16px rgba(245, 158, 11, 0.4));
    animation: bob 3s ease-in-out infinite;
  }

  .modal-title {
    font-family: var(--font-display);
    font-size: 1.3rem;
    font-weight: 800;
    color: var(--color-beer-foam);
    margin: 0 0 0.2rem;
    letter-spacing: -0.02em;
  }

  .modal-tagline {
    font-family: var(--font-body);
    font-size: 0.78rem;
    color: var(--color-beer-amber);
    margin: 0;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  /* Body */
  .modal-body {
    padding: 1rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
  }

  .modal-description {
    font-family: var(--font-body);
    font-size: 0.95rem;
    color: var(--color-text-muted);
    margin: 0;
    line-height: 1.6;
    text-align: center;
  }

  .modal-description em {
    color: var(--color-beer-foam);
    font-style: normal;
    font-weight: 700;
  }

  .how-it-works {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 0.5rem 0.875rem;
    background-color: var(--color-bg-surface);
    border: 1px solid var(--color-border-muted);
    border-radius: 0.75rem;
  }

  .step-icon {
    font-size: 1.4rem;
    flex-shrink: 0;
    width: 2rem;
    text-align: center;
  }

  .step div {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .step strong {
    font-family: var(--font-body);
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--color-beer-foam);
  }

  .step span {
    font-family: var(--font-body);
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .goal-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.625rem 1rem;
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(251, 191, 36, 0.06));
    border: 1px solid rgba(245, 158, 11, 0.25);
    border-radius: 0.75rem;
  }

  .goal-label {
    font-family: var(--font-body);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .goal-number {
    font-family: var(--font-display);
    font-size: 1.1rem;
    font-weight: 800;
    color: var(--color-beer-amber);
    letter-spacing: -0.02em;
    text-shadow: 0 0 20px rgba(245, 158, 11, 0.4);
  }

  /* Footer */
  .modal-footer {
    padding: 0.75rem 1.5rem;
    border-top: 1px solid var(--color-border-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    background-color: rgba(0, 0, 0, 0.2);
  }

  .footer-link {
    font-family: var(--font-body);
    font-size: 0.8rem;
    color: var(--color-text-muted);
    text-decoration: none;
    transition: color 120ms ease;
  }

  .footer-link:hover {
    color: var(--color-beer-amber);
  }

  .footer-dot {
    color: var(--color-border);
    font-size: 0.8rem;
  }

  .footer-credit {
    font-family: var(--font-body);
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes modal-in {
    from {
      opacity: 0;
      transform: translate(-50%, -48%) scale(0.94);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  @keyframes bob {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-5px);
    }
  }
</style>
