# AGENTS.md — VoxExam

VoxExam is a production full-stack web application for UAE university oral examinations.
It handles sensitive student voice recordings, AI-generated academic grades, professor
decisions, and university assessment records. Treat all of this as confidential educational
data at all times.

Stack: React + TypeScript (frontend), Node.js + TypeScript (backend), PostgreSQL via
Drizzle ORM, OpenAI APIs (gpt-4o, gpt-4o-mini, Whisper/gpt-4o-transcribe).

Repository: github.com/AliAlahbabi/VoxExam

---

## NON-NEGOTIABLE SAFETY RULES

These rules override everything else. Read them first. Follow them always.

1. **Never modify evaluateWithAI on the graded exam path** when working on VoxPractice,
   VoxClasses, or VoxLive tasks. This function is protected. If a task appears to require
   changes here, stop and ask for explicit human approval.

2. **Never swap OpenAI model routing:**
   - VoxPractice / VoxClasses use `gpt-4o`
   - Official graded exam path keeps `gpt-4o-mini`
   - Do not optimize, consolidate, or rename this routing without explicit approval.

3. **Never store voice recordings on the application server filesystem.**
   Voice recordings must be stored in Azure Blob Storage UAE North only.
   Do not add local uploads/ folders, temp audio directories, or server-disk audio paths.

4. **Never run `npm run db:push`, `drizzle-kit push`, or any production migration command
   automatically.** Database schema changes must be deliberate and manually approved.
   Use `npm run db:generate` to create migration files for review.

5. **Never hardcode API keys, database URLs, Azure credentials, OpenAI keys, JWT secrets,
   session secrets, or any credentials.** Use environment variables only.

6. **Never allow an AI-generated score to affect an official transcript or assessment record**
   unless a professor has explicitly reviewed and approved it. The professor approval gate
   is a hard architectural rule — never bypass or weaken it.

7. **Never weaken, skip, delete, or bypass tests that protect these rules.**

---

## STOP AND ASK ZONES

Stop immediately and ask for human approval before making any change to:

- Official graded exam scoring logic
- `evaluateWithAI` or any nearby graded-exam AI code
- OpenAI model constants or prompt routing
- Transcript or final-grade publishing logic
- Professor approval workflow
- Authentication, authorization, Microsoft SSO, sessions, or role-based access
- Drizzle schema, migrations, production database access, or seed scripts
- Voice recording upload, storage, retention, deletion, or signed URL logic
- Logging, analytics, or exports involving student data
- Any new infrastructure, third-party services, or deployment behavior

When in doubt, stop and ask. Do not make assumptions about production-sensitive areas.

---

## PRODUCT BOUNDARIES

VoxExam has four products. Keep changes strictly within the product area requested.
Do not refactor shared code as a side effect unless explicitly asked.

| Product | Purpose | Proctoring | Transcript Impact |
|---|---|---|---|
| VoxPractice | Student self-study, private | None | Never |
| VoxClasses | Professor-assigned practice | None | Never |
| VoxExam | Official oral examination | Full | Yes — professor approves |
| VoxLive | Public demo sessions, no login | None | Never |

---

## REPOSITORY MAP

```
client/                  React + TypeScript frontend
  src/
    pages/               Route-level page components
    components/          Reusable UI components
    hooks/               Custom React hooks

server/                  Node.js + TypeScript backend
  routes/                Express route handlers
  storage.ts             Core database operations and AI evaluation functions
  replit_integrations/   Replit-specific integrations (auth, chat, image)
    auth/                Replit OIDC professor authentication
    chat/routes.ts       Conversational question builder — uses gpt-4o

shared/
  schema.ts              Drizzle ORM schema — single source of truth for all DB tables

scripts/
  post-merge.sh          WARNING: this script runs db:push automatically — this violates
                         the db:push safety rule and must be deleted or disabled.

AGENTS.md                This file
```

**Protected files — require explicit approval to modify:**
- `server/storage.ts` → `evaluateWithAI` function
- `shared/schema.ts` → any schema changes require db:generate + manual review
- Any file touching OpenAI model selection constants

---

## SETUP

```bash
# Install dependencies
npm ci --include=dev

# Copy environment variables
cp .env.example .env
# Fill in values — never commit real secrets

# Start development server
npm run dev
```

**Required environment variables:**
```
DATABASE_URL=
OPENAI_API_KEY=
SESSION_SECRET=
AZURE_STORAGE_ACCOUNT=
AZURE_STORAGE_CONTAINER_RECORDINGS=
AZURE_STORAGE_SAS_CONFIG=
NODE_ENV=development
```

Never put real production secrets in .env.example, tests, seed files, docs, or committed code.

---

## COMMANDS TO RUN BEFORE EVERY PR

Run all of these. If any fails, fix it before opening the PR. If a command cannot run,
state exactly which command failed and why.

```bash
npm run typecheck
npm run lint
npm test -- --run
npm run build
```

Do not fix failing tests by weakening assertions, deleting tests, skipping suites,
or changing protected business rules. Fix the implementation or report the blocker.

---

## DATABASE RULES

```bash
# ALLOWED — create migration files for review
npm run db:generate

# ALLOWED — apply reviewed migrations to local or staging database only
npm run db:migrate

# FORBIDDEN — never run automatically in deployment, CI, or PR validation
npm run db:push
npx drizzle-kit push
npx drizzle-kit push --force
```

For any schema change:
1. Update the Drizzle schema in shared/schema.ts
2. Run `npm run db:generate` to create migration files
3. Explain the migration in the PR — what changed and why
4. Include rollback notes for any destructive change
5. Never apply to production automatically

---

## AI AND MODEL RULES

```
VoxPractice / VoxClasses → gpt-4o (coaching quality matters)
Official graded exam path → gpt-4o-mini (evaluateWithAI function)
Audio transcription → gpt-4o-transcribe or Whisper
```

- Never swap these model assignments without explicit human approval
- Never log raw student transcripts, model prompts containing student answers, or grades
- Bilingual clause must be present in every VoxPractice and VoxClasses prompt
- After any AI-related change, run: `npm test -- --run ai`

---

## STORAGE RULES

- Voice recordings → Azure Blob Storage UAE North only
- Non-sensitive files (rubrics, PDFs, assets) → Cloudflare R2
- Never write voice recordings to local filesystem, uploads/ folder, or temp directories
- Never commit sample student recordings or test audio files
- Use pre-signed SAS URLs for upload and download — never direct public URLs
- HTTPS required — HTTP access must be rejected

---

## DATA AND PRIVACY RULES

- Never use real student data in tests, seeds, or development fixtures
- Never log raw student recordings, full transcripts, auth tokens, grades, or professor decisions
- Never connect to production database or production storage without explicit human approval
- Treat all voice recordings as potential biometric data under UAE PDPL — highest privacy tier
- VoxPractice session data is scoped to the student only — professor visibility is architecturally impossible

---

## CODING CONVENTIONS

- TypeScript strict mode — avoid `any` unless justified with a comment
- All new API routes go in server/routes/
- All database operations go through server/storage.ts or direct Drizzle queries
- All schema changes go in shared/schema.ts — never create tables outside the schema file
- API responses use consistent shape: `{ data: ... }` for success, `{ error: ... }` for failure
- Error handling must not expose internal details to clients
- Frontend components use TanStack Query for server state
- Use wouter for routing — not React Router

---

## PR REQUIREMENTS

Every PR must include:

1. **What changed** — specific description of what was modified
2. **Product area affected** — VoxPractice / VoxClasses / VoxExam / VoxLive / Shared infrastructure
3. **Risk level** — Low (UI/text only), Medium (backend/API/logic), High (AI grading, database, auth, storage, official assessment)
4. **Commands run and results** — paste the output of the required checks
5. **Database impact** — no schema change, OR migration generated and explained
6. **AI impact** — no model/prompt change, OR exact AI path changed and tests run
7. **Confirmation** — state explicitly that the non-negotiable safety rules were not violated

---

## CODEX REVIEW GUIDELINES

When reviewing PRs, flag and block:

- Student data exposure in logs, responses, or error messages
- Missing authentication or role checks on protected routes
- Professor approval bypass on any official grade path
- Voice recording stored outside Azure Blob Storage
- Hardcoded secrets or credentials
- Unsafe database migration or automatic db:push
- Model routing changes between practice/class/graded exam paths
- Deletion or weakening of guardrail tests
- Any change to evaluateWithAI from a VoxPractice or VoxClasses PR

---

## ESCALATION RULE

When a task conflicts with any rule in this file, the rule wins.
Stop. Explain the conflict clearly. Ask for approval.
Do not make assumptions. Do not proceed without confirmation.
