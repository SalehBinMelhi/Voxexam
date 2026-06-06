# VoxExam UI Audit
## Date: June 5, 2026

## Summary
VoxExam has a substantial demoable UI: professor quick exams, class management, student exam taking, proctoring setup, QuickVox, VoxScore review, analytics tables, and VoxPractice are all represented in the React app and backed by API routes. It is not yet professor-demo ready without curation, because the highest-risk flows are inconsistent across surfaces and at least one official-exam screen shows student-facing AI results before professor review. The top blockers are: the official student result screen exposes grades immediately, the class exam review path lacks the full Accept/Adjust/Override decision panel that the quick exam path has, and analytics/radar/bilingual coverage are incomplete compared with the demo promise. This was a read-only code audit, not a live browser/database smoke test, so "appears to work" means the frontend is wired to matching routes and has plausible UI states.

## Screen-by-Screen Report

### Login and authentication (Replit OIDC)
- Status: Incomplete
- Notes: The unauthenticated app renders `LandingPage`, with a Professor/Admin Login link to `/api/login`, plus demo login and local student/class entry forms. The actual professor path still depends on Replit OIDC, which is called out as a known migration blocker. There is also an unused `client/src/pages/login.tsx` username/role login screen using a different auth context and `/api/auth/login`, but `App.tsx` never routes to it; this is confusing dead UI if discovered.
- Priority: High

### Professor dashboard - what appears after login
- Status: Working
- Notes: Authenticated professors land on `ProfessorDashboard`, with a sticky header, settings dialog, support popover, theme toggle, and two tabs: Quick Exam and Classes. The surface is clean but narrow; there is no broader dashboard landing summary beyond those two tabs. University API key settings are present, but this is sensitive and may distract in a demo if the account is not pre-linked to a university.
- Priority: Medium

### Exam creation - manual question builder
- Status: Working
- Notes: Manual creation exists in both `SimpleExamTab` and `CreateExamDialog`. It supports title, optional schedule, student assignment by name/email, question types, MCQ options, expected answers, editing, deletion, and file attachments for simple exams. Demo risk: there are two different creation experiences with slightly different affordances, which can make the product feel less coherent.
- Priority: Medium

### Exam creation - AI question generation from materials
- Status: Incomplete
- Notes: Backend route `/api/generate-questions` exists and requires class materials, but I did not find a direct visible one-shot "generate questions from materials" control in the current professor UI. The class `CreateExamDialog` has an AI Question Assistant chat that uses class materials, and the quick exam form can upload reference materials for grading context, but quick exam material upload does not appear to generate questions. For a demo, this should be presented as "conversational AI generation from class materials" unless a one-click generator is added.
- Priority: High

### Exam creation - conversational builder
- Status: Working
- Notes: `CreateExamDialog` includes an AI Question Assistant gated behind class selection. It sends chat messages to `/api/ai-question-chat`, appends assistant replies, and adds returned questions into the exam. It has empty, loading, reset, and error states. Demo risk: if the selected class has no uploaded materials, backend returns a hard error; the UI explains class selection but not clearly enough that materials are mandatory before starting the chat.
- Priority: Medium

### Exam management - viewing exams
- Status: Working
- Notes: Quick exams appear as cards in `SimpleExamTab`; class exams appear inside the selected class view; both show question count and submission count. Exam detail dialogs/cards show schedule, assigned students, questions, status badges, and access code controls. The split between inline simple-exam details and `ExamDetailsDialog` for classes creates inconsistent review behavior.
- Priority: Medium

### Exam management - exam status
- Status: Incomplete
- Notes: Status is derived from start/end time as Draft, Scheduled, Active, or Completed. Unschedule means Draft in professor views but Available in student views. Publishing sets a 24-hour active window and regenerates access code. This mostly works, but "Draft" can still have an access code in some cases, and status semantics are not always professor-friendly.
- Priority: Medium

### Take exam / proctor view
- Status: Working
- Notes: `TakeExamDialog` requires webcam and screen share before official exams, starts screen/webcam recording, blocks copy/paste/context menu, tracks tab switches, captures screenshots, and uploads recordings/proctoring data after submit. QuickVox bypasses proctoring as intended. Demo risks: the screen-share prompt depends on browser permissions and "Entire Screen" user choice; recording/proctor upload failures are swallowed into console errors after the student sees success.
- Priority: High

### VoxScore review panel - Accept/Adjust/Override
- Status: Incomplete
- Notes: The quick exam detail path inside `SimpleExamTab` has a decision panel with Accept, Adjust, Override, optional reason prompt, holistic score for official exams, review duration, and decision save. The class exam `ExamDetailsDialog` does not appear to include this decision panel, so professor review differs depending on where the exam was created. This is one of the most visible demo inconsistencies.
- Priority: High

### VoxScore review panel - 7-dimension breakdown
- Status: Working
- Notes: `ProfessorVoxScore` renders total VoxScore, pass/fail band, strongest/weakest dimensions, weighted dimensions table, evidence, and the formula line. It is shown in the richer simple exam review path when `sub.voxScoreProfile` exists. The class dialog path should be verified because it does not show the same decision workflow around the VoxScore panel.
- Priority: High

### VoxScore review panel - grading gap
- Status: Incomplete
- Notes: Backend decision saving computes `gradingGap`, but I did not find a prominent visible grading-gap display in the review UI. Professors can edit per-question scores and save decisions, but the UI does not clearly show the difference between AI baseline and professor final score before saving. This weakens the review story for demo audiences.
- Priority: Medium

### VoxScore review panel - Arabic flag
- Status: Incomplete
- Notes: Backend decision saving computes `arabicFlag` when language is Arabic or mixed and grading gap is above threshold. I did not find a visible Arabic flag indicator in the professor review panel. Given the UAEU demo context, this missing surface is important.
- Priority: High

### VoxScore review panel - holistic impression score
- Status: Incomplete
- Notes: The simple exam review panel has a "Holistic impression (1-10)" input for exams with `mode === "exam"`, and the backend stores it only for official exams. This is not clearly surfaced in the class exam detail path and is not displayed as part of a saved review summary except as a timestamp/decision line.
- Priority: Medium

### Analytics - per-exam averages
- Status: Working
- Notes: `ExamDetailsDialog` has an analytics section backed by `/api/exams/:id/analytics`, with total students, average correctness, average understanding, loading state, error state, and no-submission state. Simple exam detail also shows summary cards. This is demoable if seeded submissions exist.
- Priority: Medium

### Analytics - per-student breakdown
- Status: Working
- Notes: The analytics table lists student, correctness, and understanding. `ClassesTab` also has a Student Performance list and `StudentDetailPanel` with per-student submission history and trend line. The per-student experience looks useful, but roster-only students without matching user accounts cannot open detail panels until they submit or are matched.
- Priority: Medium

### Analytics - CSV export
- Status: Working
- Notes: `ExamDetailsDialog` can export a simple CSV client-side from analytics data. The export includes studentId, name, average correctness, and average understanding. It is minimal but likely acceptable for a demo.
- Priority: Low

### Analytics - radar chart
- Status: Missing
- Notes: Backend routes exist for `/api/students/:id/performance-radar` and `/api/classes/:id/performance-radar`, but I did not find a radar chart component or visible use of those routes. The UI uses line charts for student performance over time, not radar. This is a mismatch with the requested demo coverage.
- Priority: Medium

### VoxClasses - class creation
- Status: Working
- Notes: Classes can be created from the Classes tab, with optional roster names. Empty state and create-first-class CTA are present. The UI is clear and likely demoable.
- Priority: Low

### VoxClasses - student roster
- Status: Incomplete
- Notes: Professors can add/remove roster names, and enrolled accounts appear separately. Clicking a roster badge opens student detail only if the roster name matches an existing user exactly. This split between roster names and enrolled accounts can look odd in a live demo, especially if seeded students are name-only.
- Priority: Medium

### VoxClasses - document upload
- Status: Working
- Notes: Class materials upload accepts PDF, Word, PowerPoint, Excel, TXT, MD, CSV, and JSON, and the server extracts text. The UI shows uploaded file names and dates, and supports delete. Failure messages are surfaced through toasts. Demo risk: scanned/image PDFs produce an understandable backend error, but a live professor demo should use known-good files.
- Priority: Medium

### VoxClasses - assigning questions
- Status: Working
- Notes: Class exam creation can select class students, add all, add manual students, and create manual or AI-chat-generated questions. This is one of the stronger flows, provided class materials and roster are pre-seeded.
- Priority: Medium

### QuickVox - creating a QR session
- Status: Working
- Notes: QuickVox creation is visible from Quick Exam as a single-question voice-only session. QuickVox cards show a QR icon when an access code exists, and the QR dialog displays a scannable code plus copyable `/q/:code` link. Good demo candidate.
- Priority: Low

### QuickVox - viewing responses
- Status: Working
- Notes: QuickVox submissions appear in professor exam detail with insight and follow-up text instead of scores. The student/participant result screen also shows a shareable insight. This is coherent and should be left mostly alone.
- Priority: Low

### Student login - code-based entry
- Status: Working
- Notes: Landing page supports student exam code login and class code login. `/api/student-login` accepts access codes or exam IDs, creates local student users, checks assignment for non-QuickVox, and handles expired codes. `/api/class-login` creates/enrolls a local class student. Demo risk: "Your Name" is being used as student identity, not a university ID, which may be fine for demo but should be explained.
- Priority: Medium

### Exam join by 5-digit code
- Status: Working
- Notes: Student login accepts 5-digit codes and custom short codes. The UI says "Enter 5-digit code or exam ID," while create dialogs support up to 10-character custom codes. This is functional but slightly inconsistent. QuickVox public links use `/q/:code`.
- Priority: Low

### Proctoring setup - webcam enable, screen share
- Status: Working
- Notes: Official exams block start until both camera and screen share are ready. Camera preview appears, screen readiness badge appears, and errors are displayed. It is demoable, but browser permission friction is high; rehearse with the exact browser and screen-sharing settings before professor meetings.
- Priority: High

### Voice recording and re-record option
- Status: Working
- Notes: Official exams support browser audio recording, transcript preview, audio playback, re-record, and typed fallback. VoxPractice has its own voice loop with auto-start recording, silence/clarity checks, transcript display, follow-up recording, typed fallback, retry, and skip controls. This is demoable but depends heavily on microphone permissions.
- Priority: Medium

### Result screen after submission - VoxScore band, dimension breakdown, coaching tips
- Status: Broken
- Notes: The student result dialog shows immediate Correctness, Understanding, per-question breakdown, optional `StudentVoxScore`, and AI feedback/coaching. That is visually useful, but for official VoxExam it violates the product rule that official grades must not affect assessment records before professor approval, and it also risks showing unapproved AI grades to students. For a professor demo, this should be blocked, delayed, or clearly labeled pending professor review for official exams.
- Priority: High

### VoxPractice - material upload
- Status: Working
- Notes: VoxPractice supports file upload and extraction through `/api/practice/extract-material`, plus material analysis through `/api/practice/analyze-material`. It accepts common study file types and keeps data scoped to the student route guard. The UI shows material summary, concepts, topics, and generated question stats.
- Priority: Low

### VoxPractice - topic selection
- Status: Working
- Notes: Students can choose a subject or type a custom topic. The analysis path turns topic text into material content and proceeds into session setup. This is a good lightweight demo path because it avoids document parsing risk.
- Priority: Low

### VoxPractice - session mode setup
- Status: Working
- Notes: Modes include Warm-up, Readiness Sprint, Weak Spot Review, and Mock Oral Exam, with coach style and answer length controls. Weak Spot Review is gated by prior completed sessions. Bilingual labels are present here more consistently than elsewhere.
- Priority: Low

### VoxPractice - voice loop
- Status: Working
- Notes: The voice loop includes prep countdown, recorder, typed fallback, processing states, transcript card, follow-up probe, feedback, retry, skip, and progress. It also has privacy messaging and no professor visibility. This is one of the better-built student experiences.
- Priority: Low

### VoxPractice - follow-up probe
- Status: Incomplete
- Notes: The UI is wired to `/api/practice/sessions/:id/probe` and displays the generated follow-up before feedback. Known project notes still mention follow-up probe connection and skipped-probe scoring issues, and the UI allows skipping follow-up. For a demo, use a normal spoken/typed answer path rather than edge cases.
- Priority: Medium

### VoxPractice - readiness report
- Status: Working
- Notes: Finalization produces an overall readiness score, VoxScore profile, concept coverage, best/worst answer excerpts, and weak-spot review CTA. This is demoable if the answers are substantive.
- Priority: Low

### Navigation - moving between sections
- Status: Incomplete
- Notes: The app has very few top-level routes: `/`, `/q/:code`, and fallback to `/`. Most navigation happens via tabs, cards, and dialogs. This can work, but deep linking and back-button behavior are weak. Large dialogs and selected-card states can make it hard to recover during a live demo if a modal gets into a bad state.
- Priority: Medium

### Mobile responsiveness
- Status: Incomplete
- Notes: Many layouts use responsive grids and scrollable dialogs, so the app should not be completely broken on narrow screens. The riskiest mobile areas are professor submission review, VoxScore tables, per-question score editing, class/student performance cards, QR dialogs, and proctoring setup. Dense button rows often rely on wrapping instead of mobile-specific layouts, which can look cramped or unprofessional.
- Priority: Medium

### Error states
- Status: Incomplete
- Notes: Most mutations have toasts or generic error messages. Several important post-submit operations log failures to console only, including proctoring recording upload and proctoring data upload after student submission. Some backend endpoints return raw validation details, while others return generic errors. The professor-facing demo should avoid flows where object storage, camera, screen share, or AI calls are likely to fail.
- Priority: High

### Bilingual labels
- Status: Incomplete
- Notes: VoxPractice contains the strongest English/Arabic bilingual labeling. The official exam, professor dashboard, analytics, class management, proctoring, QuickVox, and review flows are mostly English-only. Arabic support in grading prompts is not matched by consistent Arabic/English UI labels.
- Priority: High

## Top 10 Fix List
1. Block or relabel official student results so unapproved AI scores are not shown as final after submission.
2. Unify professor review: make class exam details include the same Accept/Adjust/Override, reason prompt, holistic score, and VoxScore workflow as the richer quick exam detail path.
3. Surface grading gap and Arabic flag visibly in the professor review panel.
4. Add or clearly demo-scope AI question generation from materials; currently the visible path is conversational and class-material dependent, not a simple one-click generator.
5. Add a visible radar chart or remove "radar chart" from demo claims until frontend integration exists.
6. Rehearse and harden proctoring upload failure states; students currently see success even if recording/proctor data upload fails in the background.
7. Clean up the unused legacy `LoginPage` path/auth context or make it inaccessible in demos.
8. Improve bilingual coverage outside VoxPractice, especially professor review, student exam, and proctoring setup.
9. Reduce duplication between `SimpleExamTab` inline exam detail and `ExamDetailsDialog` so demo behavior does not depend on whether an exam is quick or class-based.
10. Polish mobile layouts for dense review tables, button groups, VoxScore breakdowns, and student performance panels.

## Do Not Touch
- VoxPractice privacy boundaries and student-only route guards; they are clearly implemented and important for trust.
- QuickVox public `/q/:code` flow and QR sharing; it is simple, coherent, and demo-friendly.
- The proctoring setup gate that requires webcam and screen share before official exams.
- The `ProfessorVoxScore` breakdown structure and formula line; it gives the review panel credibility.
- Client-side CSV export for exam analytics; it is small but practical.
- Class material upload/extraction support for common document formats; use known-good files rather than changing the flow.
- The scroll-contained dialog pattern for long forms; it prevents the largest modals from becoming unusable.
