# OneMillionBeers — Development Reference

## Sources of truth

Never duplicate values into docs — read the file that owns them:

| What            | Where                                             |
| --------------- | ------------------------------------------------- |
| Env vars        | `.env.example` / `.env.local.example`             |
| Port numbers    | `docker-compose.local.yml` / `docker-compose.yml` |
| Node version    | `.nvmrc`                                          |
| Package scripts | root `package.json`                               |
| CI steps        | `.github/workflows/ci.yml`                        |
| Deploy steps    | `.github/workflows/deploy.yml`                    |
| DB schema       | `db/migrations/`                                  |
| Shared types    | `packages/shared/src/`                            |
| nginx config    | `packages/gateway/`                               |

---

## Workspace packages

| Package              | Name             | What it is                                                    | What it is not                                                                 |
| -------------------- | ---------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `packages/backend`   | `@omb/backend`   | Fastify REST API, all business logic, PostgreSQL              | No image handling, no WhatsApp connection                                      |
| `packages/collector` | `@omb/collector` | Baileys WhatsApp client, S3 photo upload, metadata forwarding | No business logic, no database access                                          |
| `packages/frontend`  | `@omb/frontend`  | SvelteKit SSR dashboard                                       | No business logic — thin display layer only                                    |
| `packages/gateway`   | —                | nginx Dockerfiles and nginx configs                           | Not a JS package — excluded from `pnpm -r` commands                            |
| `packages/shared`    | `@omb/shared`    | Zod schemas and inferred TypeScript types                     | No runtime deps — consumed via workspace protocol, not published to a registry |

---

## Local development modes

**Hybrid (recommended):** Infrastructure (postgres, minio) runs in Docker; backend, frontend, and shared watcher run on the host for native hot reload. Copy `.env.local.example` to `.env.local` on first run. See root `package.json` scripts for the exact commands (`pnpm infra:up`, `pnpm dev`).

**Full Docker:** All services run in Docker — an exact-parity replica of the production topology. Useful for testing nginx config or verifying the full stack before merging. See `docker-compose.dev.yml`.

---

## Non-obvious behaviors

**Hot reload chain:** Edit `packages/shared/src/` → `tsc --watch` recompiles to `dist/` → `tsx watch` detects the output change → backend restarts automatically. This means shared changes propagate without manual restarts.

**Zod env validation on startup:** Both services validate all required env vars via Zod before doing anything else. The process exits immediately if any are missing or wrongly typed — fail fast, not at runtime.

**Git hooks registration:** `simple-git-hooks` must be registered once after `pnpm install` with `pnpm exec simple-git-hooks`. The hooks are not installed automatically by pnpm install.

**`@omb/shared` consumption:** Other packages consume `@omb/shared` via the workspace protocol (`workspace:*`). It is not published to any registry. All Dockerfiles that consume it use the repo root as the build context.

---

## Testing

Vitest is the test runner for all packages. Each package has its own `vitest.config.ts`.

**Testcontainers requires Docker running** — integration tests spin up a real PostgreSQL container. This works by default on GitHub Actions. Run `pnpm -r test` locally with Docker running.

**The database is never mocked.** Integration tests for `@omb/backend` always hit a real PostgreSQL instance via Testcontainers. This is non-negotiable — the last time the DB was mocked, mock tests passed while a prod migration failed.

**A route is done when:**

1. A Zod schema in `@omb/shared` defines its request and response shape
2. Unit tests cover the business logic
3. An integration test validates the full request/response cycle against a real database (happy path + error cases)

---

## Docker conventions

- Multi-stage builds: a `builder` stage compiles TypeScript; the production stage copies only compiled JS and production dependencies
- Production stage runs as a non-root user
- Images are never tagged `latest` — always tagged with the git SHA
- `package.json` and `pnpm-lock.yaml` are copied before source to maximise layer caching
- `@omb/shared` is not containerised — compiled and consumed at build time

---

## Branching strategy

The project uses trunk-based development. This suits a small team: it keeps the feedback loop short, eliminates long-lived merge conflicts, and ensures `main` is always in a releasable state.

**The rule:** `main` is production. A commit on `main` is a commitment to ship it.

### Branch naming

| Prefix   | Use for                                   |
| -------- | ----------------------------------------- |
| `feat/`  | New functionality                         |
| `fix/`   | Bug fixes                                 |
| `chore/` | Tooling, config, dependency updates, docs |

Examples: `feat/beer-count-endpoint`, `fix/s3-upload-retry`, `chore/update-vitest`.

### Deployment trigger

Every merge to `main` triggers a production deploy automatically:

There is no manual deploy step. Keeping `main` green is the team's highest-priority shared obligation.

---

## CI/CD contract

- CI (`ci.yml`) runs on every push and pull request: typecheck → lint → format check → full test suite (including Testcontainers integration tests)
- Deploy (`deploy.yml`) only runs after CI passes on push to `main`
- Images are built for `backend`, `collector`, `frontend`, and `gateway`; pushed to GitHub Container Registry tagged with the git SHA
- Deploy SSHs into EC2, pulls new images, restarts containers, and confirms successful start via health check endpoints before the workflow succeeds
