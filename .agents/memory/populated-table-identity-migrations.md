---
name: Populated-table identity migrations
description: Safe development schema changes when adding generated identifiers to already populated PostgreSQL tables.
---

When a populated PostgreSQL table needs a new generated identifier for a foreign-key relationship, add the identity column and its unique index before running Drizzle push; then let Drizzle apply the dependent foreign key and other schema changes.

**Why:** Drizzle can stop on a non-interactive data-loss prompt for a new not-null identity column, and PostgreSQL rejects a foreign key until the referenced identity is unique. Pre-filling the additive column preserves existing rows and keeps the migration deterministic.

**How to apply:** Use a development-only additive DDL step, verify existing rows received identifiers, create the unique index if needed, then run the normal schema push and typechecks. Do not use this as a production migration shortcut.