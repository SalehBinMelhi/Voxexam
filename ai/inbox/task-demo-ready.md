# Task: Make VoxExam Demo-Ready for Professor Meetings
## Based on UI audit dated June 5 2026

---

## Part 1 — Critical fixes (would embarrass in a professor meeting)

### Fix 1 — Block unapproved AI scores from showing to students on official exams
File: client/src/components/take-exam-dialog.tsx (or the student result dialog component)

The current result screen shows Correctness, Understanding, VoxScore, and AI feedback immediately after submission. For official VoxExam sessions, this violates the product rule — nothing shows until the professor approves.

Change: After an official exam submission, replace the result content with:
"Your response has been submitted. Your professor will review and release your results."
(Arabic: "تم تقديم إجابتك. سيقوم أستاذك بمراجعة نتائجك وإصدارها.")

Do NOT change this for VoxPractice or QuickVox — those must continue showing results immediately.
Distinguish by session/exam type: if `mode === "exam"` or `isOfficialExam === true` (check actual flag name in schema), block the score display.

### Fix 2 — Add Accept/Adjust/Override panel to class exam review
File: client/src/components/exam-details-dialog.tsx

The professor decision panel (Accept/Adjust/Override, reason prompt, holistic score, VoxScore breakdown) exists in the quick exam path (SimpleExamTab) but is missing from ExamDetailsDialog used for class exams.

Add the same professor decision panel to ExamDetailsDialog's submission review section. Reuse the existing decision panel component — do not duplicate logic. The backend endpoint PATCH /api/submissions/:id/decision already exists.

### Fix 3 — Surface grading gap and Arabic flag in professor review
In the professor submission review panel (both quick exam and class exam paths), add two visible indicators:
- Grading gap: show the number (e.g. "AI suggested 72, gap: +8") in a badge near the VoxScore total. If gap > 8 points on English answers or > 6 points on Arabic, highlight in amber.
- Arabic/Mixed flag: if `arabicFlag` is true on the submission, show a small badge labeled "Arabic/Mixed — human review recommended" near the top of the review panel.

Both values exist in the submissions table from Task #29. Read them from the submission object.

### Fix 4 — Remove legacy unused LoginPage
File: client/src/pages/login.tsx

This page uses a different auth context and route (/api/auth/login) that is not used by App.tsx. It is dead UI that could confuse anyone who finds it. Delete the file. Confirm App.tsx does not route to it.

### Fix 5 — Pencil icon conflict with professor decision panel
Find the inline pencil-icon edit on submission cards/rows. Remove it entirely. The Accept/Adjust/Override decision panel is the correct editing mechanism. Do not change the decision panel.

---

## Part 2 — PDPL consent screen (legal blocker)

### What to build
A consent screen that appears before any voice recording starts. Applies to:
- VoxExam official exam (before exam starts, after proctoring setup)
- VoxPractice voice loop (before first recording)
- QuickVox public flow /q/:code (before recording)

### Consent screen content (show both languages always)

**English:**
"Before we begin, we need your consent to record and process your voice.

Your voice recording will be:
• Transcribed by AI to text
• Used to generate an assessment score
• Stored securely in accordance with UAE PDPL

You can withdraw consent at any time by leaving the session. Recorded audio is retained for 30 days and then deleted.

By continuing, you consent to voice recording and AI processing of your response."

**Arabic:**
"قبل البدء، نحتاج إلى موافقتك على تسجيل صوتك ومعالجته.

سيتم استخدام تسجيلك الصوتي من أجل:
• تحويله إلى نص بواسطة الذكاء الاصطناعي
• إنشاء درجة تقييم
• تخزينه بشكل آمن وفقاً للقانون الاتحادي لحماية البيانات الشخصية

يمكنك سحب موافقتك في أي وقت بمغادرة الجلسة. يُحتفظ بالتسجيل الصوتي لمدة 30 يوماً ثم يُحذف.

بالمتابعة، فإنك توافق على تسجيل صوتك ومعالجته بواسطة الذكاء الاصطناعي."

### UI
- Full-screen modal — cannot be dismissed by clicking outside or pressing Escape
- Two buttons: "I Consent / أوافق" (primary green) and "I Do Not Consent / لا أوافق" (secondary grey, returns to previous screen)
- If user does not consent, abort the session and return to the entry screen

### Database schema changes
Add two nullable columns to submissions table: `consent_given` boolean default false, `consent_timestamp` timestamptz.
Add same two columns to practice_sessions table.
Check schema for the QuickVox responses table (likely quickvox_responses or similar) and add the same two columns.

Run db:push after all schema changes. This is the one place db:push is required in this task.

### Hard rule
Recording must never start if consent_given is not true for that session.

---

## Part 3 — Empty and loading states

For every list that can be empty, add a clear message instead of a blank or undefined area:
- No exams: "No exams yet. Create your first exam above."
- No students joined: "No students have joined yet."
- No submissions: "No submissions yet."
- No classes: "No classes yet. Create your first class."
- No analytics data: "No submissions to analyze yet."

For any data fetch that can take more than a moment, ensure a loading spinner or skeleton is shown, not a blank section.

---

## Part 4 — Bilingual labels on key professor-facing screens

Add bilingual (English + Arabic) labels to:
- The professor decision panel labels (Accept/Adjust/Override buttons and their confirmation text)
- The student exam result screen (the "pending professor review" message from Fix 1)
- Proctoring setup instructions

Keep English-only everywhere else for now — do not attempt a full bilingual pass on all screens.

---

## Constraints
- evaluateWithAI on the graded exam path — do not touch under any circumstances
- gpt-4o-mini stays on graded exam scoring — do not change
- No proctoring added to VoxPractice or VoxClasses
- VoxPractice student data never exposed to professor views
- No hardcoded secrets
- db:push only for the consent schema changes in Part 2

## Checks
- npm run check — must pass
- npm run build — must pass

## PR title
feat: demo-ready — consent screen, fix unapproved scores, unify review panel, empty states

## PR description
List every fix completed and note any fix that was skipped or partial with reason.
