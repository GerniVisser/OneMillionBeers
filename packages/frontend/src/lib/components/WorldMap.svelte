<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import type { CountryStat } from '@omb/shared'
  import { NUM_TO_A2 } from '../enums'
  import CountryFlag from './CountryFlag.svelte'

  let { countries }: { countries: CountryStat[] } = $props()

  let svgEl = $state<SVGSVGElement | undefined>()
  let gEl = $state<SVGGElement | undefined>()
  let mapReady = $state(false)
  let cleanup: (() => void) | undefined

  // ── Tooltip state ─────────────────────────────────────────────────────────
  type TooltipState = {
    countryCode: string
    countryName: string
    beerCount: number
    userCount: number
  }
  let tooltip = $state<TooltipState | null>(null)

  // ── Colour scale — manual log interpolation ────────────────────────────────
  const ZERO = '#1e1510'
  const STOPS = [
    { r: 61, g: 42, b: 20 }, // #3d2a14  few beers
    { r: 217, g: 119, b: 6 }, // #d97706  some beers
    { r: 245, g: 158, b: 11 }, // #f59e0b  many beers
    { r: 252, g: 211, b: 77 }, // #fcd34d  lots of beers
  ]

  function logColor(count: number, maxCount: number): string {
    if (!count || count <= 0) return ZERO
    if (maxCount <= 1) return `rgb(${STOPS[0].r},${STOPS[0].g},${STOPS[0].b})`
    const t = Math.max(0, Math.min(1, Math.log(count) / Math.log(maxCount)))
    const seg = t * (STOPS.length - 1)
    const idx = Math.min(Math.floor(seg), STOPS.length - 2)
    const frac = seg - idx
    const a = STOPS[idx]
    const b = STOPS[idx + 1]
    return `rgb(${Math.round(a.r + (b.r - a.r) * frac)},${Math.round(a.g + (b.g - a.g) * frac)},${Math.round(a.b + (b.b - a.b) * frac)})`
  }

  onMount(async () => {
    const [{ geoNaturalEarth1, geoPath }, { zoom: d3zoom }, { feature }, { select }, topology] =
      await Promise.all([
        import('d3-geo'),
        import('d3-zoom'),
        import('topojson-client'),
        import('d3-selection'),
        fetch('/world-110m.json').then((r) => r.json()),
      ])

    type GeoFeature = GeoJSON.Feature<GeoJSON.Geometry, GeoJSON.GeoJsonProperties> & {
      id?: string | number
    }

    const W = 960
    const H = 500
    const countryMap = new Map(countries.map((c) => [c.countryCode.toUpperCase(), c.beerCount]))
    const userMap = new Map(countries.map((c) => [c.countryCode.toUpperCase(), c.userCount]))
    const maxCount = Math.max(...countryMap.values(), 1)

    const displayNames = new Intl.DisplayNames(['en'], { type: 'region' })

    const fc = feature(
      topology,
      topology.objects.countries,
    ) as unknown as GeoJSON.FeatureCollection<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>
    const features = fc.features as GeoFeature[]

    const projection = geoNaturalEarth1().fitSize([W, H], fc)
    const path = geoPath().projection(projection)
    const svgSel = select(svgEl!)
    const g = select(gEl!)

    // Country path fills
    g.selectAll<SVGPathElement, GeoFeature>('path')
      .data(features)
      .join('path')
      .attr('d', (d) => path(d) ?? '')
      .attr('fill', (d) => {
        const a2 = NUM_TO_A2[String(d.id).padStart(3, '0')]
        return logColor(a2 ? (countryMap.get(a2) ?? 0) : 0, maxCount)
      })
      .attr('stroke', '#1a1209')
      .attr('stroke-width', '0.3')
      .attr('cursor', (d) => {
        const a2 = NUM_TO_A2[String(d.id).padStart(3, '0')]
        return a2 && countryMap.has(a2) ? 'pointer' : 'default'
      })
      // ── Hover (desktop only) ──────────────────────────────────────────────
      .on('mouseenter', function (_event: MouseEvent, d: GeoFeature) {
        const a2 = NUM_TO_A2[String(d.id).padStart(3, '0')]
        if (!a2 || !countryMap.has(a2)) return
        tooltip = {
          countryCode: a2,
          countryName: displayNames.of(a2) ?? a2,
          beerCount: countryMap.get(a2) ?? 0,
          userCount: userMap.get(a2) ?? 0,
        }
      })
      .on('mouseleave', function () {
        tooltip = null
      })
      // ── Click / tap ───────────────────────────────────────────────────────
      .on('click', function (event: MouseEvent, d: GeoFeature) {
        event.stopPropagation()
        const a2 = NUM_TO_A2[String(d.id).padStart(3, '0')]
        if (!a2 || !countryMap.has(a2)) {
          tooltip = null
          return
        }
        tooltip = {
          countryCode: a2,
          countryName: displayNames.of(a2) ?? a2,
          beerCount: countryMap.get(a2) ?? 0,
          userCount: userMap.get(a2) ?? 0,
        }
      })

    // Click on SVG background dismisses pinned tooltip
    svgSel.on('click', () => {
      tooltip = null
    })

    // Zoom + pan
    const zoomBehavior = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 16])
      .translateExtent([
        [0, 0],
        [W, H],
      ])
      .on('zoom', (event) => {
        const k: number = event.transform.k
        g.attr('transform', event.transform)
        g.selectAll<SVGPathElement, GeoFeature>('path').attr('stroke-width', String(0.3 / k))
      })

    svgSel.call(zoomBehavior)
    cleanup = () => svgSel.on('.zoom', null)
    mapReady = true
  })

  onDestroy(() => cleanup?.())
</script>

<div class="map-container">
  {#if !mapReady}
    <div class="map-placeholder" aria-hidden="true">
      <span class="map-loading-dot"></span>
    </div>
  {/if}
  <svg bind:this={svgEl} viewBox="0 0 960 500" aria-label="World beer map">
    <g bind:this={gEl}></g>
  </svg>

  {#if tooltip}
    <div class="map-tooltip">
      <div class="tooltip-header">
        <CountryFlag countryCode={tooltip.countryCode} size={16} />
        <span class="tooltip-country">{tooltip.countryName}</span>
      </div>
      <div class="tooltip-row">
        <span class="tooltip-value">{tooltip.beerCount.toLocaleString()}</span>
        <span class="tooltip-label">beers</span>
      </div>
      <div class="tooltip-row">
        <span class="tooltip-value">{tooltip.userCount.toLocaleString()}</span>
        <span class="tooltip-label">{tooltip.userCount === 1 ? 'drinker' : 'drinkers'}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .map-container {
    width: 100%;
    aspect-ratio: 960 / 500;
    background: var(--color-bg-deep);
    border-radius: 0.75rem;
    overflow: hidden;
    position: relative;
    touch-action: none;
  }

  .map-container svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  .map-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-deep);
    z-index: 1;
  }

  .map-loading-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-beer-amber);
    animation: pulse-dot 1.2s ease-in-out infinite;
  }

  /* ── Tooltip ──────────────────────────────────────────────────────────────── */
  .map-tooltip {
    position: absolute;
    top: 0.6rem;
    left: 0.6rem;
    z-index: 10;
    pointer-events: none;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    padding: 0.55rem 0.75rem;
    min-width: 130px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
    animation: tooltip-in 120ms ease both;
  }

  @keyframes tooltip-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .tooltip-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.35rem;
  }

  .tooltip-country {
    font-family: var(--font-display);
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--color-beer-foam);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 150px;
  }

  .tooltip-row {
    display: flex;
    align-items: baseline;
    gap: 0.3rem;
    line-height: 1.4;
  }

  .tooltip-value {
    font-family: var(--font-display);
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--color-beer-amber);
  }

  .tooltip-label {
    font-size: 0.7rem;
    color: var(--color-text-muted);
  }
</style>
