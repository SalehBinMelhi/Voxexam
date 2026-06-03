# VoxExam Critical Rules

## AI grading — highest protection
- Never modify `evaluateWithAI` in `server/storage.ts` during VoxPractice, VoxClasses, or VoxLive work.
- Keep `gpt-4o-mini` on the graded exam path at all times unless the user explicitly approves a change.
- Use `gpt-4o` for VoxPractice and VoxClasses — never swap these model assignments.
- Every AI-generated score on the official exam path must remain subject to professor review and approval before reaching the transcript.
- The bilingual clause must be present in every VoxPractice and VoxClasses AI prompt.

## Voice recordings — UAE PDPL compliance
- Never write student voice recordings to the app server filesystem, uploads/ folder, temp directories, or any local path.
- All production voice recordings go to Azure Blob Storage, UAE North region only.
- Use pre-signed SAS URLs for upload and download — never direct public URLs.
- HTTPS required — reject HTTP access.
- No student voice recordings in tests, seeds, or development fixtures.
- Treat all voice recordings as potential biometric data under UAE PDPL — highest privacy tier.

## Database — never automatic
- Never run `npm run db:push`, `drizzle-kit push`, or any variant automatically.
- For schema changes:
  1. Update `shared/schema.ts`
  2. Run `npm run db:generate` to create migration files
  3. Explain what changed, why, and the rollback plan
  4. Wait for explicit user approval before applying to any database
- Never connect to production database without explicit user approval.

## Security
- No hardcoded API keys, OpenAI keys, Azure credentials, JWT secrets, session secrets, or database URLs anywhere in the codebase.
- All secrets go in environment variables only.
- Never log raw student recordings, full transcripts, auth tokens, grades, or professor decisions.
- Error handling must never expose internal implementation details to clients.

## Product boundaries — never cross these
| Product | Proctoring | Transcript impact | Professor visibility |
|---|---|---|---|
| VoxPractice | Never | Never | Never |
| VoxClasses | Never | Never | Class policy only |
| VoxExam | Full | Yes — professor approves | Professor reviews and approves |
| VoxLive | Never | Never | Never |

## Professor approval — hard architectural rule
- Nothing goes on the official student transcript without the professor explicitly accepting, adjusting, or overriding the AI suggestion.
- The professor approval gate must never be bypassed, weakened, or made optional for official exams.
- Override explanations are optional and must never block saving.
