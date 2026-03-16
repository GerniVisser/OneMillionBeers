# OneMillionBeers

A platform that sits invisibly behind WhatsApp groups. A bot joins the group, silently logs every beer photo posted, and surfaces the data on a public web dashboard. The goal: collectively reach one million beers across all groups worldwide.

## How it works

1. Add the OneMillionBeers bot to a WhatsApp group
2. Everyone posts beer photos as normal — the bot logs each one silently
3. Visit the dashboard to see group stats, leaderboards, and the global counter ticking toward 1,000,000

## Services

| Package | Description |
|---|---|
| `packages/backend` | Fastify REST API — business logic, data persistence, leaderboards, SSE |
| `packages/collector` | WhatsApp client (Baileys) — watches for beer photos, uploads to S3, forwards to backend |
| `packages/shared` | Zod schemas and inferred TypeScript types shared across both services |

## Tech stack

Node.js · TypeScript · Fastify · PostgreSQL · Zod · Pino · Vitest · Baileys · pnpm workspaces

## Local development

Requires Docker and pnpm.

```bash
pnpm install
docker compose -f docker-compose.dev.yml up
```

This starts nginx, the backend API, the collector, PostgreSQL, and MinIO (S3-compatible storage). No cloud services or tunnelling required — Baileys connects outbound to WhatsApp directly.

On first run, scan the QR code printed by the collector to authenticate the WhatsApp session.

## Common commands

```bash
pnpm -r build       # build all packages
pnpm -r test        # run all tests
pnpm -r lint        # lint all packages
pnpm -r typecheck   # type-check all packages
```

## Architecture

```
WhatsApp ──(outbound WebSocket)──> [ Collector ] ──> S3-compatible storage
                                         │
                                    HTTP POST
                                         │
                                         ▼
                                   [ Backend API ]
                                         │
                                         ▼
                                     PostgreSQL
```

See [`doc/VISION.md`](doc/VISION.md) for the full product vision and [`doc/BACKEND_SPEC.md`](doc/BACKEND_SPEC.md) for the technical specification.

## License

MIT
