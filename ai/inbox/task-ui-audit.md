# Task: Full UI Audit — Demo Readiness Report
## Goal
Read the entire codebase and write a detailed audit report to ai/outbox/ui-audit.md. This report will be used to build a fix queue before professor demo meetings at UAEU.

## What the report must cover

For every screen and flow listed below, describe:
1. What is built and appears to work
2. What is visibly broken or throws an error
3. What is missing (a screen exists but content is placeholder or incomplete)
4. What looks incomplete or unprofessional for a professor demo

## Screens and flows to audit

### Professor flows
- Login and authentication (Replit OIDC)
- Professor dashboard — what appears after login
- Exam creation — manual question builder, AI question generation from materials, conversational builder
- Exam management — viewing exams, exam status
- Take exam / proctor view
- VoxScore review panel — Accept/Adjust/Override, VoxScore 7-dimension breakdown, grading gap, Arabic flag, holistic impression score
- Analytics — per-exam averages, per-student breakdown, CSV export, radar chart
- VoxClasses — class creation, student roster, document upload, assigning questions
- QuickVox — creating a QR session, viewing responses

### Student flows
- Student login — code-based entry
- Exam join by 5-digit code
- Proctoring setup — webcam enable, screen share
- Voice recording and re-record option
- Result screen after submission — VoxScore band, dimension breakdown, coaching tips
- VoxPractice — material upload, topic selection, session mode setup, voice loop, follow-up probe, readiness report

### General / cross-cutting
- Navigation — does moving between sections work without errors
- Mobile responsiveness — does any screen look completely broken on a narrow viewport
- Error states — are there blank screens, console errors, or undefined data rendered anywhere
- Bilingual labels — are Arabic/English labels correct and consistent

## Output format

Write the report as markdown to ai/outbox/ui-audit.md with this structure:

```
# VoxExam UI Audit
## Date: [date]

## Summary
[3-5 sentence overall assessment — is this demo-ready or not, and what are the top 3 blockers]

## Screen-by-Screen Report

### [Screen name]
- Status: Working / Broken / Incomplete / Missing
- Notes: [what you found]
- Priority: High / Medium / Low (for demo)

[repeat for every screen]

## Top 10 Fix List
[Ordered by demo impact — most likely to embarrass in a professor meeting first]
1. ...
2. ...
...

## Do Not Touch
[Anything that works and should not be changed]
```

## Constraints
- This is a READ ONLY audit — do not change any code
- Do not run db:push
- Do not open a PR

## Checks
None — this is a read-only research task
