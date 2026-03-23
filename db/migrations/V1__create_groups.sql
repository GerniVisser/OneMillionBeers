CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE groups (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_group_id TEXT         NOT NULL UNIQUE,
  name              VARCHAR(512) NOT NULL,
  slug              VARCHAR(128) NOT NULL UNIQUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Fast lookup by slug for GET /v1/groups/:slug
CREATE INDEX idx_groups_slug ON groups (slug);

-- Fast upsert lookup on every beer-log ingestion
CREATE INDEX idx_groups_whatsapp_group_id ON groups (whatsapp_group_id);
