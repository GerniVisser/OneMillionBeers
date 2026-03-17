# OneMillionBeers — Frontend Technical Specification

> Status: Draft v0.1
> Last updated: 2026-03-16

---

## 1. Overview

`@omb/frontend` is the public-facing web dashboard for OneMillionBeers. It is a SvelteKit SSR application served by a Node.js process, proxied through nginx alongside the backend API.

---

## 2. Architecture Decision

### SvelteKit + `@sveltejs/adapter-node`

SvelteKit was chosen over a static site generator or React-based framework for the following reasons:

- **SSR by default** — the global beer count and feed are rendered server-side on first load. View source contains the data — no layout shift, no loading spinners on initial paint.
- **Fast on mobile** — small bundle size; Svelte compiles components to vanilla JS with no virtual DOM runtime.
- **`adapter-node`** — produces a standalone Node.js HTTP server (`node build`). This runs as a container behind nginx, identically to the backend. No Vercel, no Netlify, no provider-specific deployment surface.
- **SvelteKit `load` functions** — data fetching is co-located with routes, works identically for SSR and client-side navigation, and uses the injected `fetch` (which can be instrumented or swapped in tests).

### Why not a static adapter?

The global counter is live data — it changes every time a beer is logged. SSR ensures the page is rendered with an accurate count on first load. A static export would require client-side fetching for all data, losing the SSR benefit.

---

## 3. Tech Stack

| Concern      | Choice                                          |
| ------------ | ----------------------------------------------- |
| Framework    | SvelteKit                                       |
| Adapter      | `@sveltejs/adapter-node`                        |
| Styling      | Tailwind CSS v4 (Vite plugin, CSS-first config) |
| Charts       | Chart.js via `svelte-chartjs`                   |
| Real-time    | Server-Sent Events (native `EventSource`)       |
| Shared types | `@omb/shared` (workspace protocol)              |
| Build tool   | Vite                                            |

---

## 4. Page Inventory

| Route            | File                                    | Description                                                    |
| ---------------- | --------------------------------------- | -------------------------------------------------------------- |
| `/`              | `src/routes/+page.svelte`               | Global dashboard — live counter, beer feed, global leaderboard |
| `/groups/[slug]` | `src/routes/groups/[slug]/+page.svelte` | Group page — stats, photo feed, group leaderboard              |
| `/users/[slug]`  | `src/routes/users/[slug]/+page.svelte`  | User profile — stats, streaks, activity chart                  |
| `/about`         | `src/routes/about/+page.svelte`         | What OneMillionBeers is, how to join                           |
| `/health`        | `src/routes/health/+server.ts`          | Returns 200 — used by deploy health checks                     |

---

## 5. Route Structure

```
src/routes/
  +layout.svelte          — nav, footer, app.css import
  +error.svelte           — error page (uses page.status / page.error)
  +page.svelte            — Global dashboard
  +page.ts                — load() — fetches count, feed, leaderboard
  groups/[slug]/
    +page.svelte
    +page.ts              — load() — fetches group, feed, leaderboard
  users/[slug]/
    +page.svelte
    +page.ts              — load() — fetches user, stats
  about/
    +page.svelte
  health/
    +server.ts            — GET handler returns 200

src/lib/
  api.ts                  — typed fetch helpers
  sse.ts                  — SSE subscription utility
  components/
    BeerCard.svelte       — single beer photo card
    BeerFeed.svelte       — grid of BeerCards
    Leaderboard.svelte    — ranked list
    LiveCounter.svelte    — SSR count + SSE updates
    ContributionChart.svelte — Chart.js bar chart
```

---

## 6. API Consumption Pattern

All data fetching happens in SvelteKit `load` functions (`+page.ts` files). The injected `fetch` is used — this ensures requests work identically in SSR (server-to-server) and during client-side navigation.

`API_BASE` is `/api` — nginx strips this prefix and proxies to `backend:3000`.

```ts
// src/lib/api.ts
const API_BASE = '/api'

async function fetchJson<T>(fetch: typeof globalThis.fetch, path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json() as Promise<T>
}
```

Errors propagate via `error()` from `@sveltejs/kit`, rendering `+error.svelte`.

---

## 7. SSE Live Counter Pattern

`LiveCounter.svelte` receives `initialCount` from SSR (prevents layout shift on first load). After hydration, it connects to the SSE stream and updates reactively.

```svelte
onMount(() => {
  return subscribeSSE('/api/v1/global/stream', {
    count: (data) => { count = data.count; },
  });
});
```

`EventSource` reconnects automatically on network interruption — no client-side retry logic needed. `subscribeSSE` (in `src/lib/sse.ts`) returns a cleanup function that calls `source.close()`, used as the `onMount` return value to clean up on component unmount.

The nginx SSE block (`location = /api/v1/global/stream`) sets `proxy_buffering off` and `proxy_read_timeout 3600s` to keep the long-lived connection alive.

---

## 8. Chart.js Integration

Only required Chart.js components are registered (tree-shaking):

```ts
import { Chart, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js'
Chart.register(CategoryScale, LinearScale, BarElement, Tooltip)
```

`svelte-chartjs` handles the Svelte component wrapper. Chart.js runs client-side only — the component gates rendering with `{#if browser}` from `$app/environment` to avoid SSR issues.

---

## 9. Tailwind CSS v4

Tailwind v4 uses a CSS-first configuration — no `tailwind.config.js` file. The Vite plugin (`@tailwindcss/vite`) is added to `vite.config.ts`.

Custom theme tokens are defined in `src/app.css`:

```css
@import 'tailwindcss';

@theme {
  --color-beer-amber: #f59e0b;
  --color-beer-dark: #92400e;
}
```

These are available as Tailwind utilities (`text-beer-amber`, `bg-beer-dark`, etc.) throughout all components.

---

## 10. Shared Types from `@omb/shared`

`@omb/frontend` imports schemas and inferred types from `@omb/shared` via the workspace protocol:

```ts
import type { BeerLogRequest } from '@omb/shared'
```

The schema-first rule applies: if a type is needed in the frontend, the Zod schema must exist in `@omb/shared` first. API response types that are not yet in `@omb/shared` are defined locally in `src/lib/api.ts` until schemas are added.

---

## 11. nginx Routing

```
/api/v1/global/stream  →  backend:3000/v1/global/stream  (SSE block)
/api/                  →  backend:3000/                  (general API)
/                      →  frontend:3001                  (SvelteKit)
```

The `/api` prefix is stripped before forwarding to the backend. This means the backend remains unaware of its nginx prefix — its routes are still `/v1/...`.

---

## 12. Environment Variables

| Variable | Required in | Purpose                                                                                                |
| -------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| `ORIGIN` | Production  | Required by `adapter-node` — sets the canonical origin for CSRF protection. Must match the public URL. |
| `PORT`   | Both        | Port the SvelteKit node server listens on (default `3001`)                                             |

In development (Docker Compose), `ORIGIN` is not set — `adapter-node` allows this in non-production mode.

---

## 13. Testing — V1 Deferral

Frontend tests are explicitly deferred from V1.

**Deferred:**

- **Vitest unit tests** — component logic is thin; defer until there is meaningful logic to test
- **Playwright E2E tests** — valuable but require a running stack; add alongside test data seeding

**Why deferred:** The frontend is a thin data-display layer. V1 correctness is validated by the backend integration tests and manual verification against the dev stack. This decision should be revisited when business logic moves into the frontend or when the component count grows significantly.

---

## 14. V1 Deferrals

| Feature                 | Notes                                                  |
| ----------------------- | ------------------------------------------------------ |
| Auth / protected routes | All pages are public at launch                         |
| Dark mode               | Tailwind supports `dark:` variants; wire up later      |
| Contribution heatmap    | Chart.js lacks native heatmap; add ECharts when needed |
| Caching / CDN           | Add when traffic warrants it                           |
| Frontend tests          | See section 13                                         |
