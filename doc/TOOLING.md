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

| Package | Name | Description |
|---|---|---|
| `packages/backend` | `@omb/backend` | Fastify REST API, PostgreSQL, all business logic |
| `packages/collector` | `@omb/collector` | Baileys WhatsApp client, S3 uploads, forwards to backend |
| `packages/shared` | `@omb/shared` | Zod schemas and inferred TypeScript types — no runtime deps |

`@omb/shared` is consumed by the other two packages via the workspace protocol. It is not published to a registry.

---

## 3. Common scripts

All scripts run with `pnpm -r` (recursive) from the repo root.

| Command | What it does |
|---|---|
| `pnpm install` | Installs all workspace dependencies using the lockfile |
| `pnpm -r build` | Compiles TypeScript to JS for all packages |
| `pnpm -r test` | Runs the Vitest test suite for all packages |
| `pnpm -r lint` | Runs ESLint across all packages |
| `pnpm -r format` | Runs Prettier across all source files |
| `pnpm -r format:check` | Checks formatting without writing (used in CI) |
| `pnpm -r typecheck` | Runs `tsc --noEmit` across all packages |

To target a single package: `pnpm --filter @omb/backend build`.

---

## 4. Local development

The full stack runs locally via Docker Compose — no cloud services or tunnelling required.

```bash
docker compose -f docker-compose.dev.yml up
```

| Service | Purpose |
|---|---|
| `nginx` | Reverse proxy to backend (port 80) |
| `backend` | Fastify API with hot reload (internal port 3000) |
| `collector` | WhatsApp bot with hot reload |
| `postgres` | PostgreSQL (internal port 5432) |
| `minio` | S3-compatible storage; web console at `http://localhost:9001` |

Hot reload is enabled for `backend` and `collector` by volume-mounting `src/` into the container and using `pnpm dev` inside it.

The Baileys WhatsApp session is persisted to a named Docker volume (`baileys-session`) and survives container restarts. Database data is persisted to `postgres-data`.

Migrations are plain numbered `.sql` files in `db/migrations/`, applied in order against the local Postgres instance.

---

## 5. Environment variables

All variables are documented in `.env.example` at the repo root. This file is committed and must stay in sync with actual usage.

```bash
cp .env.example .env   # for running services outside Docker
```

`docker-compose.dev.yml` injects dev values inline. In production, variables are injected by the host — dotenv is never used in production containers.

Both services validate all required variables on startup via Zod and exit immediately if any are missing or wrongly typed.

### Backend

| Variable | Dev default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://postgres:postgres@postgres:5432/omb` | PostgreSQL connection string |
| `JWT_SECRET` | `changeme` | Signs JWT tokens — must be changed in production |
| `LOG_LEVEL` | `info` | Pino log level (`debug`, `info`, `warn`, `error`) |

### Collector

| Variable | Dev default | Purpose |
|---|---|---|
| `BACKEND_URL` | `http://backend:3000` | Backend API URL |
| `STORAGE_ENDPOINT` | `http://minio:9000` | S3-compatible storage endpoint |
| `STORAGE_BUCKET` | `omb-photos` | Bucket for beer photos |
| `STORAGE_KEY` | `minioadmin` | Storage access key |
| `STORAGE_SECRET` | `minioadmin` | Storage secret key |
| `LOG_LEVEL` | `info` | Pino log level |

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

| Dependency | Test approach |
|---|---|
| PostgreSQL | Real container via Testcontainers |
| S3 / MinIO | Mock storage client |
| Baileys (WhatsApp) | Stub that simulates incoming messages |

A route is complete when: a Zod schema in `@omb/shared` defines its shape, unit tests cover the business logic, and an integration test validates the full request/response cycle against a real database.

---

## 10. Docker

### Dockerfiles

| File | Service |
|---|---|
| `packages/backend/Dockerfile` | Backend API |
| `packages/collector/Dockerfile` | Collector |

`@omb/shared` is not containerised — it is compiled and consumed at build time.

All Dockerfiles use multi-stage builds: a **builder stage** installs all dependencies and compiles TypeScript; the **production stage** copies only compiled JS and production dependencies. Production containers run as a non-root user. `package.json` and `pnpm-lock.yaml` are copied before source to maximise layer caching.

### docker-compose.yml (production)

Used on the EC2 host. Services: `nginx` (reverse proxy, SSL on 80/443), `certbot` (Let's Encrypt), `backend`, `collector`, `postgres`. Images are pulled from GitHub Container Registry tagged by git SHA.

### docker-compose.dev.yml (local)

See [Local development](#4-local-development). Key differences from production: Postgres and MinIO run locally instead of RDS and S3; hot reload is enabled; no SSL.

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

1. Build Docker images for `@omb/backend` and `@omb/collector`
2. Push both to GitHub Container Registry tagged with the git SHA
3. SSH into the EC2 instance
4. Pull new images and restart: `docker compose up -d --no-deps backend collector`
5. Hit health check endpoints to confirm successful start

Images are always tagged with the git SHA — `latest` is not used as a deployment tag.

### Container registry

Images are stored in **GitHub Container Registry** (`ghcr.io`). No ECR or Docker Hub.

---

## 12. Config file locations

| Concern | Config file |
|---|---|
| Node version | `.nvmrc` |
| Package manager | `package.json` (`packageManager` field) |
| Workspace packages | `pnpm-workspace.yaml` |
| TypeScript (root) | `tsconfig.json` |
| TypeScript (per package) | `packages/*/tsconfig.json` |
| ESLint | `eslint.config.js` |
| Prettier | `.prettierrc` |
| Git hooks | `package.json` (`simple-git-hooks` + `lint-staged` fields) |
| Vitest (per package) | `packages/*/vitest.config.ts` |
| Backend Dockerfile | `packages/backend/Dockerfile` |
| Collector Dockerfile | `packages/collector/Dockerfile` |
| Docker Compose (prod) | `docker-compose.yml` |
| Docker Compose (dev) | `docker-compose.dev.yml` |
| CI workflow | `.github/workflows/ci.yml` |
| Deploy workflow | `.github/workflows/deploy.yml` |
| Environment variables | `.env.example` |
| Terraform | `infra/` |
| Nginx config | `nginx/nginx.conf` |
