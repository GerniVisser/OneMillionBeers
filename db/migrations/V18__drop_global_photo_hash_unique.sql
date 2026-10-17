-- Dedup is on (group_id, source_message_id) since V17. Ship only once the backend
-- no longer uses ON CONFLICT (photo_hash), which fails without this index.
DROP INDEX idx_beer_logs_photo_hash;
