<script lang="ts">
  import { browser } from '$app/environment'
  import { onMount, onDestroy } from 'svelte'
  import type { MonthBucket } from '@omb/shared'

  let { months }: { months: MonthBucket[] } = $props()

  let canvas = $state<HTMLCanvasElement>(null!)
  let chart: import('chart.js').Chart | null = null

  function formatMonth(m: string): string {
    const [year, month] = m.split('-')
    const names = [
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
    return `${names[parseInt(month, 10) - 1]} '${year.slice(2)}`
  }

  onMount(async () => {
    if (!browser) return
    const {
      Chart,
      LineController,
      LineElement,
      PointElement,
      CategoryScale,
      LinearScale,
      Tooltip,
      Filler,
    } = await import('chart.js')
    Chart.register(
      LineController,
      LineElement,
      PointElement,
      CategoryScale,
      LinearScale,
      Tooltip,
      Filler,
    )

    const ctx = canvas.getContext('2d')!

    const gradient = ctx.createLinearGradient(0, 0, 0, 220)
    gradient.addColorStop(0, 'rgba(240, 168, 48, 0.35)')
    gradient.addColorStop(1, 'rgba(240, 168, 48, 0.0)')

    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: months.map((m) => formatMonth(m.month)),
        datasets: [
          {
            data: months.map((m) => m.count),
            borderColor: '#bd6d09',
            backgroundColor: gradient,
            borderWidth: 2,
            pointBackgroundColor: '#f0a830',
            pointRadius: 3,
            pointHoverRadius: 5,
            fill: true,
            tension: 0.3,
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
              maxTicksLimit: 12,
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
  <div style="position: relative; height: 220px;">
    <canvas bind:this={canvas}></canvas>
  </div>
{/if}
