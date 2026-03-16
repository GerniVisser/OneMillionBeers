# OneMillionBeers — Tooling Reference

> Last updated: 2026-03-16

This document is the authoritative reference for the developer toolchain. It covers everything that sits around the application code: runtime, package management, linting, formatting, testing, Docker, CI/CD, and Git hooks.

The tooling engineer agent owns this file. Keep it current whenever a config changes.

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

| Property | Value |
|---|---|
| Node.js version | 22 (pinned in `.nvmrc`) |
| Package manager | pnpm 10.32.1 (pinned via `packageManager` field in root `package.json`) |
| pnpm lockfile version | 9.0 |

The Node version in `.nvmrc` is the single source of truth. Dockerfiles and CI both use the same version — never hardcode a Node version anywhere else.

To switch to the correct Node version locally:

```bash
nvm use       # reads .nvmrc automatically
```

---

## 2. Workspace structure

The repo is a pnpm monorepo. Workspace packages are defined in `pnpm-workspace.yaml` as `packages/*`.

| Package | Name | Description |
|---|---|---|
| `packages/backend` | `@omb/backend` | Fastify REST API, PostgreSQL, all business logic |
| `packages/collector` | `@omb/collector` | Baileys WhatsApp client, S3 uploads, forwards to backend |
| `packages/shared` | `@omb/shared` | Zod schemas and inferred TypeScript types — no runtime deps |

`@omb/shared` is referenced internally by `@omb/backend` and `@omb/collector` via workspace protocol. It is not published to a registry.

Install all workspace dependencies from the repo root:

```bash
pnpm install
```

Never run `npm install` or `yarn` — the lockfile is pnpm-only.

---

## 3. Common scripts

All scripts are run with `pnpm -r` (recursive) from the repo root, which runs the named script in every workspace package that defines it.

| Command | What it does |
|---|---|
| `pnpm install` | Installs all workspace dependencies using the lockfile |
| `pnpm -r build` | Compiles TypeScript to JS for all packages |
| `pnpm -r test` | Runs the Vitest test suite for all packages |
| `pnpm -r lint` | Runs ESLint across all packages |
| `pnpm -r format` | Runs Prettier to format all source files |
| `pnpm -r typecheck` | Runs `tsc --noEmit` for all packages without emitting output |

To run a script in a single package:

```bash
pnpm --filter @omb/backend build
pnpm --filter @omb/collector test
```

---

## 4. Local development

The full stack runs locally via Docker Compose. No cloud services or tunnelling are required.

```bash
docker compose -f docker-compose.dev.yml up
```

### Services started by `docker-compose.dev.yml`

| Service | Image / Build | Exposed ports | Purpose |
|---|---|---|---|
| `nginx` | `nginx:alpine` | 80 | Reverse proxy to backend |
| `backend` | `./packages/backend` (built) | internal 3000 | Fastify API with hot reload |
| `collector` | `./packages/collector` (built) | none | WhatsApp bot with hot reload |
| `postgres` | `postgres:16-alpine` | internal 5432 | PostgreSQL database |
| `minio` | `minio/minio` | 9000, 9001 | S3-compatible object storage |

**MinIO web console** is available at `http://localhost:9001` (user: `minioadmin`, password: `minioadmin`).

**Hot reload** is enabled for both `backend` and `collector` by volume-mounting the `src/` directory into the running container. The `pnpm dev` command in each container watches for file changes.

**WhatsApp session** (Baileys credentials) is persisted to a named Docker volume `baileys-session`. The session survives container restarts without needing to re-scan the QR code. If the volume is deleted the QR code must be scanned again.

**Database data** is persisted to a named Docker volume `postgres-data`.

### Database migrations

Migrations are plain numbered `.sql` files in `db/migrations/`, applied in order. Run them manually against the local Postgres instance or as part of container startup. See `doc/BACKEND_SPEC.md` section 5 for the full list.

---

## 5. Environment variables

All environment variables are documented in `.env.example` at the repo root. This file is committed and must be kept in sync with actual usage.

For local development, copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

The `docker-compose.dev.yml` file injects the dev values directly as inline environment fields — the `.env` file is primarily for reference and for running services outside of Docker.

In production, environment variables are injected by the host. dotenv is used in local development only — never in production containers.

### Variables

#### Backend API

| Variable | Dev default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://postgres:postgres@postgres:5432/omb` | PostgreSQL connection string |
| `JWT_SECRET` | `changeme` | Secret for signing JWT tokens — must be changed in production |
| `LOG_LEVEL` | `info` | Pino log level (`debug`, `info`, `warn`, `error`) |

#### Collector

| Variable | Dev default | Purpose |
|---|---|---|
| `BACKEND_URL` | `http://backend:3000` | URL of the Backend API service |
| `STORAGE_ENDPOINT` | `http://minio:9000` | S3-compatible storage endpoint |
| `STORAGE_BUCKET` | `omb-photos` | Bucket name for beer photos |
| `STORAGE_KEY` | `minioadmin` | Storage access key |
| `STORAGE_SECRET` | `minioadmin` | Storage secret key |
| `LOG_LEVEL` | `info` | Pino log level |

Both services validate all required environment variables on startup using Zod. The process exits immediately if any required variable is missing or incorrectly typed.

---

## 6. TypeScript

TypeScript is configured per-package (`packages/*/tsconfig.json`) with a root `tsconfig.json` that sets shared compiler defaults. Per-package configs extend the root.

Key compiler options (to be applied when configs are written):

- `strict: true` — full strict mode is non-negotiable
- `noEmit: true` for typecheck-only runs; `outDir: dist` for builds
- `moduleResolution: bundler` or `node16` — to be confirmed when configs are authored
- `@omb/shared` is referenced from other packages via workspace path, not `node_modules` paths

Run type checking without emitting output:

```bash
pnpm -r typecheck
```

---

## 7. Linting and formatting

### ESLint

ESLint is configured at the monorepo root in `eslint.config.js` (flat config format). Per-package overrides are added to the root config rather than duplicating config in each package.

Config file is not yet written (as of 2026-03-16).

Run linting across all packages:

```bash
pnpm -r lint
```

### Prettier

Prettier is configured at the monorepo root in `.prettierrc`. A single config applies to all packages.

Config file is not yet written (as of 2026-03-16).

Run formatting:

```bash
pnpm -r format          # write changes
pnpm -r format:check    # check only, no writes (used in CI)
```

Both ESLint and Prettier run in CI — the pipeline fails on any violation. They also run via pre-commit hook (see [Git hooks](#8-git-hooks)).

---

## 8. Git hooks

Git hooks are managed with `simple-git-hooks` + `lint-staged`. Configuration lives in the root `package.json`.

Not yet configured (as of 2026-03-16). The intended setup is:

- **pre-commit hook** — `lint-staged` runs ESLint and Prettier on all staged files before every commit
- Files that fail linting or formatting checks block the commit

After installing dependencies, hooks must be registered once:

```bash
pnpm exec simple-git-hooks
```

This creates the actual Git hook files in `.git/hooks/` from the config in `package.json`.

---

## 9. Testing

### Framework

Tests are written and run with **Vitest**. Its API mirrors Jest — the same `describe`, `it`, `expect` surface. Each package has its own `vitest.config.ts`.

Config files are not yet written (as of 2026-03-16).

Run tests:

```bash
pnpm -r test            # run all tests once
pnpm -r test -- --watch # watch mode
```

### Test layers

```
Integration Tests (Vitest)
  Full HTTP requests against a booted Fastify app
  Real PostgreSQL via Testcontainers
  ─────────────────────────────────────────────
Unit Tests (Vitest)
  Pure logic — stat calculators, message parsers
  No infrastructure, run instantly
```

### Testcontainers

Integration tests for `@omb/backend` use **Testcontainers** to spin up a real PostgreSQL Docker container for the duration of the test run. The database is never mocked.

Requirements:
- Docker must be running locally
- CI must have Docker available (GitHub Actions provides this by default)

### What is mocked

| Dependency | Test approach |
|---|---|
| PostgreSQL | Never mocked — real container via Testcontainers |
| S3 / MinIO | Mock storage client in tests |
| Baileys (WhatsApp) | Stub that simulates incoming messages |

### Route completeness contract

A route is not considered done until:
1. A Zod schema in `@omb/shared` defines its request and response shape
2. Unit tests cover the business logic
3. An integration test validates the full request/response cycle against a real database

---

## 10. Docker

### Dockerfiles

Each deployable service has its own `Dockerfile`:

| File | Service |
|---|---|
| `packages/backend/Dockerfile` | Backend API |
| `packages/collector/Dockerfile` | Collector |

`@omb/shared` is not containerised — it is compiled and consumed by the other two packages at build time.

Dockerfiles use multi-stage builds:
- **builder stage** — installs all dependencies and compiles TypeScript
- **production stage** — copies only compiled JS and production dependencies; no TypeScript source, no dev dependencies
- Production containers run as a non-root user
- `COPY package.json` and `pnpm-lock.yaml` before source files to maximise Docker layer caching

Dockerfiles are stub files (as of 2026-03-16) — the multi-stage structure described above reflects the intended implementation from `doc/BACKEND_SPEC.md`.

### docker-compose.yml (production)

Used on the EC2 production host. Defines the full production stack:

- `nginx` — reverse proxy, SSL termination, ports 80 and 443
- `certbot` — sidecar for Let's Encrypt certificate management
- `backend` — Fastify API, internal only
- `collector` — WhatsApp bot, no exposed ports
- `postgres` — PostgreSQL, internal only

Production images are pulled from GitHub Container Registry and tagged by git SHA.

File is a stub (as of 2026-03-16).

### docker-compose.dev.yml (local development)

Used for local development. See [Local development](#4-local-development) for the full service list and instructions.

Differences from production:
- Postgres and MinIO run locally instead of AWS S3 and RDS
- `backend` and `collector` are built from local source with hot reload enabled
- No nginx SSL — plain HTTP only
- No certbot

File is a stub (as of 2026-03-16).

---

## 11. CI/CD

Two GitHub Actions workflows live in `.github/workflows/`.

### ci.yml

Triggers on every push and every pull request to any branch.

Steps (in order):
1. `pnpm -r typecheck` — TypeScript type check across all packages
2. `pnpm -r lint` — ESLint across all packages
3. `pnpm -r format:check` — Prettier format check (no writes)
4. `pnpm -r test` — full Vitest suite including integration tests against Testcontainers PostgreSQL

The pipeline fails fast on any step. PRs cannot be merged until CI passes.

### deploy.yml

Triggers on push to `main`, only after `ci.yml` passes.

Steps (in order):
1. Build Docker image for `@omb/backend`
2. Build Docker image for `@omb/collector`
3. Push both images to GitHub Container Registry tagged with the git SHA
4. SSH into the EC2 instance
5. Pull the new images from GitHub Container Registry
6. Restart containers: `docker compose up -d --no-deps backend collector`
7. Hit health check endpoints to confirm successful container start

Images are always tagged with the git SHA. `latest` is not used as a deployment tag.

Both workflow files are stubs (as of 2026-03-16).

### Container registry

Images are pushed to and pulled from **GitHub Container Registry** (`ghcr.io`). The registry is configured in Terraform. No ECR or Docker Hub.

---

## 12. Config file locations

| Concern | Config file | Status |
|---|---|---|
| Node version | `.nvmrc` | Present — `22` |
| Package manager | `package.json` (`packageManager` field) | Present — `pnpm@10.32.1` |
| Workspace packages | `pnpm-workspace.yaml` | Present |
| pnpm lockfile | `pnpm-lock.yaml` | Present — lockfile v9 |
| TypeScript (root) | `tsconfig.json` | Not yet written |
| TypeScript (backend) | `packages/backend/tsconfig.json` | Not yet written |
| TypeScript (collector) | `packages/collector/tsconfig.json` | Not yet written |
| TypeScript (shared) | `packages/shared/tsconfig.json` | Not yet written |
| ESLint | `eslint.config.js` | Not yet written |
| Prettier | `.prettierrc` | Not yet written |
| Git hooks | `package.json` (`simple-git-hooks` + `lint-staged`) | Not yet configured |
| Vitest (backend) | `packages/backend/vitest.config.ts` | Not yet written |
| Vitest (collector) | `packages/collector/vitest.config.ts` | Not yet written |
| Backend Dockerfile | `packages/backend/Dockerfile` | Stub |
| Collector Dockerfile | `packages/collector/Dockerfile` | Stub |
| Docker Compose (prod) | `docker-compose.yml` | Stub |
| Docker Compose (dev) | `docker-compose.dev.yml` | Stub |
| CI workflow | `.github/workflows/ci.yml` | Stub |
| Deploy workflow | `.github/workflows/deploy.yml` | Stub |
| Environment variables | `.env.example` | Present |
| Terraform | `infra/` | Not yet written |
| Nginx config | `nginx/nginx.conf` | Present (not reviewed here) |
