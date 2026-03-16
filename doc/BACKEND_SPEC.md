# OneMillionBeers — Backend Technical Specification

> Status: Draft v0.3 — Under Review
> Last updated: 2026-03-16

---

## 1. Overview

OneMillionBeers is a platform that sits behind existing WhatsApp groups. A bot joins those groups, silently logs every beer photo posted, and surfaces the data on a public web dashboard.

The backend is split into two services:

- **Collector** — connects to WhatsApp via Baileys, watches for photo messages, and forwards each log to the Backend API
- **Backend API** — owns all business logic, data persistence, and serves the REST API consumed by the web frontend

This separation means additional data collection channels (Telegram, dedicated app, etc.) can be added later by pointing a new collector at the same Backend API — no changes to core business logic required.

---

## 2. Architectural Principles

### Provider Agnosticism

All application logic lives inside Docker containers with no dependency on any specific cloud provider. AWS is the assumed initial deployment target, but the application does not care where it runs.

This is achieved by:

- **All services are containerised** — any host that can run Docker can run this stack
- **Inter-service communication is plain HTTP** — services talk over REST regardless of whether they share a host or run on separate machines
- **External dependencies are abstracted via environment variables** — swapping AWS S3 for Cloudflare R2, or AWS RDS for a self-hosted PostgreSQL, is a config change not a code change
- **Infrastructure is the only provider-specific layer** — Terraform targets AWS; the containers it runs are identical everywhere

### Deployment Flexibility

The same codebase and containers support multiple deployment topologies without modification:

| Topology | Description |
|---|---|
| **Single host (V1)** | Application containers (nginx, backend, collector) on one EC2 instance; database on AWS RDS; storage on AWS S3 |
| **Split services** | Each service on its own host, communicate over network — env var change only |
| **Fully managed** | Services on ECS Fargate, managed DB, managed storage — no code changes |
| **Different provider** | Deploy to GCP, DigitalOcean, Hetzner etc. — only Terraform changes |

### MVP First

This specification describes V1. Complexity is deferred unless it solves a real problem at launch scale. Features and infrastructure can be added incrementally — the architecture is designed to accommodate growth without requiring rewrites.

---

## 3. System Architecture

```
WhatsApp ──(outbound WebSocket)──> [ Collector Service ] ──> S3-compatible
                                            │                    object storage
                                      HTTP POST                  (beer photos)
                                      (metadata + photoUrl)
                                            │
                                            ▼
                                  [ Backend API Service ]
                                            │
                                            ▼
                                       PostgreSQL
                                       (app data)
```

### Services

| Service | Responsibility |
|---|---|
| **Collector** | Maintains Baileys WhatsApp connection, filters photo messages, uploads photos to S3-compatible storage, forwards beer log metadata to Backend API |
| **Backend API** | Business logic, data persistence, leaderboards, user profiles, REST API — no image handling |

### Inter-service Communication

The Collector calls the Backend API over HTTP. On a single host this is Docker's internal network (`http://backend:3000`). When split across hosts, the same call goes over a private or public network — only the `BACKEND_URL` environment variable changes.

---

## 4. Infrastructure & Hosting

> AWS is the assumed initial provider. All infrastructure is defined in Terraform. Migrating to another provider means rewriting the Terraform modules — the application containers are unchanged.

### Compute — EC2 t3.small

All V1 containers run on a single EC2 t3.small instance managed with Docker Compose. Simple, cheap, and sufficient for launch traffic.

**Migration path:** Each service can be extracted to ECS Fargate, GCP Cloud Run, or any container platform with no application code changes — only infrastructure config changes.

### Reverse Proxy — Nginx

Nginx runs as a Docker container. It is the only container with public-facing ports (80 and 443).

Responsibilities:
- SSL termination — Node services speak plain HTTP internally
- Reverse proxy to the Backend API container
- HTTP → HTTPS redirect
- The Collector is **not** exposed via Nginx — it has no public interface

### Database — PostgreSQL

The application connects to PostgreSQL via a standard `DATABASE_URL` connection string. The host depends on the environment:

- **Local development:** PostgreSQL runs as a Docker container (see `docker-compose.dev.yml`). Data is persisted to a named Docker volume.
- **Production (V1):** AWS RDS for PostgreSQL. Data persists independently of the EC2 instance or any container lifecycle. Automated backups and point-in-time recovery are managed by RDS.

No application code is aware of which environment it targets — the connection string is the only difference.

### File Storage — S3-compatible Object Storage

Beer photos are stored in S3-compatible object storage. The application uses the S3 API exclusively — no provider-specific SDK. The provider is determined entirely by environment variables (`STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_KEY`, `STORAGE_SECRET`).

- **Local development:** MinIO runs as a Docker container, exposing the S3 API locally
- **V1 production:** AWS S3
- **Migration options:** Cloudflare R2, DigitalOcean Spaces — config change only

Photos are uploaded directly to storage by the Collector — the Backend API never handles image data. The Collector uploads the photo, receives the public URL, and includes it in the metadata sent to the Backend API. Frontend fetches images directly from storage. Traffic never proxies through the application server.

**V1 photo decisions:**
- Original images stored as received from WhatsApp (no resizing or compression)
- Public read access — photos are already shared in a WhatsApp group and the dashboard is public

### Container Registry — Github Container Registry

Docker images are built in CI and pushed to Github Container Registry tagged with the git SHA. The EC2 instance pulls from Github Container Registry on deployment.

Migration option: ECR, Docker Hub, or any registry — a config change in the GitHub Actions workflow.

### Infrastructure as Code — Terraform

Terraform manages all AWS resources:
- EC2 instance + Elastic IP
- Security groups
- S3 bucket + bucket policy
- RDS instance (PostgreSQL)
- Github Container Registry repositories (backend + collector)
- IAM roles

---

## 5. Repository Structure

Single monorepo containing both services and shared code.

```
onemillionbeers/
├── packages/
│   ├── backend/              # Backend API service
│   │   ├── src/
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── collector/            # WhatsApp Collector service
│   │   ├── src/
│   │   ├── Dockerfile
│   │   └── package.json
│   └── shared/               # Shared TypeScript types and Zod schemas
│       └── package.json      # Published internally as @omb/shared
├── db/
│   └── migrations/           # Plain .sql migration files
│       ├── 001_create_groups.sql
│       ├── 002_create_users.sql
│       └── 003_create_beer_logs.sql
├── infra/                    # Terraform
├── nginx/
│   └── nginx.conf
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
├── docker-compose.yml        # Production
├── docker-compose.dev.yml    # Local development
├── .env.example              # Documents all required environment variables
├── .nvmrc                    # Node.js version
└── package.json              # pnpm workspace root
```

---

## 6. Development Approach

### Schema-First

The Zod schemas in `@omb/shared` are the source of truth for all data shapes flowing through the system — request bodies, response objects, and the internal contract between the Collector and Backend API.

Both services import from `@omb/shared`. If a schema changes, every consumer of that schema fails to compile until updated. The TypeScript compiler enforces the contract across service boundaries.

A route is not built until its Zod schemas exist. Schema first, implementation second.

> **OpenAPI spec generation is deferred from V1.** `zod-to-openapi` and `@fastify/swagger` will be added when there is a genuine need — external API consumers, a public Swagger UI, or third-party integrations. For V1, the `@omb/shared` package is the contract and the TypeScript compiler is the enforcement mechanism.

### API Versioning

All public endpoints are prefixed with a version: `/v1/`, `/v2/`, etc.

- A version is never modified in a breaking way
- Non-breaking additions (new optional fields, new endpoints) can be made to an existing version
- Breaking changes require a new version prefix

### Test-Driven Development

A route is not considered done until:
1. The Zod schema defines its request and response shape
2. Unit tests cover the business logic
3. Integration tests validate the full request/response cycle against a real database

### Test Layers

```
┌──────────────────────────────────────────────────┐
│  Integration Tests (Vitest)                      │
│  Full HTTP requests against a booted Fastify app │
│  Real PostgreSQL via Testcontainers in CI        │
├──────────────────────────────────────────────────┤
│  Unit Tests (Vitest)                             │
│  Pure logic — stat calculators, message parsers  │
│  No infrastructure, run instantly                │
└──────────────────────────────────────────────────┘
```

**What is never mocked:**
- The database — integration tests use a real PostgreSQL instance

**What is mocked:**
- S3 uploads — mock storage client in tests
- Baileys — a stub that simulates incoming WhatsApp messages

---

## 7. Tech Stack

The stack prioritises well-known, well-documented, widely adopted tools. Every choice favours community maturity and AI-assistant familiarity.

| Concern | Tool |
|---|---|
| Runtime | Node.js LTS |
| Language | TypeScript |
| Framework | Fastify |
| Package manager | pnpm |
| Database driver | pg (node-postgres) |
| Validation | Zod |
| Logging | Pino |
| Environment config | dotenv |
| HTTP client | Native fetch (Node 18+) |
| Linting | ESLint |
| Formatting | Prettier |
| Testing | Vitest + Testcontainers |
| CI/CD | GitHub Actions |
| WhatsApp client | Baileys |

---

### Node.js LTS

Both services run on the current Node.js LTS release. The version is pinned in `.nvmrc` at the monorepo root.

---

### TypeScript

Both services are written in TypeScript. The `@omb/shared` package contains Zod schemas from which TypeScript types are inferred — shared across both services. If either service violates the shared contract, the build fails at compile time.

---

### Fastify

Used by the Backend API only. The Collector has no HTTP server.

Chosen for native TypeScript support, built-in schema validation that integrates directly with Zod, and a clean plugin architecture.

| Plugin | Purpose |
|---|---|
| `@fastify/cors` | CORS headers for frontend requests |

---

### pnpm Workspaces

Manages the monorepo. Each package has its own `package.json`. The `@omb/shared` package is referenced internally without publishing to a registry. Scripts run across all packages from the root: `pnpm -r build`, `pnpm -r test`.

---

### pg (node-postgres)

No ORM. SQL is written directly. Queries are transparent, debuggable, and fully portable across any PostgreSQL host. Migrations are plain numbered `.sql` files applied in order by a simple migration runner script.

---

### Zod

Zod handles validation in three places:

1. **Request bodies** — every Fastify route has a Zod schema; invalid requests are rejected before reaching handler logic
2. **Environment variables** — on startup both services validate all required env vars are present and correctly typed; the process exits immediately if not
3. **Shared types** — schemas in `@omb/shared` define data shapes shared between services; TypeScript types are inferred from these schemas

Both services import these schemas from `@omb/shared`. TypeScript infers types directly from the schemas — no separate type definitions needed.

---

### Pino

Structured JSON logs written to stdout in both services.

- Development: `pino-pretty` for human-readable output
- Production: raw JSON collected by CloudWatch or any log aggregator
- Log level controlled via `LOG_LEVEL` environment variable

---

### dotenv

`.env` files used in local development only. In production, environment variables are injected by the host. A `.env.example` is committed to the repo documenting every required variable:

```bash
# -------------------
# Backend API
# -------------------
DATABASE_URL=postgres://postgres:postgres@postgres:5432/omb
LOG_LEVEL=info

# -------------------
# Collector
# -------------------
BACKEND_URL=http://backend:3000
STORAGE_ENDPOINT=http://minio:9000
STORAGE_BUCKET=omb-photos
STORAGE_KEY=minioadmin
STORAGE_SECRET=minioadmin
LOG_LEVEL=info
```

---

### Native fetch

The Collector calls the Backend API using Node.js 18+ built-in `fetch`. No Axios or other HTTP client dependency needed.

---

### ESLint + Prettier

Configured at the monorepo root, applied across all packages. Both run in CI — the build fails on lint errors or formatting violations. A pre-commit hook via `simple-git-hooks` + `lint-staged` runs both on staged files before every commit.

---

### Vitest + Testcontainers

Vitest is the test runner for unit and integration tests. Its API mirrors Jest — well documented and familiar.

Testcontainers spins up a real PostgreSQL Docker container for integration test runs in CI. Tests always run against a real database — no mocking of the data layer.

---

### GitHub Actions

Two workflows:

**`ci.yml`** — runs on every push and pull request:
1. `tsc --noEmit` — type check
2. `eslint` — lint
3. `prettier --check` — formatting
4. `vitest run` — full test suite

**`deploy.yml`** — runs on push to `main` after CI passes:
1. Build Docker images for `backend` and `collector`
2. Push to Github Container Registry tagged with git SHA
3. SSH into EC2
4. Pull new images and restart containers
5. Health check

---

## 8. Collector Service

### WhatsApp Integration — Baileys

Baileys is an unofficial WhatsApp Web client for Node.js. It connects **outbound** to WhatsApp's servers over a persistent WebSocket — WhatsApp never calls the Collector, the Collector calls WhatsApp.

This means:
- No inbound webhook
- No public URL required
- No ngrok needed for local development — Baileys connects directly from wherever the process is running

Authentication happens once by scanning a QR code. The session credentials are persisted to a named Docker volume so the connection survives container restarts without re-scanning.

> **Risk:** Baileys reverse-engineers the WhatsApp Web protocol and is not officially supported by Meta. Accounts using it risk being banned. This is accepted for V1. To be reviewed if the project reaches a scale where the official Meta Cloud API becomes viable.

**Baileys session on instance replacement:** If the EC2 instance is terminated and replaced (not just rebooted), the Docker volume is lost and the QR code must be re-scanned. This is an accepted V1 operational reality.

### Message Processing

```
Message received from WhatsApp
        │
        ├── Not a group message? ──> Ignore
        │
        ├── No photo attached? ──> Ignore
        │
        ▼
Extract: sender phone number, WhatsApp group ID, timestamp, image buffer
        │
        ▼
Upload image to S3-compatible storage
        │
        ├── Upload failed? ──> log error, discard message
        │
        ▼
POST /v1/internal/beer-log → Backend API (metadata + photoUrl only)
        │
        ├── Backend call failed? ──> log error
        │
        ▼
Done
```

Only group messages containing a photo are processed. Text, audio, video, stickers, and reactions are all ignored.

### Outbound API Call

The Collector makes two calls per beer photo: one to S3-compatible storage, one to the Backend API. The Backend API call carries only metadata — no image data.

```
POST /v1/internal/beer-log
Content-Type: application/json

{
  "whatsappGroupId": "1234567890@g.us",
  "senderPhone":     "+353861234567",
  "timestamp":       "2026-03-15T14:32:00Z",
  "photoUrl":        "https://s3.eu-west-1.amazonaws.com/omb-photos/beers/uuid.jpg"
}
```

This endpoint is internal only — not routed through Nginx, not publicly reachable.

---

## 9. Backend API Service

### Responsibility

The Backend API is the single source of truth for all application data. It is the only service that reads from and writes to the database. It does not handle image data — photos are uploaded directly to storage by the Collector and arrive here as a URL only.

### API Versioning

All endpoints are prefixed with `/v1/`. Breaking changes will introduce `/v2/` without removing `/v1/`.

### Endpoints

#### Internal — Collector only (not public, not routed via Nginx)
```
POST   /v1/internal/beer-log          Receive a beer log from a collector service
```

#### Public — Groups
```
GET    /v1/groups/:groupId            Group info and stats
GET    /v1/groups/:groupId/feed       Paginated beer photo feed
GET    /v1/groups/:groupId/leaderboard  Ranked member list by beer count
```

#### Public — Users
```
GET    /v1/users/:userId              Public profile
GET    /v1/users/:userId/stats        Beer counts, streaks, favourite times
```

#### Public — Global
```
GET    /v1/global/count               Current global beer total
GET    /v1/global/feed                Recent beers from all groups worldwide
GET    /v1/global/leaderboard         Top contributors globally
```

### Real-time — Server-Sent Events (SSE)

The global beer counter and live feed update in the browser without polling. SSE is used over WebSockets — the server only pushes data, never receives it over the persistent connection, so WebSockets would be unnecessary complexity.

```
GET    /v1/global/stream              SSE stream — pushes counter and feed updates
```

SSE is natively supported in all modern browsers with no client library needed.

### Beer Log Flow

```
POST /v1/internal/beer-log received
        │
        ▼
Validate request body (Zod)
        │
        ▼
Look up or create User by hashed phone number
        │
        ▼
Look up or create Group by WhatsApp group ID
        │
        ▼
Insert BeerLog row (including photoUrl from request)
        │
        ▼
Broadcast updated count via SSE
        │
        ▼
Return 201
```

### Image Handling

1. Collector receives the image buffer from Baileys
2. Collector uploads directly to S3-compatible storage
3. Collector includes the resulting public URL in the beer log request to the Backend API
4. Backend API saves the URL to the database — it never touches image data
5. Frontend fetches images directly from storage — no traffic through the API server

The Backend API has no S3 credentials and no image handling code.

---

## 10. Data Models

```
Group
├── id                UUID, primary key
├── whatsapp_group_id TEXT, unique
├── name              TEXT
├── slug              TEXT, unique  (URL: /g/[slug])
├── created_at        TIMESTAMPTZ

User
├── id                UUID, primary key
├── phone_hash        TEXT, unique  (SHA-256 of phone number — plaintext never stored)
├── display_name      TEXT, nullable
├── slug              TEXT, unique  (URL: /u/[slug])
├── created_at        TIMESTAMPTZ

BeerLog
├── id                UUID, primary key
├── user_id           UUID, FK → users.id
├── group_id          UUID, FK → groups.id
├── photo_url         TEXT          (public S3-compatible storage URL)
├── logged_at         TIMESTAMPTZ   (timestamp of the original WhatsApp message)
├── created_at        TIMESTAMPTZ   (timestamp this record was inserted)
```

---

## 11. Identity

All data is public. There is no login, no sessions, and no authenticated endpoints.

Users are identified by their WhatsApp phone number. **Phone numbers are hashed (SHA-256) before storage — plaintext is never persisted.**

### Auto-creation

When a beer log is received, the Collector provides the sender's phone number. The Backend API hashes it and looks up or creates a User record automatically. No signup required — every participant in a connected WhatsApp group gets a profile created on their first log.

---

## 12. Local Development

No cloud services required. The full stack runs locally via Docker Compose.

```yaml
# docker-compose.dev.yml
services:
  nginx:
    image: nginx:alpine
    ports: ["80:80"]
    volumes:
      - ./nginx/nginx.dev.conf:/etc/nginx/nginx.conf:ro

  backend:
    build: ./packages/backend
    command: pnpm dev
    expose: ["3000"]
    environment:
      DATABASE_URL: postgres://postgres:postgres@postgres:5432/omb
      LOG_LEVEL: debug
    volumes:
      - ./packages/backend/src:/app/src   # hot reload
    depends_on: [postgres]

  collector:
    build: ./packages/collector
    command: pnpm dev
    environment:
      BACKEND_URL: http://backend:3000
      STORAGE_ENDPOINT: http://minio:9000
      STORAGE_BUCKET: omb-photos
      STORAGE_KEY: minioadmin
      STORAGE_SECRET: minioadmin
      LOG_LEVEL: debug
    volumes:
      - ./packages/collector/src:/app/src
      - baileys-session:/app/session       # persist WhatsApp session
    depends_on: [backend, minio]

  postgres:
    image: postgres:16-alpine
    expose: ["5432"]
    environment:
      POSTGRES_DB: omb
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres-data:/var/lib/postgresql/data

  minio:
    image: minio/minio
    ports: ["9000:9000", "9001:9001"]     # 9001 is the MinIO web console
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin

volumes:
  postgres-data:
  baileys-session:
```

Start everything: `docker compose -f docker-compose.dev.yml up`

Baileys connects directly outbound to WhatsApp — no tunnelling or ngrok needed.

---

## 13. Production Deployment

### Container Stack on EC2

```
EC2 t3.small
├── nginx       (ports 80, 443 — only public-facing container)
├── certbot     (sidecar to nginx — manages SSL certificates)
├── backend     (port 3000 — internal only, not public)
└── collector   (no port — outbound only)

AWS RDS (PostgreSQL)        (external — primary data store)
AWS S3 bucket               (external — beer photo storage)
Github Container Registry   (external — Docker image registry)
```

### Deployment Flow

On push to `main`, GitHub Actions:

1. Runs full CI suite (type check, lint, format, tests)
2. Builds Docker images for `backend` and `collector`
3. Pushes images to Github Container Registry tagged with git SHA
4. SSHs into EC2
5. Pulls new images from Github Container Registry
6. Restarts containers: `docker compose up -d --no-deps backend collector`
7. Hits health check endpoints to confirm successful start

## 14. Future Considerations

Features and infrastructure deferred from V1:

- **Database backups** — automated backup strategy before public launch push
- **ECS Fargate migration** — managed containers when single EC2 becomes a bottleneck
- **CDN** — CloudFront or Cloudflare in front of S3 for global image delivery performance
- **Read replicas** — for leaderboard and analytics query isolation at scale
- **Job queue** — pg-boss or BullMQ if background processing needs to move off the request path
- **Official Meta Cloud API** — replace Baileys if account ban risk becomes unacceptable
- **Additional collectors** — Telegram, dedicated mobile app — point at the same Backend API
- **Provider migration** — swap Terraform modules; containers and application code unchanged
