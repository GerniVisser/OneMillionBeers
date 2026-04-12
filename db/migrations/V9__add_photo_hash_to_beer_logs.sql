-- photo_hash is the SHA-256 hex digest of the raw photo bytes, computed by the collector.
-- The UNIQUE index prevents the same photo from being counted more than once globally,
-- regardless of which group it was posted to.
-- Nullable so existing rows are unaffected; new inserts always provide the hash.
-- PostgreSQL treats NULL != NULL for unique index purposes, so multiple legacy NULL rows coexist.
ALTER TABLE beer_logs ADD COLUMN photo_hash TEXT;

CREATE UNIQUE INDEX idx_beer_logs_photo_hash ON beer_logs (photo_hash);
