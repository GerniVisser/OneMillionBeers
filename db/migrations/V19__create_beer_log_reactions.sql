-- One row per person per photo: WhatsApp allows a single reaction each, and a
-- new one replaces the old.
CREATE TABLE beer_log_reactions (
  beer_log_id UUID        NOT NULL REFERENCES beer_logs(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id),
  -- NULL once removed. The row stays so a late redelivery of the older
  -- reaction cannot bring it back.
  emoji       TEXT,
  reacted_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (beer_log_id, user_id)
);

CREATE INDEX idx_beer_log_reactions_user_id ON beer_log_reactions (user_id);
