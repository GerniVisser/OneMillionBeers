# OneMillionBeers — Claude Code Guide

## What this project is

A platform that sits behind WhatsApp groups. A bot joins those groups, logs every beer photo, and surfaces the data on a public web dashboard. See `/doc/VISION.md` for the full product vision.

---

## Repo structure

```
packages/
  backend/    — Fastify REST API, PostgreSQL, business logic (@omb/backend)
  collector/  — Baileys WhatsApp client, S3 uploads, forwards to backend (@omb/collector)
  shared/     — Zod schemas and inferred TypeScript types, no runtime deps (@omb/shared)
db/
  migrations/ — Plain numbered .sql files, applied in order
doc/
  VISION.md        — Product vision and guiding principles
  BACKEND_SPEC.md  — Technical specification (architecture, data models, API)
  TOOLING.md       — Tooling reference (configs, scripts, CI/CD)
infra/        — Terraform (AWS)
nginx/        — nginx.conf
.github/
  workflows/  — ci.yml, deploy.yml
```

---

## Key architectural principles

- **Schema first** — Zod schemas in `@omb/shared` are the source of truth. Routes are not built until schemas exist.
- **No ORM** — SQL written directly using `pg`. No Prisma, no Drizzle.
- **No DB mocks in tests** — Integration tests use a real PostgreSQL instance via Testcontainers.
- **Provider agnostic** — No provider-specific SDK in application code. Provider is config, not code.
- **MVP first** — Defer complexity unless it solves a real problem at launch scale.
- **Plain HTTP between services** — Collector talks to Backend API over REST. No message broker in V1.

---

## Common commands

```bash
pnpm install                                  # install all workspace dependencies
docker compose -f docker-compose.dev.yml up   # start full local dev stack
pnpm -r build                                 # build all packages
pnpm -r test                                  # run all tests
pnpm -r lint                                  # lint all packages
pnpm -r typecheck                             # type-check all packages
```

---

## Agent responsibilities

Use the right agent for the task:

| Agent | Use for |
|---|---|
| `business-analyst` | Feature analysis, acceptance criteria, requirements, product decisions, updating VISION.md |
| `solutions-architect` | Architecture decisions, technology choices, system design, API contracts, updating BACKEND_SPEC.md |
| `tooling` | Tooling config, Claude Code setup, CI/CD, Dockerfiles, scripts, updating TOOLING.md and CLAUDE.md |

---

## Where things live

| Thing | Location |
|---|---|
| Product vision | `/doc/VISION.md` |
| Technical spec | `/doc/BACKEND_SPEC.md` |
| Tooling reference | `/doc/TOOLING.md` |
| Shared Zod schemas | `packages/shared/src/` |
| DB migrations | `db/migrations/` |
| Env var documentation | `.env.example` |
| Agent definitions | `.claude/agents/` |
