-- Read-only role for ad-hoc analytics queries against production.
--
-- Deliberately created WITHOUT a password. Under RDS's scram-sha-256 auth a
-- role with no password cannot authenticate, so this migration is inert until
-- an operator sets one out-of-band (see doc/DEVELOPMENT.md → Analytics access).
-- That keeps the credential out of git while still versioning the grants.
--
-- Guarded with a DO block because roles are cluster-wide, not database-scoped:
-- the role may already exist if it was created by hand before this ran.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analytics') THEN
    CREATE ROLE analytics LOGIN;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE omb TO analytics;
GRANT USAGE ON SCHEMA public TO analytics;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics;

-- Applies to tables created by future migrations. Only affects objects created
-- by the role running this statement (omb), which is the role Flyway uses.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO analytics;

-- Belt and braces: the grants above already prevent writes, but this makes any
-- accidental INSERT/UPDATE/DELETE fail on the transaction rather than the
-- permission check, including against tables added before the grant is refreshed.
ALTER ROLE analytics SET default_transaction_read_only = on;

-- Production is a db.t4g.micro shared with the live site. An unbounded
-- analytical scan is a self-inflicted outage; cap it.
ALTER ROLE analytics SET statement_timeout = '60s';
ALTER ROLE analytics SET idle_in_transaction_session_timeout = '60s';
