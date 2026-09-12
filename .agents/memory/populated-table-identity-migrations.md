---
name: Populated-table identity migrations
description: Safe development schema changes when adding generated identifiers to already populated PostgreSQL tables.
---

When a populated PostgreSQL table needs a new generated identifier for a foreign-key relationship, add the identity column and its unique index before running Drizzle push; then let Drizzle apply the dependent foreign key and other schema changes.

**Why:** Drizzle can stop on a non-interactive data-loss prompt for a new not-null identity column, and PostgreSQL rejects a foreign key until the referenced identity is unique. Pre-filling the additive column preserves existing rows and keeps the migration deterministic.

**How to apply:** Use a development-only additive DDL step, verify existing rows received identifiers, create the unique index if needed, then run the normal schema push and typechecks. Do not use this as a production migration shortcut.

When a referenced identity column's unique index is renamed, PostgreSQL can retain the old index as the foreign key's backing relation while the new index also exists. Detach and recreate the development-only foreign key on the canonical index before removing the stale index; otherwise Publish can generate a duplicate `CREATE UNIQUE INDEX`. Drizzle Kit may still try to recreate this referenced standalone unique index during local `push`, so use the Publish schema diff as the authority for publish validation and never change production directly.

**Why:** A foreign key dependency prevents a normal schema push from removing the old index, and the local introspector can fail to recognize the canonical standalone unique index even when PostgreSQL reports it as valid.

**How to apply:** Inspect `pg_constraint.conindid` and `pg_index` before changing anything. With explicit approval, drop/recreate only the development foreign key and remove the redundant index; confirm `explainSchemaDiff()` has no statements before asking the user to retry Publish.