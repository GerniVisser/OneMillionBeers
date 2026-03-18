-- Rename platform-specific column names to collector-agnostic equivalents.
-- groups.whatsapp_group_id → source_group_id
-- users.phone_hash → identity_hash

ALTER TABLE groups RENAME COLUMN whatsapp_group_id TO source_group_id;
DROP INDEX IF EXISTS idx_groups_whatsapp_group_id;
CREATE INDEX idx_groups_source_group_id ON groups (source_group_id);

ALTER TABLE users RENAME COLUMN phone_hash TO identity_hash;
DROP INDEX IF EXISTS idx_users_phone_hash;
CREATE INDEX idx_users_identity_hash ON users (identity_hash);
