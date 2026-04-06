<script lang="ts">
  import type { ActivityDay } from '@omb/shared'

  let { days }: { days: ActivityDay[] } = $props()

  const countByDate = $derived(new Map(days.map((d) => [d.date, d.count])))
  const maxCount = $derived(days.length > 0 ? Math.max(...days.map((d) => d.count)) : 1)

  const CELL = 13 // px per cell including gap
  const LABEL_OFFSET = 28 // px reserved for day-of-week labels on left
  const MAX_WEEKS = 104 // ~24 months
  const MIN_WEEKS = 4

  let containerWidth = $state(0)

  // How many weeks fit in the available space
  const numWeeks = $derived.by(() => {
    const available = containerWidth - LABEL_OFFSET
    if (available <= 0) return MAX_WEEKS
    return Math.max(MIN_WEEKS, Math.min(MAX_WEEKS, Math.floor(available / CELL)))
  })

  const cells = $derived.by(() => {
    const today = new Date()
    // Go back numWeeks * 7 days, then rewind to the previous Sunday
    const start = new Date(today)
    start.setDate(start.getDate() - numWeeks * 7)
    start.setDate(start.getDate() - start.getDay())

    const result: Array<{ date: string; count: number; week: number; dow: number }> = []
    const cur = new Date(start)
    let week = 0
    while (cur <= today) {
      const dateStr = cur.toISOString().slice(0, 10)
      const dow = cur.getDay()
      result.push({ date: dateStr, count: countByDate.get(dateStr) ?? 0, week, dow })
      cur.setDate(cur.getDate() + 1)
      if (dow === 6) week++
    }
    return result
  })

  const totalWeeks = $derived(cells.length > 0 ? cells[cells.length - 1].week + 1 : numWeeks)

  const monthLabels = $derived.by(() => {
    const seen = new Set<string>()
    const labels: Array<{ label: string; week: number }> = []
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]
    for (const cell of cells) {
      const monthKey = cell.date.slice(0, 7)
      if (!seen.has(monthKey)) {
        seen.add(monthKey)
        const m = parseInt(cell.date.slice(5, 7), 10) - 1
        labels.push({ label: monthNames[m], week: cell.week })
      }
    }
    return labels
  })

  const DOW_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']

  function cellColor(count: number): string {
    if (count === 0) return '#2a1e0e'
    const intensity = Math.min(count / maxCount, 1)
    if (intensity < 0.25) return '#5c3d1a'
    if (intensity < 0.5) return '#d97706'
    if (intensity < 0.75) return '#f59e0b'
    return '#fbbf24'
  }

  let tooltip = $state<{ text: string; x: number; y: number } | null>(null)

  function showTooltip(cell: { date: string; count: number }, event: MouseEvent) {
    const d = new Date(cell.date + 'T12:00:00')
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const beerLabel =
      cell.count === 0 ? 'No beers' : cell.count === 1 ? '1 beer' : `${cell.count} beers`
    tooltip = { text: `${beerLabel} · ${label}`, x: event.clientX, y: event.clientY }
  }

  function hideTooltip() {
    tooltip = null
  }

  const svgWidth = $derived(LABEL_OFFSET + totalWeeks * CELL)
  const svgHeight = 7 * CELL + 20
</script>

<div class="heatmap-wrap" bind:clientWidth={containerWidth}>
  {#if containerWidth > 0}
    <svg
      width={svgWidth}
      height={svgHeight}
      role="img"
      aria-label="Beer activity heatmap"
      style="display:block; overflow: visible;"
    >
      <!-- Month labels -->
      {#each monthLabels as { label, week }}
        <text
          x={LABEL_OFFSET + week * CELL + 1}
          y={10}
          font-size="9"
          fill="var(--color-text-muted)"
          font-family="var(--font-body)">{label}</text
        >
      {/each}

      <!-- Day-of-week labels -->
      {#each DOW_LABELS as dow, i}
        {#if dow}
          <text
            x={LABEL_OFFSET - 4}
            y={20 + i * CELL + CELL * 0.75}
            font-size="9"
            fill="var(--color-text-muted)"
            font-family="var(--font-body)"
            text-anchor="end">{dow}</text
          >
        {/if}
      {/each}

      <!-- Cells -->
      {#each cells as cell}
        <rect
          x={LABEL_OFFSET + cell.week * CELL}
          y={20 + cell.dow * CELL}
          width={CELL - 2}
          height={CELL - 2}
          rx="2"
          fill={cellColor(cell.count)}
          role="img"
          aria-label="{cell.date}: {cell.count} beer{cell.count === 1 ? '' : 's'}"
          style="cursor: pointer;"
          onmouseenter={(e) => showTooltip(cell, e)}
          onmouseleave={hideTooltip}
        />
      {/each}
    </svg>
  {/if}

  {#if tooltip}
    <div class="heatmap-tooltip" style="left:{tooltip.x + 12}px; top:{tooltip.y - 36}px;">
      {tooltip.text}
    </div>
  {/if}
</div>

<style>
  .heatmap-wrap {
    width: 100%;
    position: relative;
    padding-bottom: 4px;
  }

  .heatmap-tooltip {
    position: fixed;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    color: var(--color-beer-foam);
    font-family: var(--font-body);
    font-size: 0.75rem;
    padding: 4px 8px;
    border-radius: 4px;
    pointer-events: none;
    white-space: nowrap;
    z-index: 100;
  }
</style>
