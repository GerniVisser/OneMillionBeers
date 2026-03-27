# collector-whatsapp — Implementation Plan

This document is the complete specification for implementing `packages/collector-whatsapp`. A fresh session with no prior context should be able to fully implement this feature from this document alone.

---

## 1. Overview

`collector-whatsapp` is a standalone collector service that connects to WhatsApp via [WAHA](https://waha.devlike.pro/) (WhatsApp HTTP API), receives message webhooks, and for every photo posted to a WhatsApp group it:

1. Decodes the base64 image from the webhook payload
2. Uploads the image to S3-compatible storage via `uploadPhoto()` from `@omb/collector-core`
3. Forwards metadata to the Backend API via `forwardBeerLog()` from `@omb/collector-core`

It also monitors the WAHA session state and sends an email alert via AWS SES when re-authentication (QR scan) is required, including a link to a token-protected live status page that renders the current QR code.

**Key constraints:**

- WAHA Core (free tier) is used — session persistence is not available. Every Docker container restart requires a new QR scan.
- The collector processes photos from ALL WhatsApp groups the phone number is in. Unknown groups are logged at warn level with their group ID to aid setup.
- No image data is sent to the Backend API — only the public S3 URL.
- The collector never throws from webhook handlers — errors are logged and silently discarded.

---

## 2. Service Topology

```
Internet
    │  HTTPS (443)
    ▼
┌──────────────────────────────────────────────────────────────┐
│  nginx (gateway)                                             │
│                                                              │
│  /api/*          ──► backend:3000                            │
│  /whatsapp/status ──► collector-whatsapp:8080/status  (1)    │
│  /*              ──► frontend:3001                           │
└──────────────────────────────────────────────────────────────┘
                              │ Docker internal network
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  ┌──────────────────────┐   webhooks POST /webhook           │
│  │  waha                │ ─────────────────────────────►     │
│  │  port 3000 (internal)│                                    │
│  └──────────────────────┘   ◄─── WAHA API calls              │
│            │                     (status, QR PNG)            │
│            │                                                 │
│  ┌──────────────────────┐                                    │
│  │  collector-whatsapp  │                                    │
│  │  port 8080 (internal)│ ──► S3 (uploadPhoto)               │
│  │                      │ ──► backend:3000 (forwardBeerLog)  │
│  │  POST /webhook        │                                    │
│  │  GET  /status    (1) │ ◄── nginx proxies /whatsapp/status │
│  │  GET  /health        │                                    │
│  └──────────────────────┘                                    │
└──────────────────────────────────────────────────────────────┘
```

- **WAHA** runs on port 3000 inside Docker. It is never exposed on the host. The collector accesses it via `http://waha:3000`.
- **collector-whatsapp** runs on port 8080 inside Docker using `expose: '8080'` — reachable within the Docker network but never bound to a host port in production.
- **nginx** is the single external entry point. It proxies `GET /whatsapp/status` → `collector-whatsapp:8080/status`, rewriting the path. The Fastify route inside the collector remains `GET /status` — it has no knowledge of the `/whatsapp/` prefix.
- `POST /webhook` and `GET /health` are internal-only — WAHA and Docker health checks call them directly over the Docker network. They are never routed through nginx.
- Both WAHA and collector-whatsapp use `restart: unless-stopped`.
- In production, the status page URL in alert emails is `https://gernivisser.com/whatsapp/status?token=<STATUS_TOKEN>` — HTTPS via the existing Let's Encrypt cert, no separate port to open.
- In local dev there is no nginx — the status page is at `http://localhost:8080/status?token=dev-token` (direct access to the host-mapped port).

---

## 3. WAHA Configuration

WAHA is configured entirely via environment variables. No API calls are needed to configure webhooks — the env vars below handle it.

| Variable                  | Value                                    | Purpose                                                                        |
| ------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| `WHATSAPP_DEFAULT_ENGINE` | `NOWEB`                                  | Use the lightweight WebSocket engine (Baileys-based)                           |
| `WAHA_API_KEY`            | `<secret>`                               | Protects all WAHA API endpoints; must match `WAHA_API_KEY` in collector        |
| `WHATSAPP_START_SESSION`  | `default`                                | Auto-start the session named "default" on container start                      |
| `WHATSAPP_DOWNLOAD_MEDIA` | `true`                                   | Include base64-encoded media in webhook payloads                               |
| `WAHA_WEBHOOK_URL`        | `http://collector-whatsapp:8080/webhook` | Where WAHA sends all events                                                    |
| `WAHA_WEBHOOK_EVENTS`     | `message,session.status`                 | Only forward these two event types                                             |
| `WAHA_PRINT_QR`           | `true` (local only)                      | Print QR as ASCII art to stdout — scannable from `docker-compose logs -f waha` |

**Local dev QR scanning flow:**

1. Run `docker-compose -f docker-compose.local.yml up`
2. Run `docker-compose -f docker-compose.local.yml logs -f waha`
3. QR code appears as ASCII art in the terminal — hold your phone up and scan
4. Alternatively, visit `http://localhost:8080/status?token=dev-token` in a browser

---

## 4. File Layout

```
packages/collector-whatsapp/
  package.json          — package metadata, scripts, dependencies
  tsconfig.json         — TypeScript config (extends root, NodeNext)
  vitest.config.ts      — Vitest config
  Dockerfile            — multi-stage build (mirrors collector-telegram)
  CLAUDE.md             — Claude Code guide for this package
  src/
    index.ts            — entry point: wires up all modules, handles signals
    config.ts           — env validation (extends CoreConfigSchema)
    waha-client.ts      — thin fetch wrapper for WAHA API calls
    mailer.ts           — AWS SES email sender for re-auth alerts
    session-monitor.ts  — session state tracking: webhook handler + background poll
    server.ts           — Fastify server: /webhook, /status, /health routes
    webhook.ts          — handleWebhookEvent(): parses and dispatches WAHA events
    test/
      config.test.ts
      waha-client.test.ts
      mailer.test.ts
      session-monitor.test.ts
      webhook.test.ts
```

---

## 5. package.json

```json
{
  "name": "@omb/collector-whatsapp",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "test": "vitest run"
  },
  "dependencies": {
    "@aws-sdk/client-ses": "^3.0.0",
    "@omb/collector-core": "workspace:*",
    "@omb/shared": "workspace:*",
    "fastify": "^5.0.0",
    "pino": "^9.6.0",
    "pino-pretty": "^13.0.0",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.3",
    "typescript": "*",
    "vitest": "^3.0.8"
  }
}
```

---

## 6. tsconfig.json

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

---

## 7. vitest.config.ts

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    passWithNoTests: true,
  },
})
```

---

## 8. Environment Variables

### New variables (validated in `src/config.ts`)

| Variable                | Required                       | Default   | Purpose                                                                                                                                                                      |
| ----------------------- | ------------------------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WAHA_BASE_URL`         | Yes                            | —         | Base URL of the WAHA container e.g. `http://waha:3000`                                                                                                                       |
| `WAHA_API_KEY`          | Yes                            | —         | API key for WAHA; all requests include `x-api-key: <value>`                                                                                                                  |
| `WAHA_SESSION`          | No                             | `default` | WAHA session name (Core only supports `default`)                                                                                                                             |
| `WAHA_POLL_INTERVAL_MS` | No                             | `300000`  | How often to poll session status as fallback (ms); 300000 = 5 min                                                                                                            |
| `COLLECTOR_PORT`        | No                             | `8080`    | Port the Fastify webhook server listens on                                                                                                                                   |
| `PUBLIC_BASE_URL`       | Yes                            | —         | Base URL for constructing the status page link in emails e.g. `https://your-ec2-ip` — no trailing slash                                                                      |
| `STATUS_TOKEN`          | Yes                            | —         | Secret token protecting `GET /status`; use a cryptographically random string of at least 32 chars in production                                                              |
| `ENABLE_ALERTS`         | No                             | `false`   | Set to `true` in production to enable SES email alerts when re-auth is needed. When `false` (dev default) the mailer is completely skipped — SES vars below are not required |
| `ALERT_EMAIL`           | Only when `ENABLE_ALERTS=true` | —         | Email address to send re-auth alerts to                                                                                                                                      |
| `SES_FROM_EMAIL`        | Only when `ENABLE_ALERTS=true` | —         | Verified SES sender address e.g. `alerts@yourdomain.com`                                                                                                                     |
| `AWS_REGION`            | Only when `ENABLE_ALERTS=true` | —         | AWS region for SES e.g. `us-east-1`                                                                                                                                          |

### Inherited from `@omb/collector-core` (validated there)

`BACKEND_URL`, `STORAGE_ENDPOINT`, `STORAGE_PUBLIC_URL`, `STORAGE_BUCKET`, `STORAGE_KEY` (optional), `STORAGE_SECRET` (optional), `STORAGE_REGION`, `LOG_LEVEL`

---

## 9. src/config.ts

Extend `CoreConfigSchema` from `@omb/collector-core`. Validate at import time — exit immediately on failure.

```ts
import { z } from 'zod'
import { CoreConfigSchema } from '@omb/collector-core'

const WhatsAppConfigSchema = CoreConfigSchema.extend({
  WAHA_BASE_URL: z.string().url(),
  WAHA_API_KEY: z.string().min(1),
  WAHA_SESSION: z.string().min(1).default('default'),
  WAHA_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(300_000),
  COLLECTOR_PORT: z.coerce.number().int().positive().default(8080),
  PUBLIC_BASE_URL: z.string().url(),
  STATUS_TOKEN: z.string().min(1),
  // Alert feature — disabled by default (dev). Set ENABLE_ALERTS=true in production.
  ENABLE_ALERTS: z.coerce.boolean().default(false),
  ALERT_EMAIL: z.string().email().optional(),
  SES_FROM_EMAIL: z.string().email().optional(),
  AWS_REGION: z.string().min(1).optional(),
})

const result = WhatsAppConfigSchema.safeParse(process.env)
if (!result.success) {
  console.error('Invalid environment variables:')
  for (const issue of result.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`)
  }
  process.exit(1)
}

export const config = result.data
```

---

## 10. src/waha-client.ts

Thin HTTP client for WAHA API. All functions use native `fetch` with `AbortSignal.timeout(10_000)`. All requests include `x-api-key: <WAHA_API_KEY>` header.

```ts
import { config } from './config.js'

export type SessionStatus = 'STOPPED' | 'STARTING' | 'SCAN_QR_CODE' | 'WORKING' | 'FAILED'

// GET /api/sessions/{session}
// Returns the current session status string.
export async function getSessionStatus(): Promise<SessionStatus>

// POST /api/sessions/start  body: { name: session }
// Idempotent — safe to call on startup even if session is already running.
// WAHA returns 200 or 201 regardless; throws on network error or non-2xx.
export async function startSession(): Promise<void>

// GET /api/{session}/auth/qr?format=image
// Returns a PNG Buffer of the current QR code.
// Throws if WAHA returns non-2xx (e.g. session is not in SCAN_QR_CODE state).
export async function getQrCodePng(): Promise<Buffer>

// GET /api/{session}/groups/{groupId}
// Returns { name: string } for the given group JID (e.g. "120363...@g.us").
// Returns the groupId string itself as a fallback if the API call fails.
export async function getGroupName(groupId: string): Promise<string>
```

**Implementation notes:**

- Base URL: `config.WAHA_BASE_URL`
- Session name: `config.WAHA_SESSION`
- Helper for headers:
  ```ts
  function wahaHeaders() {
    return { 'x-api-key': config.WAHA_API_KEY, 'Content-Type': 'application/json' }
  }
  ```
- `getQrCodePng` must call `res.arrayBuffer()` then `Buffer.from(...)` — do not call `res.json()`
- `getGroupName` must catch all errors and return `groupId` as fallback — it must never throw

---

## 11. src/mailer.ts

AWS SES email sender. Only active when `config.ENABLE_ALERTS === true`. `SESClient` is constructed with `{ region: config.AWS_REGION }` and no credentials — the EC2 IAM instance profile provides credentials automatically via the SDK credential provider chain.

```ts
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { config } from './config.js'

// Lazy-initialized — only instantiated when ENABLE_ALERTS=true to avoid
// constructing a SESClient with an undefined region in dev.
let ses: SESClient | null = null
function getSes(): SESClient {
  if (!ses) ses = new SESClient({ region: config.AWS_REGION! })
  return ses
}

export async function sendReauthAlert(statusPageUrl: string): Promise<void>
```

**`sendReauthAlert` must return early immediately when `!config.ENABLE_ALERTS`:**

```ts
export async function sendReauthAlert(statusPageUrl: string): Promise<void> {
  if (!config.ENABLE_ALERTS) return
  // ... build and send email via getSes()
}
```

The email sent by `sendReauthAlert`:

- **To:** `config.ALERT_EMAIL`
- **From:** `config.SES_FROM_EMAIL`
- **Subject:** `[OMB] WhatsApp re-authentication required`
- **Text body:**

  ```
  The WhatsApp session has dropped and requires re-authentication.

  Scan the QR code at: <statusPageUrl>

  The page refreshes automatically every 15 seconds to keep the QR code current.
  Open the link on your computer and scan with your phone.
  ```

- **HTML body:** Same content with the URL as a clickable `<a href>` link and a brief explanation. Keep it simple — no templates needed.

---

## 12. src/session-monitor.ts

Two responsibilities: react to status changes (called from webhook handler or poll) and run a background poll.

### State

```ts
// Module-level — tracks last status we sent an alert for, to avoid duplicate emails
let lastAlertedStatus: string | null = null
```

### handleSessionStatusChange

```ts
export async function handleSessionStatusChange(status: string, logger: pino.Logger): Promise<void>
```

Logic:

1. If `status === 'WORKING'`: reset `lastAlertedStatus = null` (recovery — next drop will alert again). Log info.
2. If `status === 'SCAN_QR_CODE'` or `status === 'FAILED'`:
   - If `lastAlertedStatus === status`: return early (already alerted for this state, no duplicate)
   - Set `lastAlertedStatus = status`
   - Log warn with the status
   - If `config.ENABLE_ALERTS` is `true`:
     - Construct `statusPageUrl`: `${config.PUBLIC_BASE_URL}/whatsapp/status?token=${config.STATUS_TOKEN}`
     - Call `sendReauthAlert(statusPageUrl)`
     - Log warn that alert was sent
     - If `sendReauthAlert` throws: log error but do not rethrow (alerting must never crash the service)
   - If `config.ENABLE_ALERTS` is `false`: log debug `'Alerts disabled — skipping email'`
3. Any other status (`STOPPED`, `STARTING`): log debug, no action.

### startPolling

```ts
export function startPolling(logger: pino.Logger): () => void
```

- Calls `setInterval` with `config.WAHA_POLL_INTERVAL_MS`
- Each tick: calls `getSessionStatus()`, then `handleSessionStatusChange(status, logger)` if status is not `'WORKING'`
- If `getSessionStatus()` throws: log warn, do not propagate
- Returns a stop function: `() => clearInterval(timer)`

---

## 13. src/webhook.ts

Single exported function that handles a raw WAHA webhook body.

```ts
import { pino } from 'pino'
import { uploadPhoto, forwardBeerLog } from '@omb/collector-core'
import { handleSessionStatusChange } from './session-monitor.js'
import { getGroupName } from './waha-client.js'
import { config } from './config.js'

export async function handleWebhookEvent(body: unknown, logger: pino.Logger): Promise<void>
```

### Event routing

Parse `body` as `{ event?: string, session?: string, payload?: unknown }`. Use a simple manual check — no Zod schema needed here since WAHA payload shapes vary across versions.

**If `event === 'session.status'`:**

- Extract `(body as any).payload?.status` as a string
- Call `handleSessionStatusChange(status, logger)`
- Return

**If `event === 'message'`:**

- Extract payload fields (see below)
- Process the message
- Return

**Any other event or missing event:** return silently.

### WAHA NOWEB message payload shape

> **Important:** WAHA payload field names can vary slightly between versions. Log the full raw payload at `debug` level on the first message received so you can verify field names against the deployed WAHA version. The field names below match WAHA NOWEB as of early 2026 — verify against the WAHA API docs at `http://waha:3000/` (Swagger UI) if anything is unexpected.

For a group image message, the payload looks like:

```json
{
  "event": "message",
  "session": "default",
  "payload": {
    "id": "AAAABBBB...",
    "timestamp": 1742306400,
    "from": "1234567890@s.whatsapp.net",
    "fromMe": false,
    "to": "120363XXXX@g.us",
    "participant": "1234567890@s.whatsapp.net",
    "body": "",
    "hasMedia": true,
    "media": {
      "mimetype": "image/jpeg",
      "filename": "photo.jpg",
      "data": "<base64>"
    },
    "chatId": "120363XXXX@g.us"
  }
}
```

Key field notes:

- **Group detection:** `payload.chatId` (or `payload.to`) ends with `@g.us` for group messages. Check `chatId` first, fall back to `to`.
- **Group ID:** the full JID e.g. `120363XXXX@g.us`
- **Sender ID:** `payload.participant` (the actual person who sent the message in the group). If absent, fall back to `payload.from`.
- **Timestamp:** `payload.timestamp` is Unix seconds — convert with `new Date(ts * 1000).toISOString()`
- **Media:** `payload.hasMedia === true` and `payload.media.mimetype.startsWith('image/')` for photos
- **Private messages:** `payload.chatId` ends in `@s.whatsapp.net` (not `@g.us`) — ignore silently

### Message processing logic

```
1. Extract chatId from payload.chatId ?? payload.to
2. If chatId does not end with '@g.us' → return silently (private message)
3. If !payload.hasMedia || !payload.media?.mimetype?.startsWith('image/') → return silently
4. Log warn with chatId if this is an unexpected/new group (for discoverability during setup)
5. senderJid = payload.participant ?? payload.from
   senderId = 'wa:' + senderJid.replace('@s.whatsapp.net', '')
   sourceGroupId = 'wa:' + chatId
6. groupName = await getGroupName(chatId)  ← calls WAHA API; falls back to chatId
7. timestamp = new Date(payload.timestamp * 1000).toISOString()
8. buffer = Buffer.from(payload.media.data, 'base64')
9. key = 'photos/' + chatId.replace('@g.us', '') + '/' + payload.id + '.jpg'
10. photoUrl = await uploadPhoto(key, buffer)
    - On error: log error, return (do not call forwardBeerLog)
11. await forwardBeerLog({ sourceGroupId, groupName, senderId, timestamp, photoUrl })
    - On error: log error (do not rethrow)
12. Log info: beer log forwarded
```

---

## 14. src/server.ts

Builds and returns a configured Fastify instance. Does not start listening — that is done in `index.ts`.

```ts
import Fastify from 'fastify'
import { config } from './config.js'
import { handleWebhookEvent } from './webhook.js'
import { getSessionStatus, getQrCodePng } from './waha-client.js'

export function buildServer() {
  const server = Fastify({ logger: false }) // use own pino logger, not Fastify's built-in
  // ... register routes
  return server
}
```

### Routes

**`POST /webhook`**

- Body: `unknown` (do not validate schema — WAHA shapes vary)
- Call `handleWebhookEvent(req.body, logger)`
- Always return `200 { ok: true }` — WAHA should not retry on collector-side errors; errors are caught inside `handleWebhookEvent`

**`GET /status`**

- The Fastify route is registered at `/status`. nginx externally translates `GET /whatsapp/status` → `GET /status` before the request reaches this handler — the collector has no knowledge of the `/whatsapp/` prefix.
- Query param: `token` (string)
- If `req.query.token !== config.STATUS_TOKEN`: return `401 { error: 'Unauthorized' }`
- Call `getSessionStatus()`
- If status is `'SCAN_QR_CODE'`:
  - Call `getQrCodePng()` — on error, render an error HTML page instead
  - Base64-encode the PNG: `qrBase64 = buffer.toString('base64')`
  - Return HTML (see below)
- Otherwise: return a simple HTML page showing the current status

**QR HTML page** (returned when status is `SCAN_QR_CODE`):

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="15" />
    <title>OMB WhatsApp — Re-authentication Required</title>
    <style>
      body {
        font-family: sans-serif;
        text-align: center;
        padding: 2rem;
      }
    </style>
  </head>
  <body>
    <h1>WhatsApp Re-authentication Required</h1>
    <p>Scan this QR code with your phone. Page refreshes automatically every 15 seconds.</p>
    <img src="data:image/png;base64,<qrBase64>" alt="QR Code" style="max-width:300px" />
    <p><small>Session status: SCAN_QR_CODE</small></p>
  </body>
</html>
```

**Status HTML page** (returned when status is anything other than `SCAN_QR_CODE`):

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="30">
  <title>OMB WhatsApp — Session Status</title>
  <style>body{font-family:sans-serif;text-align:center;padding:2rem}</style>
</head>
<body>
  <h1>WhatsApp Session Status</h1>
  <p>Current status: <strong><status></strong></p>
  <p><small>Page refreshes every 30 seconds.</small></p>
</body>
</html>
```

**`GET /health`**

- Returns `200 { status: 'ok' }` — no auth, used by Docker health checks

---

## 15. src/index.ts

Entry point. Wires everything together.

```ts
import { pino } from 'pino'
import { config } from './config.js'
import { startSession } from './waha-client.js'
import { buildServer } from './server.js'
import { startPolling } from './session-monitor.js'

async function main(): Promise<void> {
  const logger = pino({ name: 'collector-whatsapp', level: config.LOG_LEVEL })

  logger.info('Starting WhatsApp collector')

  // Ensure WAHA session is started (idempotent)
  try {
    await startSession()
    logger.info('WAHA session started')
  } catch (err) {
    // Non-fatal — WAHA may already be starting the session via WHATSAPP_START_SESSION env var
    logger.warn({ err }, 'Could not explicitly start WAHA session — continuing anyway')
  }

  const server = buildServer()
  await server.listen({ port: config.COLLECTOR_PORT, host: '0.0.0.0' })
  logger.info({ port: config.COLLECTOR_PORT }, 'Webhook server listening')

  const stopPolling = startPolling(logger)

  const shutdown = async () => {
    logger.info('Shutting down')
    stopPolling()
    await server.close()
  }

  process.once('SIGINT', () => void shutdown())
  process.once('SIGTERM', () => void shutdown())
}

main().catch((err) => {
  console.error('Collector crashed', err)
  process.exit(1)
})
```

---

## 16. Test Files

### test/config.test.ts

Mock `process.env`. Test:

- All required vars present → `config` is defined without throwing
- Missing `WAHA_BASE_URL` → process exits with code 1
- Missing `STATUS_TOKEN` → process exits with code 1
- `WAHA_SESSION` absent → defaults to `'default'`
- `COLLECTOR_PORT` absent → defaults to `8080`
- `WAHA_POLL_INTERVAL_MS` absent → defaults to `300000`
- `ENABLE_ALERTS` absent → defaults to `false`
- `ALERT_EMAIL`, `SES_FROM_EMAIL`, `AWS_REGION` absent with `ENABLE_ALERTS=false` → no error (all optional)
- `ALERT_EMAIL`, `SES_FROM_EMAIL`, `AWS_REGION` absent with `ENABLE_ALERTS=true` → config still parses (Zod schema does not enforce them; the guard is at call time)

Pattern: use `vi.resetModules()` before each test and dynamically `import('../config.js')` with stubbed `process.env`, spy on `process.exit`.

### test/waha-client.test.ts

Mock `fetch` via `vi.stubGlobal('fetch', mockFetch)`. Mock `../config.js` with test values. Test:

- `getSessionStatus()` — mock returns `{ name: 'default', status: 'WORKING' }`; assert returns `'WORKING'`
- `getSessionStatus()` — mock returns non-2xx; assert throws
- `startSession()` — assert POSTs to `/api/sessions/start` with `{ name: 'default' }` and correct `x-api-key` header
- `getQrCodePng()` — mock returns binary response; assert returns a Buffer
- `getQrCodePng()` — mock returns non-2xx; assert throws
- `getGroupName('120363@g.us')` — mock returns `{ name: 'Beer Crew' }`; assert returns `'Beer Crew'`
- `getGroupName('120363@g.us')` — mock throws; assert returns `'120363@g.us'` (fallback)

### test/mailer.test.ts

Mock `@aws-sdk/client-ses`: `SESClient` and `SendEmailCommand`. Mock `../config.js`. Test:

- `ENABLE_ALERTS=false` (default) → `sendReauthAlert` returns immediately; `SESClient.send` not called
- `ENABLE_ALERTS=true` → `sendReauthAlert('https://example.com/status?token=abc')` — assert `SendEmailCommand` was constructed with:
  - `Destination.ToAddresses` contains `config.ALERT_EMAIL`
  - `Source` equals `config.SES_FROM_EMAIL`
  - `Message.Subject.Data` equals `'[OMB] WhatsApp re-authentication required'`
  - `Message.Body.Text.Data` contains the status page URL
  - `Message.Body.Html.Data` contains the status page URL as an anchor tag
- `ENABLE_ALERTS=true` and `ses.send()` throws → `sendReauthAlert` should rethrow (the caller in session-monitor catches it)

### test/session-monitor.test.ts

Mock `../mailer.js` (`sendReauthAlert` as `vi.fn()`), mock `../waha-client.js` (`getSessionStatus` as `vi.fn()`), mock `../config.js`. Use `vi.useFakeTimers()` for polling tests. Test:

- `handleSessionStatusChange('SCAN_QR_CODE', logger)` with `ENABLE_ALERTS=true`:
  - `sendReauthAlert` is called once
  - URL passed includes `PUBLIC_BASE_URL`, `/whatsapp/status`, and `STATUS_TOKEN`
- `handleSessionStatusChange('SCAN_QR_CODE', logger)` with `ENABLE_ALERTS=false`:
  - `sendReauthAlert` is not called
- `handleSessionStatusChange('SCAN_QR_CODE', logger)` called twice:
  - `sendReauthAlert` called only once (deduplication)
- `handleSessionStatusChange('FAILED', logger)`:
  - `sendReauthAlert` is called
- `handleSessionStatusChange('WORKING', logger)`:
  - `sendReauthAlert` not called; resets dedup state so subsequent `SCAN_QR_CODE` sends again
- `sendReauthAlert` throws:
  - `handleSessionStatusChange` does not rethrow
- `startPolling()` — `getSessionStatus` returns `'SCAN_QR_CODE'`; advance fake timer by poll interval; assert `sendReauthAlert` called
- `startPolling()` — `getSessionStatus` throws; assert no crash, next tick still works
- `stopPolling()` returned by `startPolling()` — advance timer; assert `getSessionStatus` not called after stop

### test/webhook.test.ts

Mock `@omb/collector-core` (`uploadPhoto`, `forwardBeerLog`), mock `./session-monitor` (`handleSessionStatusChange`), mock `./waha-client` (`getGroupName`), mock `./config.js`. Test:

Helper: `makeImagePayload(overrides?)` builds a valid WAHA message payload.

- Valid image message from group → `uploadPhoto` called with correct key (`photos/120363XXXX/MSGID.jpg`), `forwardBeerLog` called with `sourceGroupId: 'wa:120363XXXX@g.us'`, `senderId: 'wa:1234567890'`, correct ISO timestamp
- `event === 'session.status'` with `payload.status = 'SCAN_QR_CODE'` → `handleSessionStatusChange` called with `'SCAN_QR_CODE'`
- `event === 'message'` with `hasMedia: false` → `uploadPhoto` not called
- `event === 'message'` with `mimetype: 'video/mp4'` → `uploadPhoto` not called
- `event === 'message'` with `chatId` ending in `@s.whatsapp.net` (private chat) → `uploadPhoto` not called
- `uploadPhoto` throws → `forwardBeerLog` not called; no rethrow
- `forwardBeerLog` throws → no rethrow
- Unknown event type → no calls, no throw

---

## 17. Dockerfile

```dockerfile
# Stage 1: Install dependencies
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json               ./packages/shared/
COPY packages/collector-core/package.json       ./packages/collector-core/
COPY packages/collector-whatsapp/package.json   ./packages/collector-whatsapp/
RUN pnpm install --frozen-lockfile

# Stage 2: Dev (hot reload)
FROM deps AS dev
COPY packages/shared/src          ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/collector-core/src       ./packages/collector-core/src
COPY packages/collector-core/tsconfig.json ./packages/collector-core/
COPY tsconfig.json ./
RUN pnpm --filter @omb/shared build
RUN pnpm --filter @omb/collector-core build
COPY packages/collector-whatsapp/src       ./packages/collector-whatsapp/src
WORKDIR /app/packages/collector-whatsapp
CMD ["pnpm", "dev"]

# Stage 3: Build
FROM deps AS build
COPY packages/shared/src          ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/collector-core/src       ./packages/collector-core/src
COPY packages/collector-core/tsconfig.json ./packages/collector-core/
COPY packages/collector-whatsapp/src       ./packages/collector-whatsapp/src
COPY packages/collector-whatsapp/tsconfig.json ./packages/collector-whatsapp/
COPY tsconfig.json ./
RUN pnpm --filter @omb/shared build
RUN pnpm --filter @omb/collector-core build
RUN pnpm --filter @omb/collector-whatsapp build
RUN pnpm deploy --filter @omb/collector-whatsapp --prod --legacy /deploy/collector-whatsapp

# Stage 4: Production
FROM node:22-alpine AS prod
WORKDIR /app
COPY --from=build /deploy/collector-whatsapp/node_modules ./node_modules
COPY --from=build /app/packages/collector-whatsapp/dist   ./dist
COPY --from=build /app/packages/collector-whatsapp/package.json ./package.json
CMD ["node", "dist/index.js"]
```

---

## 18. docker-compose.yml Changes (Production)

Three changes are needed: add `waha`, add `collector-whatsapp`, and add `collector-whatsapp` to the nginx `depends_on`.

**Add to nginx service:**

```yaml
nginx:
  # ... existing config unchanged ...
  depends_on:
    - backend
    - frontend
    - collector-whatsapp # add this line
```

**Add after the existing `collector-telegram` service:**

```yaml
waha:
  image: devlikeapro/waha-core
  expose:
    - '3000'
  restart: unless-stopped
  environment:
    WHATSAPP_DEFAULT_ENGINE: NOWEB
    WAHA_API_KEY: ${WAHA_API_KEY}
    WHATSAPP_START_SESSION: default
    WHATSAPP_DOWNLOAD_MEDIA: 'true'
    WAHA_WEBHOOK_URL: http://collector-whatsapp:8080/webhook
    WAHA_WEBHOOK_EVENTS: message,session.status
  logging:
    driver: awslogs
    options:
      awslogs-group: /omb/waha
      awslogs-region: us-east-1
      tag: 'waha/{{.ID}}'

collector-whatsapp:
  image: ghcr.io/${GITHUB_REPOSITORY}/omb-collector-whatsapp:${GIT_SHA}
  expose:
    - '8080'
  restart: unless-stopped
  depends_on:
    - waha
    - backend
  environment:
    BACKEND_URL: http://backend:3000
    STORAGE_ENDPOINT: ${STORAGE_ENDPOINT}
    STORAGE_PUBLIC_URL: ${STORAGE_PUBLIC_URL}
    STORAGE_BUCKET: ${STORAGE_BUCKET}
    STORAGE_REGION: ${STORAGE_REGION:-auto}
    LOG_LEVEL: ${LOG_LEVEL:-info}
    WAHA_BASE_URL: http://waha:3000
    WAHA_API_KEY: ${WAHA_API_KEY}
    COLLECTOR_PORT: '8080'
    PUBLIC_BASE_URL: ${PUBLIC_BASE_URL}
    STATUS_TOKEN: ${STATUS_TOKEN}
    ALERT_EMAIL: ${ALERT_EMAIL}
    SES_FROM_EMAIL: ${SES_FROM_EMAIL}
    AWS_REGION: ${AWS_REGION}
  logging:
    driver: awslogs
    options:
      awslogs-group: /omb/collector-whatsapp
      awslogs-region: us-east-1
      tag: 'collector-whatsapp/{{.ID}}'
```

**Notes:**

- `STORAGE_KEY` and `STORAGE_SECRET` are intentionally omitted — the EC2 IAM role provides both S3 and SES credentials.
- Both services use `expose:` (not `ports:`) — they are reachable on the Docker network but never bind to a host port.
- `collector-whatsapp` uses a pre-built image from GHCR, matching the pattern of all other app services. A CI/CD step to build and push the image must be added to `.github/workflows/deploy.yml` (mirror the existing `collector-telegram` step).
- nginx lists `collector-whatsapp` in `depends_on` because it proxies `GET /whatsapp/status` to it — nginx should not start before the upstream exists.

---

## 19. docker-compose.local.yml Changes

`docker-compose.local.yml` is infrastructure-only (postgres, minio). Application services — including `collector-whatsapp` — are run directly on the host via `pnpm dev`, consistent with the existing local dev pattern.

The exception is WAHA itself: it is a third-party Docker image with no buildable source, so it lives in `docker-compose.local.yml` as infrastructure. The collector runs on the host and WAHA must be able to reach it. On Linux, Docker containers cannot reach the host via `localhost` — they must use the special hostname `host.docker.internal`, which requires `extra_hosts: ["host.docker.internal:host-gateway"]` to be declared on the service (Docker Desktop on Mac/Windows provides this automatically; on Linux it must be explicit).

**Add to `docker-compose.local.yml`:**

```yaml
waha:
  image: devlikeapro/waha-core
  ports:
    - '3100:3000'
  extra_hosts:
    - 'host.docker.internal:host-gateway'
  environment:
    WHATSAPP_DEFAULT_ENGINE: NOWEB
    WAHA_API_KEY: local-api-key
    WHATSAPP_START_SESSION: default
    WHATSAPP_DOWNLOAD_MEDIA: 'true'
    WAHA_WEBHOOK_URL: http://host.docker.internal:8080/webhook
    WAHA_WEBHOOK_EVENTS: message,session.status
    WAHA_PRINT_QR: 'true'
```

**Local dev collector startup:**

```bash
pnpm --filter @omb/collector-whatsapp dev
```

The collector reads from `.env.local` (or the shell environment). See section 20 for the required vars.

**Local dev access points:**

- WAHA Swagger UI: `http://localhost:3100` — inspect the API, verify webhook config
- Status page: `http://localhost:8080/status?token=dev-token` — direct to the host-run collector
- QR in terminal: `docker-compose -f docker-compose.local.yml logs -f waha`

---

## 20. .env.example and .env.local.example Additions

### Append to .env.example

```bash
# WhatsApp collector (WAHA)
WAHA_API_KEY=your-strong-waha-api-key-here
# PUBLIC_BASE_URL is the site's public domain — used to construct the /whatsapp/status link in alert emails
PUBLIC_BASE_URL=https://gernivisser.com
# STATUS_TOKEN must be a cryptographically random string of at least 32 characters
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
STATUS_TOKEN=generate-a-random-32-char-hex-string
ALERT_EMAIL=you@example.com
SES_FROM_EMAIL=alerts@yourdomain.com
AWS_REGION=us-east-1
```

### Append to .env.local.example

```bash
# WhatsApp collector (WAHA) — local dev
# collector-whatsapp runs on the host via pnpm dev; WAHA runs in Docker (docker-compose.local.yml)
WAHA_BASE_URL=http://localhost:3100
WAHA_API_KEY=local-api-key
# In local dev there is no nginx — status page is accessed directly at localhost:8080
PUBLIC_BASE_URL=http://localhost:8080
STATUS_TOKEN=dev-token
# ENABLE_ALERTS defaults to false — SES vars are not needed in local dev
```

---

## 21. CLAUDE.md

Create `packages/collector-whatsapp/CLAUDE.md`:

```markdown
# collector-whatsapp — Claude Code Guide

## What this service is

A WhatsApp collector that connects to WhatsApp via WAHA (WhatsApp HTTP API) running as a sidecar Docker service. It receives message webhooks from WAHA, downloads photo media, uploads to S3, and forwards metadata to the Backend API. When the WhatsApp session requires re-authentication (QR scan), it sends an email alert with a link to a live token-protected status page.

This is a standalone deployable service — it produces its own Docker image.

Shared infrastructure (S3 upload, backend forwarding, base env config) lives in `@omb/collector-core`.

## Key constraints

- **WAHA Core** — free tier; no session persistence. Every Docker container restart requires a new QR scan.
- **Inbound HTTP server** — unlike collector-telegram, this service has an inbound Fastify server on port 8080 for WAHA webhooks and the status page.
- **All groups** — processes photos from all WhatsApp groups; logs unknown groups at warn level with their ID.
- **Never throw from webhook handlers** — errors are logged and discarded.
- **No image data to backend** — image bytes never leave this service; only the public S3 URL is forwarded.
- **Token-protected status page** — `GET /status?token=<STATUS_TOKEN>` renders a live QR code. In production this is accessed via nginx at `https://gernivisser.com/whatsapp/status?token=...` — the collector port (8080) is never exposed on the host.

## File layout
```

src/
index.ts — entry point
config.ts — env validation (extends CoreConfigSchema)
waha-client.ts — WAHA API HTTP client
mailer.ts — AWS SES re-auth alert
session-monitor.ts — session state tracking + background poll
server.ts — Fastify server (/webhook, /status, /health)
webhook.ts — WAHA event handler
test/ — unit tests (all external calls mocked)

```

## Message processing flow

```

WAHA webhook POST /webhook
│
├── event = session.status ──► handleSessionStatusChange()
│ │
│ SCAN_QR_CODE or FAILED?
│ │
│ sendReauthAlert() via SES
│ (deduped — one email per drop)
│
└── event = message
│
├── chatId ends in @g.us? ──No──► ignore
├── hasMedia + image mimetype? ──No──► ignore
│
▼
decode base64 media → Buffer
│
▼
uploadPhoto(key, buffer) ← @omb/collector-core
│
├── fails? ──► log error, discard
│
▼
forwardBeerLog({ sourceGroupId: 'wa:...', senderId: 'wa:...', ... })
│
├── fails? ──► log error (no throw)
│
▼
Done

````

## Session monitoring

Two layers:
1. **Webhook events** — WAHA sends `session.status` events in real time
2. **Background poll** — polls `GET /api/sessions/default` every 5 minutes (configurable via `WAHA_POLL_INTERVAL_MS`)

Both call `handleSessionStatusChange()`. Deduplication ensures only one email per status transition.

## Local dev — QR scanning

1. `docker-compose -f docker-compose.local.yml up` — starts WAHA (and postgres/minio)
2. `pnpm --filter @omb/collector-whatsapp dev` — starts collector on host port 8080
3. `docker-compose -f docker-compose.local.yml logs -f waha` — QR appears as ASCII art in terminal
4. Scan with your phone

Or visit `http://localhost:8080/status?token=dev-token` in a browser (direct to host-run collector — no nginx in local dev).

In production the status page is accessed via nginx at `https://gernivisser.com/whatsapp/status?token=<STATUS_TOKEN>`.

## Environment variables

See section 8 of `doc/COLLECTOR_WHATSAPP_PLAN.md` for the full table.

Key vars:
- `WAHA_BASE_URL` — e.g. `http://waha:3000`
- `WAHA_API_KEY` — shared secret with the WAHA container
- `STATUS_TOKEN` — protects the /status QR page (min 32 chars in production)
- `ENABLE_ALERTS` — set to `true` in production to activate SES email alerts (default `false`)
- `ALERT_EMAIL` / `SES_FROM_EMAIL` / `AWS_REGION` — SES alert config; only needed when `ENABLE_ALERTS=true`
- `PUBLIC_BASE_URL` — base URL for the status page link in emails

## Testing

All external calls mocked — no real WAHA, SES, S3, or backend calls.

```bash
pnpm --filter @omb/collector-whatsapp test
````

````

---

## 22. nginx Config Changes (already applied)

The three nginx config files in `packages/gateway/` have already been updated. This section documents what was changed so the implementer understands the routing.

### What was changed

An upstream block and a single `location = /whatsapp/status` block were added to all three configs.

**`nginx.conf` (production)** — upstream block added alongside `backend` and `frontend`:
```nginx
upstream collector-whatsapp {
  server collector-whatsapp:8080;
}
````

Location block added inside the HTTPS server block, before `location /`:

```nginx
# WhatsApp collector status page — operator QR scan tool (token-protected)
location = /whatsapp/status {
  proxy_pass         http://collector-whatsapp/status;
  proxy_http_version 1.1;
  proxy_set_header   Host              $host;
  proxy_set_header   X-Real-IP         $remote_addr;
  proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
  proxy_set_header   X-Forwarded-Proto $scheme;
}
```

**`nginx.dev.conf`** — uses `set $variable` pattern (Docker DNS resolver); added:

```nginx
set $collector_whatsapp  collector-whatsapp:8080;
```

```nginx
location = /whatsapp/status {
  proxy_pass         http://$collector_whatsapp/status;
  ...
}
```

**`nginx.local.conf`** — same upstream + location pattern as `nginx.conf`, pointing to `localhost:8080`.

### Why `location =` (exact match)

The exact-match modifier (`=`) is used rather than a prefix match. This:

- Has highest nginx location priority — always wins over `location /` regardless of config order
- Prevents any sub-path (e.g. `/whatsapp/status/anything`) from accidentally matching
- Is marginally faster (nginx stops searching after an exact match)

### How path rewriting works

nginx replaces the matched location prefix with the URI specified in `proxy_pass`. For:

```
Request:   GET /whatsapp/status?token=abc123
proxy_pass http://collector-whatsapp/status
Upstream:  GET /status?token=abc123
```

Query strings are always preserved by nginx — the `?token=` param reaches the Fastify handler unchanged. The Fastify route is registered at `GET /status` and has no knowledge of the `/whatsapp/` prefix.

---

## 23. Implementation Order

Follow this order to avoid blocked dependencies:

1. **`package.json`** — defines the package and its deps
2. **`tsconfig.json`** and **`vitest.config.ts`** — build config
3. **`src/config.ts`** + **`test/config.test.ts`** — foundation; all other modules depend on it
4. **`src/waha-client.ts`** + **`test/waha-client.test.ts`** — needed by session-monitor, server, and webhook
5. **`src/mailer.ts`** + **`test/mailer.test.ts`** — needed by session-monitor
6. **`src/session-monitor.ts`** + **`test/session-monitor.test.ts`** — needed by webhook and index
7. **`src/webhook.ts`** + **`test/webhook.test.ts`** — depends on session-monitor, waha-client, collector-core
8. **`src/server.ts`** — depends on webhook, waha-client, config
9. **`src/index.ts`** — wires everything; implement last
10. **`Dockerfile`** — can be written any time after package.json
11. **`CLAUDE.md`** — write alongside or after implementation
12. **`docker-compose.yml` additions** — add `waha` and `collector-whatsapp` services; add `collector-whatsapp` to nginx `depends_on`
13. **`docker-compose.local.yml` additions** — add `waha` service only (collector runs on host)
14. **`.env.example` and `.env.local.example` additions** — append new vars
15. **nginx configs** — already updated in `packages/gateway/` (see section 22)
16. **Run `pnpm install`** from repo root to register the new workspace package
17. **Run `pnpm -r build`** to verify compilation
18. **Run `pnpm -r test`** to verify all tests pass

---

## 23. Key Gotchas and Notes

**WAHA payload field names**
WAHA NOWEB payload shapes can differ between versions. On the first run, log the raw payload at `debug` level to verify field names. Specifically verify: `chatId`, `participant`, `hasMedia`, `media.data`, `media.mimetype`, `timestamp`. Check the WAHA Swagger UI at `http://localhost:3100` (local) for the deployed API spec.

**Group ID for `sourceGroupId`**
Use the full JID including `@g.us` in the `wa:` prefixed ID. Example: `wa:120363XXXX@g.us`. This ensures uniqueness and is the format that gets hashed by the backend.

**Sender ID stripping**
Strip `@s.whatsapp.net` from participant JIDs for cleaner IDs: `wa:1234567890` not `wa:1234567890@s.whatsapp.net`. The backend hashes whatever string it receives — just be consistent.

**Email alerts are production-only**
`ENABLE_ALERTS` defaults to `false`. In local dev, alerts are completely skipped — the mailer returns immediately, no SES client is instantiated, and `ALERT_EMAIL` / `SES_FROM_EMAIL` / `AWS_REGION` are not required. Set `ENABLE_ALERTS=true` in production (`.env.example`) to activate the feature.

**AWS SES sandbox mode** _(production only)_
In a fresh AWS account, SES starts in sandbox mode. Both the sender (`SES_FROM_EMAIL`) and recipient (`ALERT_EMAIL`) must be verified in SES Console before emails will deliver. Request production access to remove this restriction.

**IAM role for SES** _(production only)_
The EC2 instance role must include the `ses:SendEmail` permission for the `SES_FROM_EMAIL` identity. This is only needed when `ENABLE_ALERTS=true`.

**`PUBLIC_BASE_URL` — the domain, not a port**
In production, `PUBLIC_BASE_URL=https://gernivisser.com`. The status page URL in alert emails is constructed as `${PUBLIC_BASE_URL}/whatsapp/status?token=...` — nginx routes `/whatsapp/status` to the collector. Do not set this to a raw IP+port; the port is never publicly exposed. In local dev (no nginx), `PUBLIC_BASE_URL=http://localhost:8080` points directly to the host-run collector.

Ensure there is no trailing slash. The Zod schema validates it as a URL but does not enforce no-trailing-slash — add `.transform(s => s.replace(/\/$/, ''))` if desired.

**`/whatsapp/status` path in `session-monitor.ts`**
The URL constructed in `handleSessionStatusChange` must use the nginx-facing path: `${config.PUBLIC_BASE_URL}/whatsapp/status?token=${config.STATUS_TOKEN}`. This is what goes into the alert email. The collector's own internal route is `/status` — the `/whatsapp/` prefix only exists at the nginx layer.

**WAHA Core — one session only**
WAHA Core only allows a session named `default`. `WAHA_SESSION` env var defaults to `default` and should not be changed unless upgrading to WAHA Plus.

**Container restart re-auth**
Every time the WAHA container restarts (deploy, EC2 reboot, crash), the WhatsApp session is lost and a new QR scan is required. The session monitor will detect this and send an email. Use `restart: unless-stopped` (not `always`) so intentional `docker stop` does not trigger an immediate restart.

**`pnpm install` after adding the package**
After creating `packages/collector-whatsapp/package.json`, run `pnpm install` from the repo root so pnpm registers the workspace package and symlinks `@omb/collector-whatsapp` into dependent packages.

**Fastify version**
Use Fastify v5 (specified in package.json as `"fastify": "^5.0.0"`). Fastify v5 requires Node 20+. The Dockerfile uses `node:22-alpine` which satisfies this.

**CI/CD — add build step for `omb-collector-whatsapp` image**
Production uses pre-built images from GHCR. `.github/workflows/deploy.yml` must be updated to build and push `omb-collector-whatsapp:${GIT_SHA}`, mirroring the existing `omb-collector-telegram` step. Without this the image reference in `docker-compose.yml` will not exist and the service will fail to start on deploy.

**`host.docker.internal` on Linux in local dev**
WAHA runs in Docker and must POST webhooks to the collector running on the host. On Linux, `host.docker.internal` is not available by default — `extra_hosts: ["host.docker.internal:host-gateway"]` on the WAHA service in `docker-compose.local.yml` enables it. On Mac/Windows Docker Desktop this is automatic. The `host-gateway` value resolves to the host's IP on the Docker bridge network.
