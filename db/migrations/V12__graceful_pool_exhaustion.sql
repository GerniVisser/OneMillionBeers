-- Update assign_pseudo_name() to allow users to join even when the pool is
-- exhausted.  Previously the trigger raised an exception; now it leaves
-- pseudo_name NULL and falls back to the first 16 chars of identity_hash
-- as the slug.  Replenish names via load_pseudo_name_pool().

CREATE OR REPLACE FUNCTION assign_pseudo_name()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  existing_name TEXT;
BEGIN
  -- For ON CONFLICT DO UPDATE upserts: mirror the existing pseudo_name onto the
  -- inserted row so the pool entry is not wasted when there is a conflict.
  SELECT pseudo_name INTO existing_name
  FROM users WHERE identity_hash = NEW.identity_hash;

  IF existing_name IS NOT NULL THEN
    NEW.pseudo_name := existing_name;
  ELSIF NEW.pseudo_name IS NULL THEN
    -- Pool may be exhausted; NULL is acceptable — the user joins without a name.
    -- Replenish via a new migration that calls load_pseudo_name_pool().
    NEW.pseudo_name := claim_pseudo_name();
  END IF;

  -- Derive the user slug from the pseudo_name when not supplied.
  -- Falls back to the first 16 chars of identity_hash when the pool is exhausted.
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    IF NEW.pseudo_name IS NOT NULL THEN
      NEW.slug := lower(regexp_replace(NEW.pseudo_name, '([a-z])([A-Z])', '\1-\2', 'g'));
    ELSE
      NEW.slug := left(NEW.identity_hash, 16);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
