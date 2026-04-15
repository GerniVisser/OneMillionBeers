# Pseudo-names

Every user on the platform is automatically assigned a unique, beer-themed pseudo-name (e.g. `MajesticCrispPilsner`, `BoldAle`, `ZuluHoppyStout`). It is shown publicly in feeds and on leaderboards in place of the user's real identity.

---

## How names are assigned

Name assignment is handled entirely by the database. When a new user row is inserted into `users`, the `trg_assign_pseudo_name` trigger fires and:

1. Checks whether the `identity_hash` already has a `pseudo_name` (guards against pool waste on upsert conflicts)
2. If not, calls `claim_pseudo_name()` which atomically `DELETE … RETURNING`s a random row from the `pseudo_name_pool` table
3. Derives the user's `slug` from the name using the same PascalCase → kebab-case transform: `MajesticCrispPilsner` → `majestic-crisp-pilsner`

The claim is a single-statement delete, so two concurrent inserts can never receive the same name regardless of request timing. The application does not generate or validate names — it just inserts the user and reads back whatever the trigger assigned.

---

## Name format

All names are PascalCase with no separators, capped at 20 characters. Three templates are used:

| Template                 | Example                | Source lists                                                  |
| ------------------------ | ---------------------- | ------------------------------------------------------------- |
| `[Adj][BeerNoun]`        | `HoppyStout`           | `adjectives.txt` × `beer-nouns.txt`                           |
| `[Epic][BeerNoun]`       | `LegendaryAle`         | `epic-descriptors.txt` × `beer-nouns.txt`                     |
| `[Epic][Adj][BeerStyle]` | `MajesticCrispPilsner` | `epic-descriptors.txt` × `adjectives.txt` × `beer-styles.txt` |

`beer-styles.txt` is used exclusively in the three-word template so that brewing role words (`Brewer`, `Maltster`, etc.) from `beer-nouns.txt` never appear as the final word in a three-word name.

The current wordlists produce **8,283 unique base names**.

### Wordlists

All wordlists live in `packages/backend/src/lib/pseudo-name/`:

| File                   | Contents                                                                          |
| ---------------------- | --------------------------------------------------------------------------------- |
| `adjectives.txt`       | 27 beer-flavour adjectives (Hoppy, Crisp, Bold, …)                                |
| `epic-descriptors.txt` | 18 grand-sounding words (Majestic, Imperial, Legendary, …)                        |
| `beer-nouns.txt`       | 23 beer styles + brewing roles (Stout, Ale, Brewer, Taproom, …)                   |
| `beer-styles.txt`      | 16 styles only — subset of `beer-nouns.txt`                                       |
| `name-pool.txt`        | Pre-generated exhaustive list of all valid base names (committed, auto-generated) |
| `geo-words.json`       | Per-country flavour words — **not currently used at assignment time** (see below) |

---

## Geo words (reserved for future use)

`geo-words.json` maps ISO country codes to arrays of place/culture words (e.g. `ZA → ["Cape", "Karoo", "Springbok", …]`). The original design prepended a geo word to the base name 40 % of the time to add geographic flavour (`ZuluHoppyStout`). This logic has been removed from the current application path — name assignment is now fully handled by the DB trigger which does not apply geo prefixes. The file is kept because the feature may be re-introduced at the DB level.

---

## The pool table

`pseudo_name_pool` is a plain table with a single `TEXT PRIMARY KEY` column. Each name exists once. When a user is created, one row is deleted and the name is theirs permanently. There is no way for a name to be reused — it is gone from the pool the moment it is claimed.

Two DB functions manage the pool:

### `claim_pseudo_name() → TEXT`

Called by the trigger. Deletes and returns a random row. Returns `NULL` when the pool is empty, which causes the trigger to raise an exception.

### `load_pseudo_name_pool(names TEXT[]) → INTEGER`

Used by migrations to add new names. Idempotent: skips names already present in the pool or already assigned to a user. Returns the number of rows actually inserted.

---

## Adding new names

### Option 1 — Expand the wordlists

Edit one or more of the four wordlist files in `packages/backend/src/lib/pseudo-name/`, then run:

```bash
pnpm --filter @omb/backend generate:names
```

This script (`scripts/generate-name-pool.ts`):

1. Reads all four wordlist files
2. Generates every valid combination for the three name templates, filtered to ≤ 20 characters, deduplicated, and sorted alphabetically
3. Writes the full list to `name-pool.txt`
4. Auto-detects the next Flyway migration version by scanning `db/migrations/`, then writes `V{n}__load_pseudo_name_pool.sql` — a ready-to-commit migration that calls `load_pseudo_name_pool()` with the full current list

Commit both `name-pool.txt` and the generated migration file. The next deployment runs the migration automatically, loading any new names into the pool.

> **Only commit the generated migration when the wordlists actually changed.** Running `generate:names` without editing the wordlists produces a migration that would call `load_pseudo_name_pool()` with names already in the pool — it would be a no-op but creates unnecessary migration noise. Delete the generated file if you ran the script by accident.

### Option 2 — Write a migration by hand

If you want to add a specific set of names without touching the wordlists, create a new migration directly:

```sql
-- db/migrations/V12__load_pseudo_name_pool.sql
SELECT load_pseudo_name_pool(ARRAY[
  'SpecialEditionAle',
  'GoldenCentennial'
]);
```

`load_pseudo_name_pool()` is safe to call with names that are already in the pool — duplicates are silently skipped.

---

## What happens when the pool runs out

The trigger raises an exception and the insert fails with:

```
pseudo_name_pool is exhausted — add a new migration that calls load_pseudo_name_pool()
```

At 8,283 names the pool supports a large number of users before this becomes a concern. When it does, expand the wordlists and follow Option 1 above.

---

## Backfill (V11 migration)

`V11__backfill_pseudo_names.sql` assigns names to any users that were created before V10's trigger existed. It uses a CTE to ensure `claim_pseudo_name()` is called exactly once per user row:

```sql
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
```

The `pseudo_name` column remains nullable — the backfill migration fills existing rows but does not enforce `NOT NULL`.
