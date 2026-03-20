# OneMillionBeers — Design System

## Visual Language

**Theme:** Dark warm pub meets retro arcade scoreboard. Celebratory but not garish. Think amber beer held up to candlelight, digital numbers counting up, foam bubbles drifting through warm dark air.

The palette is warm and dark — deep mahogany backgrounds, glowing amber accents, cream-coloured text. No stark white. No cold blues or greys. Every element should feel like it belongs in a cosy, dimly-lit pub that also happens to have a giant scoreboard on the wall.

---

## Colour Palette

All tokens are defined in `app.css` under `@theme {}` and become Tailwind utility classes automatically (Tailwind v4 CSS-first).

| Token                 | Hex       | Use                                                |
| --------------------- | --------- | -------------------------------------------------- |
| `--color-bg-deep`     | `#1c0a00` | Page background                                    |
| `--color-bg-card`     | `#2d1200` | Card surface                                       |
| `--color-bg-surface`  | `#3d1a00` | Elevated surfaces, borders, progress bar track     |
| `--color-beer-amber`  | `#f59e0b` | Primary accent — links, headlines, primary actions |
| `--color-beer-dark`   | `#92400e` | Secondary amber — borders, gradient start          |
| `--color-beer-foam`   | `#fef3c7` | Primary body text                                  |
| `--color-beer-head`   | `#fffbeb` | Bright highlights — hero headings                  |
| `--color-accent-glow` | `#fbbf24` | Glow effects, hover states                         |
| `--color-text-muted`  | `#d97706` | Labels, metadata, secondary text                   |
| `--color-rank-gold`   | `#ffd700` | Rank 1 badge                                       |
| `--color-rank-silver` | `#c0c0c0` | Rank 2 badge                                       |
| `--color-rank-bronze` | `#cd7f32` | Rank 3 badge                                       |

---

## Typography

| Font        | Variable         | Use                                                                      |
| ----------- | ---------------- | ------------------------------------------------------------------------ |
| **Bangers** | `--font-display` | Display text: beer counter, headings, rank badges, nav logo, error codes |
| **Fredoka** | `--font-body`    | Body copy: labels, card metadata, descriptions, footer                   |

Both loaded from Google Fonts via `<link>` in `app.html`. No fallback webfonts — system sans-serif fallbacks are acceptable during load.

### Scale conventions

- **Counter digits** — `clamp(3rem, 10vw, 6rem)`, Bangers
- **Hero heading** — `clamp(2rem, 6vw, 3rem)`, Bangers, `glow-amber`
- **Section heading (h2)** — `1.75rem`, Bangers, `color-beer-amber`
- **Card body** — `0.9rem`, Fredoka
- **Metadata / labels** — `0.78–0.875rem`, Fredoka, `color-text-muted`
- **Stat values** — `2.25rem`, Bangers
- **Error status code** — `clamp(5rem, 20vw, 9rem)`, Bangers, `glow-amber`

---

## Component Patterns

### `.card`

Dark card surface with a 1px border. Used for all contained content blocks.

```css
background-color: var(--color-bg-card);
border: 1px solid var(--color-bg-surface);
border-radius: 1rem;
```

### `.card-hover`

Adds interactive hover state with subtle amber glow. Added alongside `.card` on interactive cards.

```css
transition: box-shadow 150ms ease;
/* on hover: */
box-shadow:
  0 0 0 1px var(--color-beer-dark),
  0 4px 24px rgba(245, 158, 11, 0.15);
```

### `.glow-amber`

Text shadow creating a warm amber glow. Used on hero headings and the nav logo.

```css
text-shadow:
  0 0 10px var(--color-accent-glow),
  0 0 30px var(--color-beer-amber);
```

### `.glow-box-amber`

Box shadow glow for bordered elements (e.g., avatar circles).

```css
box-shadow:
  0 0 10px var(--color-accent-glow),
  0 0 30px rgba(251, 191, 36, 0.3);
```

### Amber buttons

Primary action buttons use amber background with deep bg text:

```css
background-color: var(--color-beer-amber);
color: var(--color-bg-deep);
font-family: var(--font-display);
border-radius: 9999px;
/* hover: */
box-shadow: 0 0 16px rgba(251, 191, 36, 0.5);
```

---

## Layout Principles

- **Max content width:** 1200px, centred with `margin: 0 auto`
- **Horizontal padding:** `1rem` on mobile, auto margin handles centering at breakpoints
- **Dashboard layout:** Single column mobile → two column (feed + leaderboard sidebar) at `1024px`
  - Feed column: fluid
  - Sidebar: fixed `320px`
- **Feed grid:** 2 cols (mobile) → 3 cols (640px+) → 4 cols (1024px+)
- **Stats grid:** 2 cols (mobile) → 3 cols (640px+)
- **Hero sections:** full-width with gradient fade, content centred

---

## Animation Principles

All keyframe animations are defined globally in `app.css`. All motion is wrapped in `@media (prefers-reduced-motion: no-preference)` guards at the component level.

### Counter digit flip

When a digit changes in `BeerCounter`, it receives a flip animation:

```css
@keyframes digit-flip {
  0% {
    transform: rotateX(0deg);
  }
  50% {
    transform: rotateX(90deg);
  }
  100% {
    transform: rotateX(0deg);
  }
}
```

- Duration: `400ms`
- Easing: `cubic-bezier(0.34, 1.56, 0.64, 1)` — slight overshoot gives a "clunk" feel
- Applied per digit that changes; removed after animation completes (setTimeout)

### Progress bar fill

```css
transition: width 1s ease-out;
```

Applied to the fill div inside `ProgressBar`. Animates on both initial render and count updates.

### Foam bubbles

```css
@keyframes float-up {
  0% {
    transform: translateY(0) scale(1);
    opacity: 0.6;
  }
  100% {
    transform: translateY(-100vh) scale(0.5);
    opacity: 0;
  }
}
```

- Duration: `5–9s` per bubble (staggered)
- Delay: `0–5.4s` (staggered by index)
- `iteration-count: infinite`
- 10 bubbles, varying size (`6–18px`) and horizontal position

### Live pulse dot

```css
@keyframes pulse-dot {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}
```

- Duration: `1.5s`, `ease-in-out`, `infinite`
- Applied to the amber dot inside `LiveBadge`

### Hover transitions

All interactive elements use `transition: box-shadow 150ms ease` or `transition: background-color 150ms ease`. Never longer than `200ms` for hover feedback — responsiveness matters.

---

## Iconography

Emoji-based icons only. No SVG icon library in V1. This keeps the bundle light and maintains the playful tone.

Used in:

- Nav logo: 🍺
- StatCard icons: 🍺 📅 🗓️ 🔥 🏆 ⏰
- Leaderboard beer count: 🍺
- Leaderboard rank badges: colour-only (no emoji for ranks)

---

## Responsiveness

All layouts use CSS Grid with responsive breakpoints defined in `<style>` blocks within each component. Breakpoints follow Tailwind v4 defaults:

| Breakpoint | Min width |
| ---------- | --------- |
| `sm`       | 640px     |
| `md`       | 768px     |
| `lg`       | 1024px    |

No component-level media queries use magic numbers outside these three values.

---

## Accessibility

- **`aria-live="polite"`** on `BeerCounter` wrapper — screen readers announce count updates without interrupting
- **`role="progressbar"` + `aria-valuenow/min/max`** on `ProgressBar` track
- **`aria-hidden="true"`** on `FoamBubbles` — decorative, must not be announced
- **`alt` text** on all `<img>` elements in `BeerCard`
- **`prefers-reduced-motion`** guard in all animated components — animation disabled entirely when user prefers reduced motion
- **Colour contrast** — `--color-beer-foam` on `--color-bg-card` meets WCAG AA (≥ 4.5:1)
- **Keyboard navigation** — all interactive elements are `<a>` or `<button>`; no `div` click handlers
- **Focus styles** — browser default focus rings preserved; not overridden without replacement
