import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export function openDb(path: string): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;

    -- Every webhook delivery, verbatim. A WAHA retry shows up as a repeated event_id.
    CREATE TABLE IF NOT EXISTS events (
      id          INTEGER PRIMARY KEY,
      received_at INTEGER NOT NULL,
      session     TEXT NOT NULL,
      event       TEXT,
      event_id    TEXT,
      hmac_ok     INTEGER,
      failed      INTEGER NOT NULL DEFAULT 0,  -- recorder answered 500 on purpose
      body        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_session ON events (session, received_at);
    CREATE INDEX IF NOT EXISTS events_event_id ON events (event_id);

    -- One row per (session, chat, sender message id): what each number saw.
    CREATE TABLE IF NOT EXISTS messages (
      session         TEXT NOT NULL,
      chat_id         TEXT NOT NULL,
      key_id          TEXT NOT NULL,
      msg_id          TEXT,
      from_me         INTEGER,
      participant     TEXT,
      participant_alt TEXT,
      sender          TEXT,       -- resolved exactly as production webhook.ts does
      push_name       TEXT,
      wa_ts           INTEGER,    -- WhatsApp timestamp (s)
      received_at     INTEGER NOT NULL,
      deliveries      INTEGER NOT NULL DEFAULT 1,
      has_media       INTEGER,
      mimetype        TEXT,
      media_sha256    TEXT,
      media_bytes     INTEGER,
      media_error     TEXT,
      download_ms     INTEGER,
      PRIMARY KEY (session, chat_id, key_id)
    );
    CREATE INDEX IF NOT EXISTS messages_key ON messages (chat_id, key_id);
    CREATE INDEX IF NOT EXISTS messages_received ON messages (received_at);

    CREATE TABLE IF NOT EXISTS revokes (
      session     TEXT NOT NULL,
      chat_id     TEXT,
      key_id      TEXT,
      received_at INTEGER NOT NULL
    );

    -- Session status transitions, from both session.status webhooks and polling.
    CREATE TABLE IF NOT EXISTS status_changes (
      session TEXT NOT NULL,
      status  TEXT NOT NULL,
      source  TEXT NOT NULL,
      me      TEXT,
      at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS status_changes_session ON status_changes (session, at);

    -- Reactions, one row per reaction event per session. An empty emoji removes
    -- the reactor's reaction; the latest row per (target, reactor) is the state.
    CREATE TABLE IF NOT EXISTS reactions (
      session     TEXT NOT NULL,
      chat_id     TEXT NOT NULL,
      target_key  TEXT,       -- key id of the message reacted to
      reactor     TEXT,       -- resolved like a message sender
      from_me     INTEGER,
      emoji       TEXT,
      wa_ts       INTEGER,
      received_at INTEGER NOT NULL,
      raw_target  TEXT
    );
    CREATE INDEX IF NOT EXISTS reactions_target ON reactions (chat_id, target_key);

    -- The bot's groups (those the primary session is in) and which lab sessions are members.
    CREATE TABLE IF NOT EXISTS groups (
      chat_id    TEXT PRIMARY KEY,
      subject    TEXT,
      sessions   TEXT,
      updated_at INTEGER
    );
  `)
  const cols = db.prepare(`PRAGMA table_info(groups)`).all() as { name: string }[]
  if (!cols.some((c) => c.name === 'sessions'))
    db.exec(`ALTER TABLE groups ADD COLUMN sessions TEXT`)
  return db
}
