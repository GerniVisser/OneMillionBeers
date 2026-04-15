-- Backfill pseudo_name (and slug) for any users that existed before V10's
-- trigger was in place.  Each NULL row atomically claims exactly one name from
-- the pool via claim_pseudo_name().  The CTE ensures the function is called
-- once per row, not once per column.

WITH claimed AS (
  SELECT id, claim_pseudo_name() AS pseudo_name
  FROM users
  WHERE pseudo_name IS NULL
)
UPDATE users
SET
  pseudo_name = claimed.pseudo_name,
  slug        = lower(regexp_replace(claimed.pseudo_name, '([a-z])([A-Z])', '\1-\2', 'g'))
FROM claimed
WHERE users.id = claimed.id;
