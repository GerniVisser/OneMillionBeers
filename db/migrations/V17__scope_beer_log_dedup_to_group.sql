-- A WhatsApp message id is only unique within its chat.
DROP INDEX idx_beer_logs_source_message_id;

CREATE UNIQUE INDEX idx_beer_logs_group_message
  ON beer_logs (group_id, source_message_id)
  WHERE source_message_id IS NOT NULL;

-- Kept apart from beer_logs because a revoke can arrive before its message and
-- must still refuse it when it lands. Keyed on source ids so recording a revoke
-- never needs a groups row.
CREATE TABLE beer_log_revocations (
  source_group_id   TEXT        NOT NULL,
  source_message_id TEXT        NOT NULL,
  revoked_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_group_id, source_message_id)
);
