<script lang="ts">
  import { browser } from '$app/environment'
  import { onMount, onDestroy } from 'svelte'
  import type { HourBucket } from '@omb/shared'

  let { hours }: { hours: HourBucket[] } = $props()

  let canvas = $state<HTMLCanvasElement>(null!)
  let chart: import('chart.js').Chart | null = null

  function formatHour(h: number): string {
    if (h === 0) return '12am'
    if (h < 12) return `${h}am`
    if (h === 12) return '12pm'
    return `${h - 12}pm`
  }

  const peakHour = $derived(
    hours.length > 0 ? hours.reduce((a, b) => (b.count > a.count ? b : a)).hour : -1,
  )

  onMount(async () => {
    if (!browser) return
    const { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } =
      await import('chart.js')
    Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip)

    const ctx = canvas.getContext('2d')!

    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: hours.map((h) => formatHour(h.hour)),
        datasets: [
          {
            data: hours.map((h) => h.count),
            backgroundColor: hours.map((h) =>
              h.hour === peakHour ? 'rgba(240, 168, 48, 0.95)' : 'rgba(138, 94, 34, 0.5)',
            ),
            borderColor: hours.map((h) =>
              h.hour === peakHour ? '#f0a830' : 'rgba(74, 52, 24, 0.6)',
            ),
            borderWidth: 1,
            borderRadius: 2,
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
              maxTicksLimit: 8,
            },
            grid: { display: false },
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
