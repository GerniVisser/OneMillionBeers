# OneMillionBeers — Frontend Architecture

## Responsibility

`@omb/frontend` is the display layer only. It contains no business logic. All data comes from the Backend API via the `/api` prefix, which nginx strips before proxying to the backend. The frontend is never aware of the backend's internal address.

---

## Architecture decisions

**SvelteKit + `@sveltejs/adapter-node`** — chosen for SSR by default, small bundle size (no virtual DOM runtime), and `adapter-node` which produces a standalone Node.js server that runs as a container behind nginx with no provider-specific deployment surface.

**SSR is non-negotiable for live data.** The global beer counter and feed are rendered server-side on first load. A static export would require client-side fetching for initial data, causing layout shift and losing SEO value on group pages.

---

## Data fetching pattern

All data fetching happens in SvelteKit `load` functions (`+page.ts` files). Always use the injected `fetch` — not `globalThis.fetch` directly — so requests work identically during SSR (server-to-server) and client-side navigation.

The API base is `/api` (see `packages/gateway/` for how nginx routes this). Load functions call `/api/v1/...` and propagate errors via `error()` from `@sveltejs/kit`, which renders `+error.svelte`.

---

## Real-time pattern

SSR provides the initial counter value on first load (no layout shift). After hydration, components subscribe to the SSE stream via `EventSource` for live updates.

`EventSource` reconnects automatically on network interruption — no client-side retry logic needed. The subscription utility returns a cleanup function that calls `source.close()`, used as the `onMount` return value to clean up on component unmount.

---

## Charts

Chart.js (via `svelte-chartjs`) runs **client-side only**. Gate chart rendering with `{#if browser}` from `$app/environment`. Server-side rendering has no DOM — Chart.js will throw without this guard.

Only register the Chart.js components actually used (tree-shaking).

---

## Types

Import schemas and inferred types from `@omb/shared` via the workspace protocol. If a type is needed and the schema does not yet exist in `@omb/shared`, define it locally in `src/lib/` as a temporary bridge — but the schema must be added to `@omb/shared` before the route is considered done.
