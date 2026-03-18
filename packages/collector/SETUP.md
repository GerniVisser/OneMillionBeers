# Telegram Collector — Setup Guide

The Telegram collector uses the official Bot API. Setup takes about five minutes: create a bot, configure it, add it to your group, and set one environment variable.

---

## 1. Create the Bot

1. Open Telegram and start a chat with **[@BotFather](https://t.me/BotFather)**
2. Send `/newbot`
3. Enter a display name when prompted (e.g. `OneMillionBeers`)
4. Enter a username ending in `bot` when prompted (e.g. `onemillionbeers_bot`)
5. BotFather replies with your token:

   ```
   Done! Congratulations on your new bot. You will find it at t.me/onemillionbeers_bot.
   Use this token to access the HTTP API:
   1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ-example
   ```

   Copy this token — it becomes `TELEGRAM_BOT_TOKEN` in your `.env.local`.

---

## 2. Disable Privacy Mode (critical)

By default Telegram bots only see messages that start with `/` in group chats. Without disabling privacy mode the bot will never receive photo messages.

1. Send `/mybots` to **@BotFather**
2. Select your bot
3. Choose **Bot Settings → Group Privacy → Turn off**
4. BotFather confirms: _"Privacy mode is disabled for your bot"_

> **This only takes effect for groups the bot is added to after the change.** If you add the bot to a group first, you must remove and re-add it for privacy mode to apply.

---

## 3. Add the Bot to a Group

1. Open your Telegram group
2. Tap the group name → **Add Members**
3. Search for your bot's username (e.g. `@onemillionbeers_bot`)
4. Select it and tap **Add**

The bot needs no special permissions — being a regular member is enough.

---

## 4. Configure Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

```bash
# Collector selection
COLLECTOR=telegram

# Backend API
BACKEND_URL=http://localhost:3000

# S3-compatible storage (MinIO runs locally via docker-compose)
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_BUCKET=omb-photos
STORAGE_KEY=minioadmin
STORAGE_SECRET=minioadmin

# Telegram
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ-example

# Log level
LOG_LEVEL=debug
```

---

## 5. Create the Storage Bucket

The MinIO bucket must exist before the collector runs. Start the local infrastructure and create it:

```bash
# Start PostgreSQL and MinIO
pnpm infra:up

# Open the MinIO console
open http://localhost:9001
```

Log in with `minioadmin` / `minioadmin`, go to **Buckets → Create Bucket**, and create a bucket named `omb-photos`.

Alternatively, create it with the MinIO CLI:

```bash
# Install mc (MinIO client) if needed: brew install minio/stable/mc
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb local/omb-photos
```

---

## 6. Run the Collector

From the repo root:

```bash
pnpm --filter @omb/collector dev
```

Or run everything together (backend, frontend, collector):

```bash
pnpm dev
```

On first run you should see:

```
INFO  collector: Starting collector { collector: 'telegram' }
```

Send a photo to the Telegram group — the collector logs a confirmation:

```
INFO  telegram: Beer log forwarded { sourceGroupId: 'tg:-100...', senderId: 'tg:...', key: 'photos/...' }
```

Check the backend feed to confirm the entry was recorded:

```bash
curl http://localhost:3000/v1/global/feed | jq .
```

---

## Troubleshooting

| Symptom                               | Likely cause                           | Fix                                                                                    |
| ------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------- |
| No logs when photo is sent            | Privacy mode still on                  | `/mybots` → Bot Settings → Group Privacy → Turn off, then remove and re-add the bot    |
| `TELEGRAM_BOT_TOKEN` error on startup | Token not set or empty                 | Check `.env.local`                                                                     |
| `S3 unavailable` error                | MinIO not running                      | `pnpm infra:up`                                                                        |
| `Backend returned 4xx`                | Backend not running or schema mismatch | Start backend with `pnpm --filter @omb/backend dev`                                    |
| Bot receives messages but photos fail | File too large (>20 MB)                | WhatsApp-compressed photos are always well below this limit; unlikely with beer photos |
