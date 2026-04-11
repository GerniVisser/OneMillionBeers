ALTER TABLE users
  ADD COLUMN phone_number TEXT,
  ADD COLUMN push_name    TEXT,
  ADD COLUMN active       BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN public       BOOLEAN NOT NULL DEFAULT TRUE;

-- Partial unique index: enforces uniqueness on non-NULL values only,
-- so existing rows with NULL phone_number do not conflict with each other.
CREATE UNIQUE INDEX idx_users_phone_number
  ON users (phone_number)
  WHERE phone_number IS NOT NULL;
