---
name: Submission gradingGap baseline
description: How the professor-decision gradingGap is computed despite immediate per-question score persistence
---

# gradingGap baseline for professor decisions

The professor decision workflow (`/api/submissions/:id/decision`) computes
`gradingGap = round((aiTotal - professorTotal) * 100)` for adjusted/overridden
decisions (0 for accepted).

**The trap:** per-question score edits in the dashboard persist *immediately*
via `PATCH /api/submissions/:id/score`, which overwrites `submission.totalScore`.
So by the time the decision is saved, the submission's `totalScore` is already
the professor-adjusted value — reading "AI total" from it yields a gap of ~0.

**Fix / convention:** the client captures the AI baseline (`sub.totalScore` at
the moment the submission is expanded) and sends it as `aiTotalScore`. The server
validates it is 0–1 and uses it as the AI total; otherwise falls back to current
`submission.totalScore`. The professor total is read after applying any
`adjustedScores`.

**Why:** there is no stored column holding the original AI total separate from
the editable `totalScore`, so the baseline must be captured before edits.
**How to apply:** any future change to the decision flow must keep capturing the
AI baseline before per-question edits mutate `totalScore`, or gradingGap (and the
`arabicFlag` derived from it) will be wrong.

`arabicFlag` = `languageUsed` is `arabic`/`mixed` AND `gradingGap > 6` (signed,
not absolute).
