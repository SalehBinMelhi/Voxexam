---
name: VoxScore dimension display
description: How VoxScore weightedScore is defined and how strongest/weakest dimensions must be ranked in UI.
---

Per-dimension `weightedScore` = `(band/5) × dimensionWeight × 100` (see server grading). So it is a *weighted contribution* to the 0–100 total, NOT a normalized performance score. Its max is `dimensionWeight × 100` (e.g. D1 max = 25, D7 max = 5).

**Rule:** when picking "strongest/weakest" or "top/focus" dimensions for any UI, rank by **normalized** score (`weightedScore / maxContribution`, equivalent to `band/5`), not raw `weightedScore`.
**Why:** raw weightedScore conflates weight with performance — D1 (weight 25) almost always outranks D7 (weight 5) regardless of how the student actually did, so raw ranking degenerates to "D1/D2 strongest, D6/D7 focus" every time.
**How to apply:** use `voxNormalizedScore` / `voxStrongest` / `voxWeakest` in `client/src/lib/voxscore.ts`. Show raw `weightedScore` only in the professor contribution column, formatted as `X/maxContribution`.
