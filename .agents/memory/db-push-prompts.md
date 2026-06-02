---
name: db:push interactive prompts (resolved)
description: Why `npm run db:push` used to hang in this repo and how the constraint name drift was fixed.
---

**Resolved.** `npm run db:push -- --force` now runs fully non-interactively
("No changes detected"), and `scripts/post-merge.sh` applies schema changes
automatically after merges.

**Root cause:** The hang was NOT missing constraints — it was a constraint *name*
mismatch. The unique constraints already existed in the live DB under Postgres's
auto-generated names (`classes_join_code_key`, `exams_access_code_key`), but the
drizzle schema's `.unique()` makes drizzle-kit expect its own convention
(`classes_join_code_unique`, `exams_access_code_unique`). The name difference made
drizzle-kit push treat it as a rename/recreate and show a raw-TTY arrow-key prompt
that `--force` does not answer, so post-merge (stdin closed) aborted and additive
column changes silently never applied. The "duplicate" code values were all NULLs
(valid under a unique constraint) — no real data conflict.

**Fix (permanent):** Renamed the live DB constraints to match drizzle-kit's
convention via metadata-only `ALTER TABLE ... RENAME CONSTRAINT` (no data touched,
no drop/recreate). After that, push reports no diff and exits cleanly. Verify names
against `pg_constraint`. This survives future merges because the drift is resolved
in the DB itself, not worked around per-merge.

**If a similar prompt reappears:** diff drizzle's expected constraint name against
the actual `pg_constraint.conname` for that column and `RENAME CONSTRAINT` to align,
rather than dropping/recreating or piping fake input into the prompt.
