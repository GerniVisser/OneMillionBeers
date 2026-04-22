ALTER TABLE groups
  ADD COLUMN joinable     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN invite_code  TEXT;

CREATE INDEX idx_groups_joinable ON groups (joinable) WHERE joinable = TRUE;
