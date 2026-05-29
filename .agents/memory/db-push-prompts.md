---
name: db:push interactive prompts
description: Why `npm run db:push` hangs in this repo and how to apply schema changes anyway.
---

`npm run db:push` (drizzle-kit) prompts interactively to confirm adding several
pre-existing unique constraints that are in `shared/schema.ts` but missing from the
live DB (e.g. `classes_join_code_unique`, `exams_access_code_unique`). These prompts
use a raw-TTY arrow-key menu.

**Why it matters:** The agent sandbox terminates any command it detects as "waiting on
user input", and piping newlines / Python `pty` enter-keys both get killed before all
prompts are answered. So a clean non-interactive `db:push` is not currently possible
here until that constraint drift is resolved.

**Symptom of the resulting drift:** because pushes silently never apply, the live DB
ends up missing columns the drizzle schema declares. Any `db.select()`/`insert().returning()`
on that table then throws, surfacing as blanket 500s (e.g. "Failed to fetch exams",
"Failed to create exam"). Diagnose by diffing `information_schema.columns` against the
`pgTable` definition. Real cases hit: `exams.mode`, `submissions.quickvox_insight`,
`submissions.quickvox_follow_up`.

**How to apply schema changes:** For additive, nullable column changes, run the exact
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` statements directly (via `executeSql`
in code_execution) matching the drizzle column names/types, then verify against
`information_schema.columns`. drizzle `real`→`real`, `timestamp`→`timestamp without
time zone`, `integer`→`integer`, `boolean`→`boolean`, `jsonb`→`jsonb`.
