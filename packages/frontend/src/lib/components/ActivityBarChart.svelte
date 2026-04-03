<script lang="ts">
  import { browser } from '$app/environment'
  import { onMount, onDestroy } from 'svelte'
  import type { ActivityDay } from '@omb/shared'

  let { days }: { days: ActivityDay[] } = $props()

  let canvas = $state<HTMLCanvasElement>(null!)
  let chart: import('chart.js').Chart | null = null

  // Last 30 days: build a complete array (fill zeros for missing days)
  const last30 = $derived.by(() => {
    const result: ActivityDay[] = []
    const countMap = new Map(days.map((d) => [d.date, d.count]))
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().slice(0, 10)
      result.push({ date: dateStr, count: countMap.get(dateStr) ?? 0 })
    }
    return result
  })

  const labels = $derived(
    last30.map((d) => {
      const dt = new Date(d.date + 'T12:00:00')
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }),
  )

  const counts = $derived(last30.map((d) => d.count))

  onMount(async () => {
    if (!browser) return
    const { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } =
      await import('chart.js')
    Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip)

    const ctx = canvas.getContext('2d')!

    const gradient = ctx.createLinearGradient(0, 0, 0, 200)
    gradient.addColorStop(0, 'rgba(240, 168, 48, 0.9)')
    gradient.addColorStop(1, 'rgba(138, 94, 34, 0.4)')

    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            data: counts,
            backgroundColor: gradient,
            borderColor: 'rgba(189, 109, 9, 0.8)',
            borderWidth: 1,
            borderRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#241808',
            borderColor: '#4a3418',
            borderWidth: 1,
            titleColor: '#fdf4e4',
            bodyColor: '#a08860',
            callbacks: {
              label: (ctx) => `${ctx.parsed.y} beer${ctx.parsed.y === 1 ? '' : 's'}`,
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: '#a08860',
              font: { size: 10 },
              maxRotation: 45,
              autoSkip: true,
              maxTicksLimit: 10,
            },
            grid: { color: 'rgba(74, 52, 24, 0.3)' },
          },
          y: {
            ticks: { color: '#a08860', font: { size: 11 } },
            grid: { color: 'rgba(74, 52, 24, 0.3)' },
            beginAtZero: true,
          },
        },
      },
    })
  })

  onDestroy(() => {
    chart?.destroy()
  })
</script>

{#if browser}
  <div style="position: relative; height: 200px;">
    <canvas bind:this={canvas}></canvas>
  </div>
{/if}
