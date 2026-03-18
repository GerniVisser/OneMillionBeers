CREATE TABLE users (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash   CHAR(64)     NOT NULL UNIQUE,
  display_name VARCHAR(256),
  slug         VARCHAR(128) NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Fast lookup by slug for GET /v1/users/:slug
CREATE INDEX idx_users_slug ON users (slug);

-- Fast upsert lookup on every beer-log ingestion
CREATE INDEX idx_users_phone_hash ON users (phone_hash);
