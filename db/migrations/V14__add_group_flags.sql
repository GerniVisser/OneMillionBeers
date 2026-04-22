ALTER TABLE groups
  ADD COLUMN hidden   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN disabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN favorite BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_groups_hidden   ON groups (hidden)   WHERE hidden   = TRUE;
CREATE INDEX idx_groups_disabled ON groups (disabled) WHERE disabled = TRUE;
CREATE INDEX idx_groups_favorite ON groups (favorite) WHERE favorite = TRUE;
