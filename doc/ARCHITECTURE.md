# OneMillionBeers — Architecture

Last updated: 2026-03-18

## System overview

```
Messaging platform ──> [ Collector Service ] ──> S3-compatible
 (e.g. Telegram,                │                   object storage
   WhatsApp)              HTTP POST                  (beer photos)
                          (metadata + photoUrl)
                                │
                                ▼
Browser ──(HTTPS)──> [ nginx ] ──/api/──> [ Backend API Service ]
                         │                          │
                         └────/──> [ SvelteKit      ▼
                                     Frontend ]  PostgreSQL
                                                 (app data)
```

---

## Service responsibilities

| Service             | Owns                                                                                                       | Does NOT own                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Collectors**      | Platform connection (e.g. Telegram, WhatsApp), photo upload to storage, forwarding metadata to Backend API | Business logic, database, any data beyond what it sends |
| **Backend API**     | All business logic, database reads/writes, REST API, SSE stream                                            | Image data — photos arrive as a URL only                |
| **Frontend**        | Display layer, SSR rendering, real-time UI updates                                                         | Business logic — all data comes from the API            |
| **Gateway (nginx)** | SSL termination, routing `/api/*` to backend, `/` to frontend                                              | Any application logic                                   |

The Collector is not exposed via nginx — it has no public interface.

---

## Data flow: message ingestion

1. Collector receives a group message containing a photo from the messaging platform
2. Collector ignores non-group messages, messages without photos
3. Collector uploads the image buffer directly to S3-compatible storage, receives a public URL
4. Collector POSTs metadata (platform group ID, sender identity, timestamp, photo URL) to `POST /v1/internal/beer-log` on the Backend API — no image data in this call
5. Backend API validates the request (Zod)
6. Backend API hashes the sender identity (SHA-256) and looks up or creates a User record
7. Backend API looks up or creates a Group record by platform group ID
8. Backend API inserts a BeerLog row (including the photo URL from step 4)
9. Backend API broadcasts the updated count to all connected SSE clients
10. Backend API returns 201

---

## Data model

Three entities. See `db/migrations/` for schemas.

**Group** — a messaging group connected to the platform. Has a slug used in public URLs (`/groups/[slug]`). Identified internally by the platform-specific group ID (`source_group_id`).

**User** — a participant who has logged at least one beer. Identified by a SHA-256 hash of their platform identity (e.g. phone number, Telegram user ID) — plaintext is never stored or logged at any point. Has a slug for public URLs (`/users/[slug]`). Created automatically on first beer log — no signup.

**BeerLog** — a single beer photo. Belongs to one User and one Group. Stores the public photo URL and two timestamps: when the WhatsApp message was sent, and when the record was inserted.

---

## API structure

All endpoints are prefixed `/v1/`. Breaking changes introduce `/v2/` without removing `/v1/`.

| Group        | Endpoints                                                 | Consumer                                                      |
| ------------ | --------------------------------------------------------- | ------------------------------------------------------------- |
| **Internal** | Beer log ingestion                                        | Collector only — not routed via nginx, not publicly reachable |
| **Groups**   | Group info, photo feed, leaderboard                       | Frontend                                                      |
| **Users**    | User profile, stats                                       | Frontend                                                      |
| **Global**   | Global count, global feed, global leaderboard, SSE stream | Frontend                                                      |

Full endpoint shapes are defined in `packages/shared/src/` (Zod schemas). The schema is the contract — this document does not duplicate it.

A `/health` endpoint is registered at the root (no version prefix) and returns `{ status: "ok" }`. It is used by infrastructure health checks and is not part of the versioned API contract.

---

## Architectural decisions

### SSE over WebSockets

The real-time stream is unidirectional — the server pushes count and feed updates, the client never sends data over the persistent connection. WebSockets would add handshake overhead and bidirectional complexity for no benefit. SSE requires no client library and reconnects automatically.

### Provider-agnostic object storage

All storage calls use the S3 API. The provider is determined entirely by environment variables (see `.env.example`). Swapping AWS S3 for Cloudflare R2 or MinIO is a config change, not a code change. No provider-specific SDK in application code.

### Identity hashing

The sender's platform identity (phone number, numeric user ID, or similar) is hashed with SHA-256 at the point of ingestion in the Backend API. Plaintext is never written to the database, never logged, and the Collector discards it after forwarding. There is no mechanism to reverse a stored hash. The hash is platform-agnostic — the Backend API never knows or cares which messaging platform sent the identity string.

### Schema-first contract

Zod schemas in `@omb/shared` are defined before routes are built. Both services import from `@omb/shared` — if a schema changes, every consumer fails to compile until updated. The TypeScript compiler enforces contracts across service boundaries. Types are inferred from schemas; no separate type definitions needed.

### No image data in Backend API

The Backend API has no S3 credentials and no image handling code. The Collector uploads directly to storage and passes only the resulting URL. This keeps the API stateless with respect to file data and eliminates a class of upload failure modes from the API path.

### Collector design

The Collector is a pluggable component — the messaging platform is a runtime detail, not a structural constraint. The shared pipeline (S3 upload → Backend API POST) is platform-independent. Only the `collectors/<platform>/` directory is platform-specific.

**Collector selection** is done at startup via the `COLLECTOR` environment variable. Each collector is responsible for connecting to its platform, filtering relevant messages, and calling the shared upload and forwarder modules.

### Swagger UI — development only

`@fastify/swagger` and `@fastify/swagger-ui` are registered at startup when `NODE_ENV !== 'production'`. In non-production environments the interactive API explorer is available at `/docs` (proxied directly via the dev nginx `location /docs/` block — no `/api/` prefix is needed because Swagger's static assets use absolute paths). The prod nginx config does not expose `/docs/`, and `NODE_ENV=production` must be set in the backend container to prevent the routes from being registered at all.

`@fastify/swagger` generates an OpenAPI spec from Zod schemas via `fastify-type-provider-zod`. Schemas in `@omb/shared` remain the single source of truth — the spec is derived, not hand-authored.

### Test-driven development (backend)

A route in `@omb/backend` is not considered done until: its Zod schema exists in `@omb/shared`, unit tests cover the business logic, and an integration test validates the full request/response cycle — happy path and error cases — against a real database via Testcontainers. The database is never mocked; mock/prod divergence has caused production failures before.

### API versioning

All public endpoints are prefixed with a version (`/v1/`, `/v2/`, etc.). A version is never modified in a breaking way — non-breaking additions (new optional fields, new endpoints) are allowed on an existing version, but breaking changes require a new version prefix. This keeps old clients working without forced upgrades.

### No ORM

SQL is written directly using `pg` (node-postgres). Queries are transparent, debuggable, and fully portable across any PostgreSQL host. Migrations are plain numbered `.sql` files in `db/migrations/`, applied in order.

---

## Identity model

All data is public. There is no login, no sessions, and no authenticated endpoints in V1.

Users are auto-created on their first beer log — no signup required. Every participant in a connected group gets a profile the moment they post a photo. User records can be deleted via the API.

---

## Tech stack

Treat these as decided unless there is a compelling reason to revisit:

| Concern            | Decision                                                                     |
| ------------------ | ---------------------------------------------------------------------------- |
| Runtime            | Node.js LTS (version in `.nvmrc`)                                            |
| Language           | TypeScript                                                                   |
| API framework      | Fastify                                                                      |
| Package manager    | pnpm workspaces                                                              |
| Database           | PostgreSQL — plain SQL, no ORM, `pg` driver                                  |
| Validation         | Zod (schemas in `@omb/shared`)                                               |
| API docs (dev)     | @fastify/swagger + @fastify/swagger-ui (env-gated; not active in production) |
| Logging            | Pino (structured JSON to stdout)                                             |
| HTTP client        | Native fetch (Node 18+)                                                      |
| Testing            | Vitest + Testcontainers (@testcontainers/postgresql)                         |
| Collector (PoC)    | Telegram Bot API via grammY (WhatsApp/Baileys planned)                       |
| Object storage     | S3-compatible (MinIO local, AWS S3 prod)                                     |
| Frontend framework | SvelteKit + `@sveltejs/adapter-node`                                         |
| Styling            | Tailwind CSS v4                                                              |
| Charts             | Chart.js via `svelte-chartjs`                                                |
| Reverse proxy      | Nginx                                                                        |
| SSL                | Let's Encrypt + Certbot sidecar                                              |
| CI/CD              | GitHub Actions                                                               |
| Container registry | GitHub Container Registry                                                    |
| IaC                | Terraform (AWS target)                                                       |
| Real-time          | Server-Sent Events                                                           |
