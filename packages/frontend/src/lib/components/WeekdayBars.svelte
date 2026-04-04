<script lang="ts">
  import type { WeekdayEntry } from '$lib/utils'

  let {
    days,
    peakDay,
  }: {
    days: WeekdayEntry[]
    peakDay: WeekdayEntry | undefined
  } = $props()
</script>

<div class="weekday-bars">
  {#each days as day}
    <div class="weekday-row">
      <span class="weekday-label">{day.name}</span>
      <div class="weekday-track">
        <div
          class="weekday-fill"
          class:weekday-fill--peak={day === peakDay && day.count > 0}
          style="width:{day.pct * 100}%"
        ></div>
      </div>
      <span class="weekday-count">{day.count.toLocaleString()}</span>
    </div>
  {/each}
</div>

<style>
  .weekday-bars {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    margin-top: 0.25rem;
  }

  .weekday-row {
    display: grid;
    grid-template-columns: 30px 1fr 48px;
    align-items: center;
    gap: 0.5rem;
  }

  .weekday-label {
    font-size: 0.72rem;
    color: var(--color-text-muted);
    font-weight: 500;
  }

  .weekday-track {
    background: var(--color-bg-surface);
    border-radius: 4px;
    height: 8px;
    overflow: hidden;
  }

  .weekday-fill {
    height: 100%;
    background: var(--color-beer-dark);
    border-radius: 4px;
    transition: width 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .weekday-fill--peak {
    background: var(--color-beer-amber);
    box-shadow: 0 0 8px rgba(189, 109, 9, 0.6);
  }

  .weekday-count {
    font-size: 0.72rem;
    color: var(--color-text-muted);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
