CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_users_pseudo_name_trgm ON users USING gin(pseudo_name gin_trgm_ops);
