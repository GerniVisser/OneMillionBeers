# OneMillionBeers — Architecture

## System overview

```
WhatsApp ──(outbound WebSocket)──> [ Collector Service ] ──> S3-compatible
                                            │                    object storage
                                      HTTP POST                  (beer photos)
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

| Service             | Owns                                                                             | Does NOT own                                            |
| ------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Collectors**      | WhatsApp connection, photo upload to storage, forwarding metadata to Backend API | Business logic, database, any data beyond what it sends |
| **Backend API**     | All business logic, database reads/writes, REST API, SSE stream                  | Image data — photos arrive as a URL only                |
| **Frontend**        | Display layer, SSR rendering, real-time UI updates                               | Business logic — all data comes from the API            |
| **Gateway (nginx)** | SSL termination, routing `/api/*` to backend, `/` to frontend                    | Any application logic                                   |

The Collector is not exposed via nginx — it has no public interface.

---

## Data flow: message ingestion

1. Baileys receives a WhatsApp group message containing a photo
2. Collector ignores non-group messages, messages without photos
3. Collector uploads the image buffer directly to S3-compatible storage, receives a public URL
4. Collector POSTs metadata (WhatsApp group ID, sender phone number, timestamp, photo URL) to `POST /v1/internal/beer-log` on the Backend API — no image data in this call
5. Backend API validates the request (Zod)
6. Backend API hashes the sender's phone number (SHA-256) and looks up or creates a User record
7. Backend API looks up or creates a Group record by WhatsApp group ID
8. Backend API inserts a BeerLog row (including the photo URL from step 4)
9. Backend API broadcasts the updated count to all connected SSE clients
10. Backend API returns 201

---

## Data model

Three entities. See `db/migrations/` for schemas.

**Group** — a WhatsApp group connected to the platform. Has a slug used in public URLs (`/groups/[slug]`). Identified internally by the WhatsApp group ID.

**User** — a participant who has logged at least one beer. Identified by a SHA-256 hash of their phone number — plaintext is never stored or logged at any point. Has a slug for public URLs (`/users/[slug]`). Created automatically on first beer log — no signup.

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

---

## Architectural decisions

### SSE over WebSockets

The real-time stream is unidirectional — the server pushes count and feed updates, the client never sends data over the persistent connection. WebSockets would add handshake overhead and bidirectional complexity for no benefit. SSE requires no client library and reconnects automatically.

### Provider-agnostic object storage

All storage calls use the S3 API. The provider is determined entirely by environment variables (see `.env.example`). Swapping AWS S3 for Cloudflare R2 or MinIO is a config change, not a code change. No provider-specific SDK in application code.

### Phone number hashing

Phone numbers are hashed with SHA-256 at the point of ingestion in the Backend API. Plaintext is never written to the database, never logged, and the Collector discards it after forwarding. There is no mechanism to reverse a stored hash to a phone number.

### Schema-first contract

Zod schemas in `@omb/shared` are defined before routes are built. Both services import from `@omb/shared` — if a schema changes, every consumer fails to compile until updated. The TypeScript compiler enforces contracts across service boundaries. Types are inferred from schemas; no separate type definitions needed.

### No image data in Backend API

The Backend API has no S3 credentials and no image handling code. The Collector uploads directly to storage and passes only the resulting URL. This keeps the API stateless with respect to file data and eliminates a class of upload failure modes from the API path.

### Baileys for WhatsApp

Baileys is an unofficial WhatsApp Web client connecting outbound over a persistent WebSocket. It requires no inbound webhook, no public URL, and no tunnelling for local development.

**Risk:** Baileys reverse-engineers the WhatsApp Web protocol and is not officially supported by Meta. Accounts using it risk being banned. This is accepted for V1. To be reviewed if the project reaches a scale where the official Meta Cloud API becomes viable.

### Test-driven development (backend)

A route in `@omb/backend` is not considered done until: its Zod schema exists in `@omb/shared`, unit tests cover the business logic, and an integration test validates the full request/response cycle — happy path and error cases — against a real database via Testcontainers. The database is never mocked; mock/prod divergence has caused production failures before.

### API versioning

All public endpoints are prefixed with a version (`/v1/`, `/v2/`, etc.). A version is never modified in a breaking way — non-breaking additions (new optional fields, new endpoints) are allowed on an existing version, but breaking changes require a new version prefix. This keeps old clients working without forced upgrades.

### No ORM

SQL is written directly using `pg` (node-postgres). Queries are transparent, debuggable, and fully portable across any PostgreSQL host. Migrations are plain numbered `.sql` files in `db/migrations/`, applied in order.

---

## Identity model

All data is public. There is no login, no sessions, and no authenticated endpoints in V1.

Users are auto-created on their first beer log — no signup required. Every participant in a connected WhatsApp group gets a profile the moment they post a photo. User records can be deleted via the API.

---

## Tech stack

Treat these as decided unless there is a compelling reason to revisit:

| Concern            | Decision                                    |
| ------------------ | ------------------------------------------- |
| Runtime            | Node.js LTS (version in `.nvmrc`)           |
| Language           | TypeScript                                  |
| API framework      | Fastify                                     |
| Package manager    | pnpm workspaces                             |
| Database           | PostgreSQL — plain SQL, no ORM, `pg` driver |
| Validation         | Zod (schemas in `@omb/shared`)              |
| Logging            | Pino (structured JSON to stdout)            |
| HTTP client        | Native fetch (Node 18+)                     |
| Testing            | Vitest + Testcontainers                     |
| WhatsApp client    | Baileys                                     |
| Object storage     | S3-compatible (MinIO local, AWS S3 prod)    |
| Frontend framework | SvelteKit + `@sveltejs/adapter-node`        |
| Styling            | Tailwind CSS v4                             |
| Charts             | Chart.js via `svelte-chartjs`               |
| Reverse proxy      | Nginx                                       |
| SSL                | Let's Encrypt + Certbot sidecar             |
| CI/CD              | GitHub Actions                              |
| Container registry | GitHub Container Registry                   |
| IaC                | Terraform (AWS target)                      |
| Real-time          | Server-Sent Events                          |
