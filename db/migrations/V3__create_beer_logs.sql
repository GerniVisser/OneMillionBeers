CREATE TABLE beer_logs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id),
  group_id   UUID        NOT NULL REFERENCES groups(id),
  photo_url  TEXT        NOT NULL,
  logged_at  TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Feed queries: ORDER BY logged_at DESC for both group and global feeds
CREATE INDEX idx_beer_logs_logged_at ON beer_logs (logged_at DESC);

-- Group feed: WHERE group_id = ? ORDER BY logged_at DESC
CREATE INDEX idx_beer_logs_group_id_logged_at ON beer_logs (group_id, logged_at DESC);

-- User feed/stats: WHERE user_id = ? ORDER BY logged_at DESC
CREATE INDEX idx_beer_logs_user_id_logged_at ON beer_logs (user_id, logged_at DESC);
