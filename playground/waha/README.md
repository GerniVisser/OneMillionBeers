# WAHA multi-session lab

A local test bed for running several WhatsApp numbers on one WAHA instance and
measuring whether they really give us redundancy: does every number see every
group image, do they see it identically, and how do sessions behave when things
break. Nothing here is used by production.

```
playground/waha/
  docker-compose.yml   waha-lab (NOWEB, :3200) + recorder (:3201), project name waha-lab
  recorder/src/        zero-dependency Node 24 service: webhook sink, SQLite log, dashboard
  lab.sh               start/stop, session lifecycle, fault injection, sampling
  data/                gitignored: lab.db, experiments.log, mem.csv, media/ (if kept)
```

It runs alongside `docker-compose.local.yml` (whose WAHA is on :3100) without
touching it.

## Quick start

```sh
cd playground/waha
./lab.sh up                     # dashboard http://localhost:3201
```

The recorder creates the sessions in `LAB_SESSIONS` (default `personal,prod`) with
a webhook per session (`/webhook/<session>`, HMAC signed, 5 retries). Pair each one
by scanning the QR shown on the dashboard from that phone:
**WhatsApp → Settings → Linked devices → Link a device**.

- Linking the **prod number** here adds a second linked device next to the
  production WAHA (WhatsApp allows four). Production is unaffected, and
  `./lab.sh logout prod` only unlinks the lab device.
- The prod number sees real groups. The recorder downloads images only to hash
  them and keeps no files unless `KEEP_MEDIA=true`.
- WAHA's own dashboard and Swagger UI are at http://localhost:3200 (user/pass `lab`/`lab`,
  API key `lab-api-key`).

### Test group

Create a group containing both numbers. A post from one of the paired phones is
recorded as an own post (`fromMe`) by that session and as an incoming message by
the other. That is still enough to compare message ids, image hashes and timing,
but a third member posting gives the cleanest picture. Real groups both numbers
are in are recorded too, which gives passive soak data for free.

## Admin page and the real app (`./lab.sh app up`)

`docker-compose.app.yml` runs the production collector image, which serves the admin page, behind the
gateway's `nginx.dev.conf`, with the backend, Postgres (migrated) and MinIO, all against the
lab's WAHA:

- **Admin page:** http://localhost:3202/admin. Log in as `admin` / `local-admin-password`.
- **Read-only API:** `curl -H 'Authorization: Bearer lab-read-only-token-for-diagnostics-0000' localhost:3202/admin/api/overview`
- **Ingestion:** the collector ingests through its own session, `omb`, so it never changes the
  webhooks of `personal`/`prod`. Link `omb` from the admin page to send real beers into the local
  database; leave it unlinked to only exercise the admin page.
- **Re-linking:** a session in `SCAN_QR_CODE` shows its re-link panel by itself (pairing code by
  default, QR as a tab). **Re-link** on a `FAILED` session logs it out first, discarding
  dead credentials, and WAHA restarts it ready to pair.

## Dashboard

- **Sessions:** current status of each session, paired number, last webhook, QR when unpaired.
  `_waha` is the recorder's own reachability check of the WAHA API.
- **Per-session totals:** for every group message any session saw, whether each
  session that is in that group also saw it. `missed` is the headline number.
  `divergent` counts messages where sessions disagree on the image hash or the resolved sender.
- **Coverage:** the latest group messages, one column per session, with arrival
  delay relative to the first session, redeliveries (`×2`) and image hash prefix.
- **Status timeline:** every status transition, from webhooks and 15 s polling.

JSON is at `/api/summary`, `/api/stats` and `/api/events?session=&limit=`.
Use `./lab.sh db` for ad-hoc SQL (tables `events`, `messages`, `revokes`, `status_changes`, `groups`).

## Experiments

Disruptive `lab.sh` commands are timestamped in `data/experiments.log` so they
can be lined up against the status timeline and the coverage table.

| #   | Experiment                                  | How                                                                                           | Look at                                                                          |
| --- | ------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | Coverage baseline                           | Post ~50 images in the test group over a few days                                             | `missed`, `divergent`; is `key_id` and the image hash identical across sessions? |
| 2   | Memory per session                          | `./lab.sh mem 60` with 0, 1, 2 paired sessions; `WAHA_MEM=1g ./lab.sh up` to find the ceiling | `data/mem.csv`: does it fit production's 640m cap?                               |
| 3   | Session stop/start                          | `./lab.sh stop prod`, post images, `./lab.sh start prod`                                      | Are messages posted while stopped delivered after start?                         |
| 4   | Process crash                               | `./lab.sh kill`                                                                               | Restart, sessions back to WORKING by themselves, messages during the gap         |
| 5   | Internet outage                             | `./lab.sh netcut 300`, post during the cut                                                    | Status during the cut, catch-up after                                            |
| 6   | Hung process                                | `./lab.sh pause 120`                                                                          | Same as 5, but webhooks can't be delivered either                                |
| 7   | Unlinked number (the recycled-SIM incident) | Remove the lab device from the phone's Linked devices                                         | How fast and in which status WAHA reports it                                     |
| 8   | Webhook receiver down                       | `./lab.sh fail-rate 1`, post, `./lab.sh fail-rate 0`                                          | Which events are retried and which are lost for good                             |
| 9   | Edge cases                                  | Revoke an image, edit a caption, post an album, a view-once image, a sticker                  | `revokes` table, `events` for what each looks like                               |
| 10  | Upgrade with sessions paired                | `./lab.sh upgrade <newer tag>`                                                                | Pairing survives, no lost messages                                               |
| 11  | Soak                                        | Leave it running 1–2 weeks                                                                    | `missed` across real groups, timeline, `mem.csv`                                 |

## Labels: shelved

Managing groups through WhatsApp Business labels (`Hidden`/`Disabled`/`Favourite`) was
explored on 2026-10-15 and **dropped on 2026-10-16**: on NOWEB, label changes are silently lost
after any restart until WAHA releases the #2298 fix, and lost changes are never recovered. The
lab no longer subscribes to label events, keeps no NOWEB store and no longer runs the patched
WAHA file. The `labels` rows in the findings below are kept as the record for revisiting.

## Findings

Record results here as they come in.

| Date       | #         | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-15 | —         | WAHA `latest-2026.9.2` reports `tier: CORE` and runs several named sessions in one container. No licence key is needed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-10-15 | 8         | Webhook retries work with `retries: {policy: constant, delaySeconds: 2, attempts: 5}`. Each event was delivered 6 times with the same `event_id` and a valid `X-Webhook-Hmac` (sha512), then dropped. A receiver that is down for longer than ~10 s loses the event.                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-15 | 4         | A SIGKILL of WAHA's node process makes Docker restart the container, and `WHATSAPP_RESTART_ALL_SESSIONS=True` brings every session back without intervention (tested unpaired, so it still needs repeating with paired sessions). A plain `docker kill` counts as a manual stop and is _not_ restarted.                                                                                                                                                                                                                                                                                                                          |
| 2026-10-15 | 1         | First real image (posted from the `personal` phone into OMBeers ❤️): both sessions got it with the same `key.id` and byte-identical media (same SHA-256), ~30 ms apart. Deduplicating on `key.id` or `photo_hash` both work.                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-15 | 1         | **Sender resolution diverges on a number's own posts.** `prod` resolved the sender to the phone number (`participantAlt` present). `personal` saw its own post as `fromMe` with only an `@lid` participant and no `participantAlt`, so production's logic would resolve it to the LID and create a second user. Production skips `fromMe` today (it subscribes to `message`), so no impact yet. Any switch to `message.any` must resolve own posts from the session's `me` instead.                                                                                                                                              |
| 2026-10-15 | —         | The prod number is in 5 groups, but the personal number is only in 3 of them. Redundancy needs every listener number in every bot group, and a group with a single listener should be alerted on. The dashboard's "Bot groups" panel shows this.                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-15 | —         | The recorder now records only the prod number's groups (`LAB_PRIMARY`). Personal numbers are in hundreds of unrelated groups (320 here), plus DMs and status updates, which must not be logged. A production design that adds personal numbers as listeners needs the same allowlist; production currently ingests _every_ group the bot is in.                                                                                                                                                                                                                                                                                  |
| 2026-10-15 | —         | Changing a session's config with `PUT /api/sessions/{name}` restarts it in ~2 s and keeps the pairing, so webhook events and `noweb` options can be changed without re-scanning.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-15 | labels    | Labels need `noweb.store.enabled` (the endpoints return 400 without it). Enabling the store on an already-paired session gives an empty store: WAHA logs "Reconnection with existing sync data, skipping history sync" and `GET /labels` returns `[]`. The initial label snapshot only arrives when the session is (re)paired with the store on.                                                                                                                                                                                                                                                                                 |
| 2026-10-15 | —         | NOWEB's `markOnline` defaults to `true`, which shows the account as online and makes WhatsApp hold back phone notifications. The lab sets it to `false`, and production should too.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-15 | labels    | After re-pairing `prod` with the store on, the whole label snapshot arrived within 3 s of WORKING as `label.upsert` + `label.chat.added` webhooks, and `GET /labels` matches. Labels: `Hidden` (5), `Disabled` (7) and `Favourite` (6), which map one-to-one onto the `groups.hidden/disabled/favorite` flags. There are also system labels `Unread`/`Favorites`/`Groups`, whose names start with an invisible U+200E that must be stripped before matching. Changes made on the phone 40–60 s after pairing arrived as events, and the store poll agreed. Whether changes still arrive later (WAHA #2298) is the next test.     |
| 2026-10-15 | labels    | **WAHA #2298 reproduced.** Two label changes made ~14 min after pairing (Hidden added to OneMillionBeers, Disabled removed from OMBeers) reached WAHA: the log shows `synced regular to v15/v16`. But no webhook fired and the store did not change. They are lost for good, and WAHA's view of those two groups is still stale.                                                                                                                                                                                                                                                                                                 |
| 2026-10-15 | labels    | **The one-line fix from #2298 works.** `docker-compose.patch-2298.yml` overlays `patches/useMultiFileAuthState.js` (`AppStateSyncKeyData.create` → `fromObject`). After recreating WAHA with it (sessions came back without re-pairing), two new changes arrived as `label.chat.added`/`label.chat.deleted` webhooks within ~0.4 s, and the store matched. Unpatched, keys are read from disk after any restart, so every change after a restart would be dropped. That makes this a clean A/B.                                                                                                                                  |
| 2026-10-15 | 1         | **Coverage, ~7.5 h of real traffic (13:31–20:55, laptop asleep 17:15–20:22).** 349 group messages (318 JPEG, 3 WebP stickers, 1 video). 134 were in the 3 shared groups, and both sessions got 132 of them. The other 2 were stickers deleted for everyone within a second, where the revoke reached each session _before_ the message: one session never got the message, the other got it ~13 s later with no media (WAHA `Cannot read properties of null (reading 'url')`). Not a real miss. 0 image-hash mismatches across 120 images both sessions saw. Live arrival gap between sessions: p50 16 ms, p90 80 ms, max 3.9 s. |
| 2026-10-15 | 5/6       | **Laptop sleep (~3 h offline) loses nothing.** On wake, both sessions reconnected in ~16 s and WhatsApp replayed everything posted while offline (prod 225, personal 86 messages from 17:15–20:19, up to 3 h 8 m late). Per-group counts match exactly between sessions. Images from the backlog downloaded fine. `prod` replayed first every time and `personal` ~10 s later. Use the WhatsApp timestamp, not arrival time, for `logged_at`, as production already does. The recorder was frozen too, so the outage itself is not visible in the status timeline.                                                               |
| 2026-10-15 | —         | Unprompted reconnects at 15:10 (personal) and 15:33 (both) recovered by themselves in 2–12 s, with nothing missed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-10-15 | —         | **Stickers are `image/webp`.** Production treats any `image/*` as a beer photo, so stickers are ingested as beers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-10-15 | —         | **Revoke can arrive before the message.** Production would then ingest an already-deleted photo (its delete-by-message-id finds nothing). Remember revoked ids briefly and drop late arrivals.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-15 | reactions | 25 distinct reactions in shared groups, all seen by both sessions. **Reactions carry only the reactor's `@lid`**: there is no `participantAlt` in any of 93 payloads. They cannot be joined to users (keyed by phone) without a LID→phone mapping, e.g. WAHA's `/api/{session}/lids`, which is untested. The target is the message id inside `reaction.messageId` (`{fromMe}_{chat}_{keyId}_{participant}`). No reaction removals seen yet.                                                                                                                                                                                      |
| 2026-10-15 | 2         | Memory: WAHA at 319 MiB with both sessions, `prod` with the full store (~7,000 history messages synced). Fits the 640 MiB cap. The busiest bot group, "1 million beers" (206 messages), has only the prod number, so it has no redundancy.                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-10-16 | admin     | After a laptop reboot, `prod` came back `FAILED`: "Connection Failure … do not reconnect" at login, which is WhatsApp rejecting the stored credentials. `restart` cannot fix that. `logout` discards the credentials, and WAHA restarts the session into `SCAN_QR_CODE` within ~2 s, so the admin page's **Re-link** does `logout` and then shows the pairing code / QR.                                                                                                                                                                                                                                                         |
| 2026-10-16 | admin     | End-to-end through nginx: login lockout after 5 failures (collector) plus nginx's limit (10/min, burst 5), and an existing cookie keeps working while locked out. Cross-origin, form-encoded and Origin-less POSTs get 403/415. The read-only token gets 403 on actions, QR and pairing code. A spoofed `X-Real-IP` is overwritten by nginx. `../` in a session name gets 400. Headless Chromium on desktop and phone: no CSP violations, login/QR/logout work.                                                                                                                                                                  |
