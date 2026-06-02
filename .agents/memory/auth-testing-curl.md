---
name: Auth testing via curl is blocked by secure cookies
description: Why curl can't authenticate against protected API routes locally, and how to test server logic instead.
---

The session cookie is configured `secure: true`, so it is only sent over HTTPS. curl against `http://localhost:5000` never stores or returns the session cookie, so every protected route returns 401 even after a successful `/api/demo-login`.

**Why:** This is an environment/test-harness limitation, not a code bug. Browser testing through the Replit HTTPS preview works fine.

**How to apply:** To functionally verify protected backend logic without the auth barrier, call the exported server functions directly with a one-off script: `npx tsx /tmp/test.ts` importing from `/home/runner/workspace/server/storage` (absolute path — relative `./server/...` fails from /tmp). Use `null` for the customApiKey arg to fall back to the default OpenAI integration key. Confirm route protection separately via an unauthenticated curl expecting 401.
