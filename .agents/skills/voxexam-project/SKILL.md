---
name: voxexam-project
description: Use for all Codex tasks inside the VoxExam repository. Covers React TypeScript frontend, Node.js Express backend, PostgreSQL Drizzle schema, OpenAI grading and transcription, Azure Blob voice storage, Microsoft SSO, VoxPractice, VoxClasses, VoxExam official grading, VoxLive, professor review flows, student oral exam flows, proctoring, deployment, and security review. Enforces VoxExam project safety rules, reads AGENTS.md and product documents before editing, plans before acting, and runs repo-specific checks. Do not use for unrelated repositories.
---

# VoxExam Project Skill

## What is VoxExam
VoxExam is an AI-supported oral examination platform for UAE universities. It has four products:
- **VoxPractice** — student self-study, private, no professor visibility, no proctoring
- **VoxClasses** — professor-assigned practice, AI scores automatically, no proctoring, no transcript impact
- **VoxExam** — official oral examination, full proctoring, professor approves every grade
- **VoxLive** — no-login QR-based public demo sessions, nothing built yet

## First actions before any edit
1. Confirm the current working directory is the VoxExam repository root.
2. Read `AGENTS.md` from the repository root. AGENTS.md overrides this Skill on any conflict.
3. Read `.agents/skills/voxexam-project/references/critical-rules.md` for protected area rules.
4. Read `.agents/skills/voxexam-project/references/repo-map.md` to locate relevant files.
5. When the task touches product behavior, AI grading, or assessment logic, also read `VoxExam_New_Chat_Briefing.md` from the repo root if present.
6. Summarize the planned change before editing any file.
7. Identify whether the task touches any protected area — list in the summary.

## Protected areas — stop and explain risk before editing
- `evaluateWithAI` function in `server/storage.ts` — graded exam AI scoring
- OpenAI model selection constants — `gpt-4o-mini` on graded exam path, `gpt-4o` on VoxPractice/VoxClasses path
- Professor approval workflow — anything that lets a score reach an official transcript
- Authentication and authorization — Replit OIDC, Microsoft SSO, session handling, role checks
- `shared/schema.ts` — Drizzle schema, any table or column changes
- Voice recording upload, storage, or deletion logic
- Azure Blob Storage configuration
- Deployment commands or CI/CD configuration
- Any logging that touches student voice, transcripts, grades, or auth tokens

## Non-negotiable rules
- Never modify `evaluateWithAI` on the graded exam path during VoxPractice or VoxClasses work unless the user explicitly asks.
- Never change `gpt-4o-mini` on the graded exam path without explicit user approval.
- Always use `gpt-4o` for VoxPractice and VoxClasses — never swap.
- Never store voice recordings on the app server filesystem — always Azure Blob Storage UAE North.
- Never hardcode API keys, secrets, database URLs, Azure credentials, or tokens.
- Never run `npm run db:push` automatically — always require explicit user approval.
- Professor approval must remain required before any score affects an official transcript.
- No proctoring anywhere in VoxPractice or VoxClasses under any circumstances.
- Private VoxPractice session data must never appear in any professor or director view.

## Workflow for every coding task
1. Read relevant files before editing.
2. Write a short implementation plan — files to change, risk level, protected areas touched.
3. Wait for confirmation if the task touches a protected area.
4. Make the smallest safe change that achieves the goal.
5. Preserve existing behavior unless the task explicitly requires changing it.
6. Run checks in this order:
   - `npm run check` (preferred TypeScript check)
   - `npm run lint` if available
   - `npm test -- --run` if available
   - `npm run build` for frontend or full-stack changes
7. Do not run `npm run db:push` — ever.
8. Report using the required output format below.

## Preflight script
Before any task touching auth, storage, grading, database schema, deployment, or security, run:
```bash
bash .agents/skills/voxexam-project/scripts/voxexam-preflight.sh .
```

## Required output format
End every task with this exact structure:

```
## Task complete

**Changed files:**
- [list each file changed]

**Checks run:**
- [list each check run and result]

**Checks not run:**
- [list any skipped checks and why]

**Risk notes:**
- [any risks introduced or remaining]

**Manual approval needed:**
- [anything the user must do manually — especially db:push, deployments, secrets]
```
