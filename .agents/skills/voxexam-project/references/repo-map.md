# VoxExam Repository Map

## Root files
- `AGENTS.md` — mandatory Codex project rules, read before every task
- `VoxExam_New_Chat_Briefing.md` — current product state and priorities
- `replit.md` — project documentation and task history
- `package.json` — npm scripts including `check`, `lint`, `test`, `build`
- `shared/schema.ts` — Drizzle ORM schema, single source of truth for all DB tables

## Frontend — client/
```
client/
  src/
    pages/               Route-level page components
      landing.tsx
      login.tsx
      role-select.tsx
      admin-dashboard.tsx
      professor-dashboard.tsx
      student-dashboard.tsx
      quickvox-link.tsx
      not-found.tsx
    components/          Reusable UI components
      voxpractice-dialog.tsx    VoxPractice full flow (material setup, session, voice loop, report)
      voxscore-breakdown.tsx    VoxScore 7-dimension display — shared between VoxExam and VoxPractice
      take-exam-dialog.tsx      Official VoxExam student exam flow
    hooks/               Custom React hooks
    lib/
      voxscore.ts        VoxScore calculation utilities
    App.tsx              Route definitions
```

## Backend — server/
```
server/
  routes/                Express route handlers
  storage.ts             Core database operations and ALL AI evaluation functions
                         — evaluateWithAI (protected, graded exam only)
                         — generatePracticeQuestion (VoxPractice only)
                         — generatePracticeProbe (VoxPractice only)
                         — generatePracticeMicroFeedback (VoxPractice only)
                         — generatePracticeReadinessReport (VoxPractice only)
  replit_integrations/
    auth/                Replit OIDC professor authentication (will be replaced by Microsoft SSO)
    audio/client.ts      Audio transcription via gpt-4o-mini-transcribe
    chat/routes.ts       Conversational question builder — uses gpt-4o
```

## Shared
```
shared/
  schema.ts              All Drizzle table definitions including:
                         — exams, submissions, classes, students
                         — practiceSessions (VoxPractice, 14 columns)
                         — voxscore_config (planned, not yet built)
```

## AI model routing — never change without approval
| Path | Model | Function |
|---|---|---|
| Official graded exam | `gpt-4o-mini` | `evaluateWithAI` in server/storage.ts |
| VoxPractice | `gpt-4o` | All practice AI functions in server/storage.ts |
| VoxClasses | `gpt-4o` | All class AI functions |
| Transcription | `gpt-4o-mini-transcribe` | `transcribeAudio` via audio/client.ts |
| Question builder chat | `gpt-4o` | chat/routes.ts |

## Current build status
- VoxPractice backend (Task #37) — completed and merged
- VoxPractice UI (Task #38) — completed and merged, bugs under investigation
- VoxScore schema (Task #26) — completed
- Professor decision workflow (Task #29) — completed
- VoxScore UI (Task #33) — completed
- db:push fix (Task #32) — completed
- QuickVox public flow (Phases 1-3) — stable, do not modify

## Known open issues
- VoxPractice: empty/silent audio produces a full VoxScore — fix pending
- VoxPractice: follow-up probe not connected to student answer — fix pending
- VoxPractice: score generated when follow-up is skipped — fix pending
- VoxPractice: fabricated strengths on near-empty answers — fix pending
- Pencil icon inline edit conflicts with professor decision panel — fix pending
- Professor login is Replit OIDC — will break on migration to Render
- Consent flow before voice recording — not yet built, PDPL blocker
- Microsoft SSO — not yet built, critical blocker for university pilots
