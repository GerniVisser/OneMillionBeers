ALTER TABLE beer_logs ADD COLUMN source_message_id TEXT;

CREATE UNIQUE INDEX idx_beer_logs_source_message_id
  ON beer_logs (source_message_id)
  WHERE source_message_id IS NOT NULL;
