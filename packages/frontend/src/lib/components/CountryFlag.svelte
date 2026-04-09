<script lang="ts">
  /**
   * CountryFlag — renders a rectangular country flag from jsDelivr (flag-icons).
   *
   * Props:
   *   countryCode  ISO 3166-1 alpha-2 code, e.g. "ZA" or "za"
   *   size         height in pixels (width is derived from 4:3 aspect ratio). Default: 20
   *   class        extra CSS classes forwarded to the wrapper span
   *
   * Falls back to a styled ISO code badge if the CDN image fails to load.
   */

  interface Props {
    countryCode: string
    /** Height in px. Omit to let the parent size the element via CSS. */
    size?: number
    class?: string
  }

  let { countryCode, size, class: className = '' }: Props = $props()

  const code = $derived(countryCode.toLowerCase())
  const src = $derived(`https://cdn.jsdelivr.net/npm/flag-icons@7/flags/4x3/${code}.svg`)

  // When size is provided use explicit px dimensions; otherwise fill the parent.
  const spanStyle = $derived(
    size != null
      ? `height:${size}px; width:${Math.round(size * (4 / 3))}px`
      : 'width:100%; height:100%;',
  )
  const imgHeight = $derived(size ?? undefined)
  const imgWidth = $derived(size != null ? Math.round(size * (4 / 3)) : undefined)

  const label = $derived(
    (() => {
      try {
        return (
          new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode.toUpperCase()) ??
          countryCode.toUpperCase()
        )
      } catch {
        return countryCode.toUpperCase()
      }
    })(),
  )

  let errored = $state(false)

  // Reset error state if countryCode prop changes
  $effect(() => {
    // reading `code` makes this effect re-run when it changes
    code
    errored = false
  })
</script>

<span class="flag {className}" style={spanStyle} role="img" aria-label="{label} flag">
  {#if !errored}
    <img
      {src}
      alt=""
      height={imgHeight}
      width={imgWidth}
      loading="lazy"
      decoding="async"
      onerror={() => (errored = true)}
    />
  {:else}
    <span class="flag-fallback" style="font-size:{Math.max(8, (size ?? 20) * 0.45)}px">
      {countryCode.toUpperCase()}
    </span>
  {/if}
</span>

<style>
  .flag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 2px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.07);
    flex-shrink: 0;
    vertical-align: middle;
    background: var(--color-bg-surface);
  }

  .flag img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .flag-fallback {
    font-weight: 700;
    color: var(--color-text-muted);
    font-family: var(--font-body);
    letter-spacing: 0.04em;
    line-height: 1;
  }
</style>
