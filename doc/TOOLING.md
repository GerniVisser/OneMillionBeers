# OneMillionBeers — Tooling Reference

> Last updated: 2026-03-16

Authoritative reference for the developer toolchain. Owned by the tooling engineer agent — keep it current whenever a config changes.

---

## Contents

1. [Runtime and package manager](#1-runtime-and-package-manager)
2. [Workspace structure](#2-workspace-structure)
3. [Common scripts](#3-common-scripts)
4. [Local development](#4-local-development)
5. [Environment variables](#5-environment-variables)
6. [TypeScript](#6-typescript)
7. [Linting and formatting](#7-linting-and-formatting)
8. [Git hooks](#8-git-hooks)
9. [Testing](#9-testing)
10. [Docker](#10-docker)
11. [CI/CD](#11-cicd)
12. [Config file locations](#12-config-file-locations)

---

## 1. Runtime and package manager

Node.js version is pinned in `.nvmrc`. Dockerfiles and CI both read from that file — never hardcode a Node version elsewhere. Switch to the correct version locally with `nvm use`.

pnpm is the package manager, pinned via the `packageManager` field in the root `package.json`. Never use `npm install` or `yarn` — the lockfile is pnpm-only.

---

## 2. Workspace structure

The repo is a pnpm monorepo. Workspace packages are declared in `pnpm-workspace.yaml` as `packages/*`.

| Package              | Name             | Description                                                         |
| -------------------- | ---------------- | ------------------------------------------------------------------- |
| `packages/backend`   | `@omb/backend`   | Fastify REST API, PostgreSQL, all business logic                    |
| `packages/collector` | `@omb/collector` | Baileys WhatsApp client, S3 uploads, forwards to backend            |
| `packages/frontend`  | `@omb/frontend`  | SvelteKit SSR web dashboard — public-facing interface               |
| `packages/gateway`   | —                | nginx reverse proxy — Dockerfiles + nginx configs; not a JS package |
| `packages/shared`    | `@omb/shared`    | Zod schemas and inferred TypeScript types — no runtime deps         |

`@omb/shared` is consumed by the other packages via the workspace protocol. It is not published to a registry.

---

## 3. Common scripts

Root convenience scripts and recursive (`pnpm -r`) commands.

| Command                   | What it does                                                                |
| ------------------------- | --------------------------------------------------------------------------- |
| `pnpm install`            | Installs all workspace dependencies using the lockfile                      |
| `pnpm dev`                | Builds shared once, then starts shared watcher + backend + frontend locally |
| `pnpm build:shared`       | Compiles `@omb/shared` to `dist/` once                                      |
| `pnpm infra:up`           | Starts postgres + minio in Docker (local dev infrastructure)                |
| `pnpm infra:up:collector` | Same as above, also starts the WhatsApp collector container                 |
| `pnpm infra:down`         | Stops and removes local dev infrastructure containers                       |
| `pnpm -r build`           | Compiles TypeScript to JS for all packages                                  |
| `pnpm -r test`            | Runs the Vitest test suite for all packages                                 |
| `pnpm -r lint`            | Runs ESLint across all packages                                             |
| `pnpm -r format`          | Runs Prettier across all source files                                       |
| `pnpm -r format:check`    | Checks formatting without writing (used in CI)                              |
| `pnpm -r typecheck`       | Runs `tsc --noEmit` across all packages                                     |

To target a single package: `pnpm --filter @omb/backend build`.

---

## 4. Local development

Two modes are available. The hybrid mode is recommended for day-to-day development.

### Mode 1 — Hybrid local dev (recommended)

Infrastructure (postgres, minio) runs in Docker; backend, frontend, and shared watcher run directly on the host for native hot reload.

```bash
cp .env.local.example .env.local   # first time only
pnpm infra:up                       # start postgres + minio
pnpm dev                            # start all services with labeled output
```

`pnpm dev` runs three processes in parallel with colored, labeled output:

| Label      | Color   | What it runs                                         |
| ---------- | ------- | ---------------------------------------------------- |
| `shared`   | cyan    | `tsc --watch` — recompiles `@omb/shared` on change   |
| `backend`  | yellow  | `tsx watch` — Fastify API, restarts on source change |
| `frontend` | magenta | Vite dev server with HMR at `http://localhost:3001`  |

The frontend Vite dev server proxies `/api/*` requests to `localhost:3000`, mirroring what nginx does in production. No nginx needed in this mode.

**Hot reload chain:** edit `packages/shared/src/` → `tsc --watch` recompiles to `dist/` → `tsx watch` detects the update → backend restarts automatically.

**Ports in this mode:**

| Service  | Port | Notes                    |
| -------- | ---- | ------------------------ |
| Frontend | 3001 | Vite dev server          |
| Backend  | 3000 | tsx watch (Fastify)      |
| Postgres | 5432 | Docker, mapped to host   |
| MinIO    | 9000 | S3 API, mapped to host   |
| MinIO    | 9001 | Web console (minioadmin) |

**Including the WhatsApp collector (opt-in):**

```bash
pnpm infra:up:collector
```

The collector runs in Docker with `BACKEND_URL=http://host.docker.internal:3000`, pointing at the locally-running backend. The Baileys session is persisted to the `baileys-session` Docker volume. If the volume is new, a QR code appears in the container logs:

```bash
docker compose -f docker-compose.local.yml logs -f collector
```

### Mode 2 — Full Docker stack

All services run in Docker — an exact-parity replica of the production topology. Useful for testing nginx/gateway config or verifying the full stack before merging.

```bash
docker compose -f docker-compose.dev.yml up
```

App available at `http://localhost` (port 80 via the gateway).

| Service     | Purpose                                                          |
| ----------- | ---------------------------------------------------------------- |
| `nginx`     | Gateway — proxies `/api/*` to backend, `/` to frontend (port 80) |
| `backend`   | Fastify API with hot reload (internal port 3000)                 |
| `collector` | WhatsApp bot with hot reload                                     |
| `frontend`  | SvelteKit dev server with hot reload (internal port 3001)        |
| `postgres`  | PostgreSQL (internal port 5432)                                  |
| `minio`     | S3-compatible storage; web console at `http://localhost:9001`    |

Hot reload in this mode is provided by the `dev` Docker build stage, which runs `tsx watch` / `vite dev` inside the container.

The Baileys WhatsApp session is persisted to the `baileys-session` Docker volume and survives container restarts. Database data is persisted to `postgres-data`.

Migrations are plain numbered `.sql` files in `db/migrations/`, applied in order against the local Postgres instance.

---

## 5. Environment variables

Two `.env` files document the required variables:

- **`.env.example`** — values for the full Docker stack (`docker-compose.dev.yml`) and as a reference for production. Committed.
- **`.env.local.example`** — values for hybrid local dev (services on the host, infra in Docker). Copy to `.env.local` which is gitignored. Committed.

`docker-compose.dev.yml` injects dev values inline. In hybrid local dev, `dotenv-cli` loads `.env.local` when running `pnpm dev`. In production, variables are injected by the host — dotenv is never used in production containers.

Both services validate all required variables on startup via Zod and exit immediately if any are missing or wrongly typed.

### Backend

| Variable       | Docker dev default                               | Local dev default                                 | Purpose                                           |
| -------------- | ------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------- |
| `DATABASE_URL` | `postgres://postgres:postgres@postgres:5432/omb` | `postgres://postgres:postgres@localhost:5432/omb` | PostgreSQL connection string                      |
| `LOG_LEVEL`    | `info`                                           | `debug`                                           | Pino log level (`debug`, `info`, `warn`, `error`) |

### Collector

| Variable           | Dev default           | Purpose                        |
| ------------------ | --------------------- | ------------------------------ |
| `BACKEND_URL`      | `http://backend:3000` | Backend API URL                |
| `STORAGE_ENDPOINT` | `http://minio:9000`   | S3-compatible storage endpoint |
| `STORAGE_BUCKET`   | `omb-photos`          | Bucket for beer photos         |
| `STORAGE_KEY`      | `minioadmin`          | Storage access key             |
| `STORAGE_SECRET`   | `minioadmin`          | Storage secret key             |
| `LOG_LEVEL`        | `info`                | Pino log level                 |

### Frontend

| Variable | Production default            | Purpose                                                                              | When needed                                                              |
| -------- | ----------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `ORIGIN` | `https://onemillionbeers.app` | Required by `@sveltejs/adapter-node` — sets the canonical origin for CSRF protection | Production and `pnpm preview` only — not needed for `pnpm dev`           |
| `PORT`   | `3001`                        | Port the SvelteKit node server listens on                                            | Production and `pnpm preview` only — Vite uses `--port 3001` flag in dev |

---

## 6. TypeScript

Configured per-package (`packages/*/tsconfig.json`), each extending a shared root `tsconfig.json`. Key settings:

- `strict: true` — full strict mode, non-negotiable
- `noEmit: true` for typecheck-only runs; `outDir: dist` for builds
- `@omb/shared` is referenced from other packages via workspace path

---

## 7. Linting and formatting

**ESLint** is configured at the monorepo root in `eslint.config.js` (flat config format). Per-package overrides are added to the root config rather than duplicating it in each package.

**Prettier** is configured at the monorepo root in `.prettierrc`. A single config applies to all packages.

Both run in CI and in the pre-commit hook.

---

## 8. Git hooks

Managed with `simple-git-hooks` + `lint-staged`, configured in the root `package.json`.

The pre-commit hook runs `lint-staged`, which applies ESLint and Prettier to all staged files. Commits are blocked if any check fails.

Register hooks once after installing dependencies:

```bash
pnpm exec simple-git-hooks
```

---

## 9. Testing

Tests run with **Vitest**. Each package has its own `vitest.config.ts`.

```bash
pnpm -r test             # run all tests once
pnpm -r test -- --watch  # watch mode
```

**Unit tests** cover pure logic (stat calculators, message parsers) with no infrastructure.

**Integration tests** for `@omb/backend` use **Testcontainers** to spin up a real PostgreSQL container — the database is never mocked. Docker must be running locally and is available by default on GitHub Actions.

| Dependency         | Test approach                         |
| ------------------ | ------------------------------------- |
| PostgreSQL         | Real container via Testcontainers     |
| S3 / MinIO         | Mock storage client                   |
| Baileys (WhatsApp) | Stub that simulates incoming messages |

A route is complete when: a Zod schema in `@omb/shared` defines its shape, unit tests cover the business logic, and an integration test validates the full request/response cycle against a real database.

---

## 10. Docker

### Dockerfiles

| File                            | Service                                                                |
| ------------------------------- | ---------------------------------------------------------------------- |
| `packages/backend/Dockerfile`   | Backend API                                                            |
| `packages/collector/Dockerfile` | Collector                                                              |
| `packages/frontend/Dockerfile`  | SvelteKit frontend                                                     |
| `packages/gateway/Dockerfile`   | nginx gateway — `dev` stage (HTTP only) and `prod` stage (HTTPS + SSL) |

`@omb/shared` is not containerised — it is compiled and consumed at build time. All Dockerfiles that consume `@omb/shared` use the repo root as build context.

All Dockerfiles use multi-stage builds: a **dev stage** runs `tsx watch` / `vite dev` for hot reload; a **builder stage** compiles TypeScript; the **production stage** copies only compiled JS and production dependencies and runs as a non-root user. `package.json` and `pnpm-lock.yaml` are copied before source to maximise layer caching.

The gateway (`packages/gateway/`) has no `package.json` — it is not a JS package and is excluded from `pnpm -r` commands. The `dev` stage copies `nginx.dev.conf` (HTTP only, no SSL); the `prod` stage copies `nginx.conf` (HTTPS, Let's Encrypt).

### docker-compose files

| File                       | Use case                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `docker-compose.yml`       | Production — pulls images from GHCR tagged by git SHA                                      |
| `docker-compose.dev.yml`   | Full local stack in Docker — see [Local development](#4-local-development)                 |
| `docker-compose.local.yml` | Local dev infrastructure only — postgres + minio on host ports; optional collector profile |

---

## 11. CI/CD

### ci.yml

Triggers on every push and pull request.

1. `pnpm -r typecheck`
2. `pnpm -r lint`
3. `pnpm -r format:check`
4. `pnpm -r test` (includes Testcontainers integration tests)

Pipeline fails fast. PRs cannot be merged until CI passes.

### deploy.yml

Triggers on push to `main` after `ci.yml` passes.

1. Build Docker images for `backend`, `collector`, `frontend`, and `gateway`
2. Push all four to GitHub Container Registry tagged with the git SHA
3. SSH into the EC2 instance
4. Pull new images and restart: `docker compose up -d --no-deps backend collector frontend nginx`
5. Hit health check endpoints to confirm successful start (`/api/health` and `/health`)

Images are always tagged with the git SHA — `latest` is not used as a deployment tag.

### Container registry

Images are stored in **GitHub Container Registry** (`ghcr.io`). No ECR or Docker Hub.

---

## 12. Config file locations

| Concern                     | Config file                                                |
| --------------------------- | ---------------------------------------------------------- |
| Node version                | `.nvmrc`                                                   |
| Package manager             | `package.json` (`packageManager` field)                    |
| Workspace packages          | `pnpm-workspace.yaml`                                      |
| TypeScript (root)           | `tsconfig.json`                                            |
| TypeScript (per package)    | `packages/*/tsconfig.json`                                 |
| ESLint                      | `eslint.config.js`                                         |
| Prettier                    | `.prettierrc`                                              |
| Git hooks                   | `package.json` (`simple-git-hooks` + `lint-staged` fields) |
| Vitest (per package)        | `packages/*/vitest.config.ts`                              |
| Backend Dockerfile          | `packages/backend/Dockerfile`                              |
| Collector Dockerfile        | `packages/collector/Dockerfile`                            |
| Frontend Dockerfile         | `packages/frontend/Dockerfile`                             |
| Gateway Dockerfile          | `packages/gateway/Dockerfile`                              |
| Gateway nginx config (dev)  | `packages/gateway/nginx.dev.conf`                          |
| Gateway nginx config (prod) | `packages/gateway/nginx.conf`                              |
| SvelteKit config            | `packages/frontend/svelte.config.js`                       |
| Frontend Vite config        | `packages/frontend/vite.config.ts`                         |
| Docker Compose (prod)       | `docker-compose.yml`                                       |
| Docker Compose (dev, full)  | `docker-compose.dev.yml`                                   |
| Docker Compose (dev, infra) | `docker-compose.local.yml`                                 |
| CI workflow                 | `.github/workflows/ci.yml`                                 |
| Deploy workflow             | `.github/workflows/deploy.yml`                             |
| Env vars (docker/prod)      | `.env.example`                                             |
| Env vars (local dev)        | `.env.local.example`                                       |
| Terraform                   | `infra/`                                                   |
