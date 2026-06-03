# VoxExam Testing Checklist

## Before every PR
Run all available checks. If a command fails, fix it before opening the PR.

```bash
npm run check        # TypeScript check — preferred
npm run lint         # Linting
npm test -- --run    # Full test suite
npm run build        # Build verification
```

Never fix a failing test by deleting it, weakening assertions, or skipping suites.
Fix the implementation or report the blocker.

## Never run automatically
```bash
npm run db:push          # FORBIDDEN — never automatic
npx drizzle-kit push     # FORBIDDEN — never automatic
```

## For schema changes
1. Update `shared/schema.ts`
2. Run `npm run db:generate` — creates migration files for review
3. Document in PR: what changed, why, rollback plan
4. Never apply to production automatically

## For AI grading changes
- Confirm `evaluateWithAI` model is still `gpt-4o-mini`
- Confirm VoxPractice model is still `gpt-4o`
- Run: `npm test -- --run ai` if the test suite has AI-specific tests
- Confirm bilingual clause is present in all VoxPractice and VoxClasses prompts

## For voice storage changes
- Confirm no audio is written to local filesystem
- Confirm Azure Blob Storage SAS URL pattern is intact
- Confirm HTTPS-only access

## For authentication changes
- Confirm professor role check is intact on all protected routes
- Confirm student routes cannot access professor data
- Confirm Microsoft SSO migration does not break existing session handling

## Risk levels for PR review
| Change type | Risk level | Extra steps |
|---|---|---|
| UI text or styling only | Low | Standard checks |
| New UI component | Low-Medium | Verify no professor/student data leaks |
| New API route | Medium | Verify auth check, role check |
| AI prompt change | Medium-High | Run AI tests, verify model routing |
| Schema change | High | Migration plan, rollback plan |
| Auth change | High | Full auth flow test |
| Storage change | High | Verify no local filesystem writes |
| Graded exam path | Highest | Stop and get explicit approval |
