# VOX Exam — Project Instruction (Living Document)

---

## What is VOX Exam

VOX Exam is an EdTech platform for university oral examinations. It consists of four distinct products: QuickVox, VoxClasses, VoxExam, and VoxLive. Students answer questions by voice, AI transcribes and grades the response using VoxScore, and proctoring is built in for official exam mode. It is being built on Replit by a non-technical founder using the Replit Agent for code changes.

**Target audience.** UAE universities — professors and students. Bilingual Arabic and English is a hard requirement.

**Business model.** B2B sale to universities. Free pilot for first departments, then per-department annual license, then enterprise pricing for university-wide deployment.

---

## The Four Products

**QuickVox** — Student-led voice practice and self-study tool. No professor needed. Student logs in, picks a topic, AI generates a question, student answers by voice, AI gives coaching or scoring feedback depending on mode. Two modes: Coach Mode (default, no score) and VoxExam Mode (full VoxScore). Requires student login for persistent identity and score history. No QR code. No public route.

**VoxClasses** — Professor-created classes where students practice oral answers on their own time. Professor assigns topics and uploads materials. AI scores every answer automatically using full VoxScore. Professor has complete visibility into all student performance and can adjust any score. No transcript impact. No proctoring. Students join via class join code or QR.

**VoxExam** — Official and formative oral examination tool. Full proctoring. Professor builds the exam, AI suggests VoxScore with transcript evidence, professor reviews and approves every score before anything goes on the official transcript. Nothing affects the official transcript without professor approval. Students enter via exam access code.

**VoxLive** — No-login QR-based public voice session tool. Professor creates a single question, generates a QR code, anyone scans and answers by voice without logging in. Used for demos, open days, conference booths, classroom icebreakers, and orientation events. Completely separate from the authenticated product. Route: `/q/:code` retained as compatibility alias, new links use `/v/:code`.

---

## AI Positioning (Locked In)

The wrong positioning: "AI grades students."
The right positioning: "AI assists faculty evaluation."

- AI conducts practice exams — AI leads
- AI transcribes voice responses — AI leads
- AI suggests rubric scores with evidence — AI assists
- AI flags weak answers and high-gap cases — AI assists
- Professor reviews and approves final grade — professor decides

**Rule.** If the exam affects the transcript, keep a human in the loop. If it is practice, AI can lead.

---

## Adoption Ladder (Locked In)

- Stage 1 — Student Practice Simulator — no professor needed, AI leads, students use voluntarily
- Stage 2 — Professor Dashboard and Transcripts — professors assign practice, review analytics, no grading pressure
- Stage 3 — AI Rubric Suggestions — AI suggests scores with evidence, professor reviews before anything is recorded
- Stage 4 — Professor-Approved Graded Exam — full official exam with proctoring, AI assists, professor makes every final decision

---

## VoxScore Framework (Locked In)

VoxScore is VOX Exam's proprietary oral assessment scoring system and the core strategic moat of the product. It is academically grounded in university oral assessment frameworks including Carnegie Mellon, Trinity College Dublin, Columbia, and UAE CAA standards.

**Seven dimensions:**

| Dimension | Weight | What It Measures |
|---|---|---|
| D1 Subject Knowledge and Content Accuracy | 25% | Factual correctness, depth, disciplinary terminology, conceptual relationships, absence of misconceptions |
| D2 Reasoning and Critical Thinking | 20% | Analysis, synthesis, causal explanation, evaluation, assumptions, limitations, intellectual independence |
| D3 Evidence and Justification | 15% | Use of examples, cases, data, or discipline-specific evidence to justify claims |
| D4 Responsiveness and Defense | 15% | Directly answering follow-up questions, adapting under probing, defending or revising claims, epistemic honesty |
| D5 Organization and Coherence | 10% | Logical sequencing, transitions, structure, topic control — answer is followable in real time |
| D6 Communication Clarity | 10% | Comprehensibility, lexical precision, clear central message — scores meaning not accent or language choice |
| D7 Professionalism and Composure | 5% | Academic register, respectful engagement, composure under questioning — low weight, bias-sensitive, human-reviewable |
| **Total** | **100%** | |

**Scoring scale.** Five bands per dimension: Inadequate (1), Limited (2), Developing (3), Proficient (4), Exemplary (5). Final VoxScore is the sum of each dimension's band score multiplied by its weight. Pass threshold is 60 out of 100.

**Output.** Both the weighted total score and the full dimension profile are always shown to the student and professor. A single aggregate score without the breakdown defeats the diagnostic purpose of the framework.

**Professor holistic impression score.** A separate score out of 10 recorded on every VoxExam submission. Not part of the VoxScore calculation. Used exclusively for long-term AI calibration — to measure how well the algorithmic score matches experienced professor judgment over time.

**Discipline-specific modules.** Worth up to 10–15%, available for individual faculties. They replace part of D7 or redistribute from lower dimensions. The core seven dimensions remain stable platform-wide. Examples: clinical judgment for Health Sciences, design safety for Engineering, issue-spotting for Law, pedagogical application for Education. Specific modules per faculty not yet designed — concept only.

**Strategic intent.** VoxScore becomes the global standard for oral competency measurement. Universities adopt it for academic grading first. Employer trust follows later. The rubric is proprietary and not published academically — results prove the framework, not the documentation.

---

## VoxScore Bilingual Scoring Rules (Locked In)

- Arabic, English, and Arabic-English mixed responses are scored equivalently on academic meaning
- Language choice, accent, dialect, and code-switching are never penalized unless they prevent understanding of the academic meaning
- Correct technical terminology in Arabic counts identically to correct technical terminology in English for D1
- Code-switching that improves precision is treated as neutral or positive
- Gulf Arabic connectives combined with English discipline terminology is treated as normal UAE academic behavior — never penalized
- Language issues only affect D6 Communication Clarity and only when meaning is materially blocked
- Low-confidence ASR segments on Arabic or mixed answers are flagged for mandatory human review before any high-stakes score is recorded
- The platform must never accidentally grade the ASR system's weakness instead of the student's competence
- Arabic support is handled by a single prompt clause — no language detection logic, no separate prompts — locked technical decision

---

## AI Follow-Up and Probing Protocol (Locked In — Platform Wide)

This protocol applies in QuickVox Coach Mode, QuickVox VoxExam Mode, and VoxExam official sessions.

**Acceptable probes** — questions that open up thinking without leading toward the answer:
- "Can you give me an example?"
- "What would happen if the opposite were true?"
- "How does that connect to what you said earlier?"
- "Why does that relationship hold?"
- "What evidence supports your answer?"
- "What assumption are you making here?"

**Forbidden probes** — anything that plants the answer, completes the student's thought, confirms a wrong answer, or guides the student toward the correct response.

- AI accepts a question as resolved when the student has demonstrated sufficient understanding across the relevant dimensions
- AI probes when the answer is partial, vague, or surface-level
- The AI must never accidentally answer the question while probing
- In Coach Mode: conversation continues until student demonstrates understanding or disengages — no hard cap
- In VoxExam Mode: AI is evaluating not tutoring — more structured, bounded, ends with VoxScore

---

## QuickVox — Student Self-Study Tool (Locked In)

### Topic Sources
Students choose from three topic paths:
1. Upload or paste their own study material — shown as the recommended path labeled "Most relevant to your coursework"
2. Choose from eight academically framed starter topic cards (see below)
3. Browse by subject — Engineering, Business, Health Sciences, Education, General Academic Skills
4. Type a free topic — with example prompts and AI clarification chips if topic is too broad
5. "Surprise me with a question" fallback link

### First-Time Flow for Unenrolled Student
- Entry screen: "Practice one oral answer privately. No class needed." — in Arabic and English
- Subtext: "Your practice is private — not sent to any professor."
- Language choice is a first-screen decision: "Practice in English / تدرّب بالعربية"
- Six to eight topic cards shown immediately — no profile form, no setup required
- Optional profile chips (program, year, language preference) — shown passively, never blocking, skippable
- Once topic selected: difficulty selector (Easy/Conceptual, Medium/Applied, Hard/Analytical) with tooltip
- Answer length: 60 sec / 90 sec / 2 min
- AI generates three question options — student picks one, can regenerate or adjust difficulty
- Microphone permission requested at practice screen only — never at onboarding
- 30-second prep timer before recording starts
- Subtle answer structure prompt during recording: Claim → Reason → Example → Conclusion
- One re-record allowed on first session only — reduces anxiety
- "Private — not sent to your professor" label always visible

### The Eight Starter Topic Cards (Locked)

| Card | Oral Skill Practiced | Program Fit |
|---|---|---|
| Explain a core concept from your field to a non-specialist | Concept explanation, clarity | All |
| Argue whether a common practice in your field is effective — defend with evidence | Argumentation, evidence use | Engineering, Business, Health |
| Compare two approaches to a problem in your discipline and justify which is better | Analysis, comparative reasoning | Engineering, Business |
| Describe the ethical implications of a recent development in your field | Critical evaluation, structured position | Health, Education, Business |
| Walk through the methodology you would use to investigate a research question | Synthesis, knowledge application | All |
| Summarize the main findings of a study or project and explain their significance | Evidence use, academic communication | All |
| Identify a gap in current thinking in your subject and propose how to address it | Higher-order analysis, academic voice | Education, Engineering, Business |
| Take a position on a contested issue in your field and respond to a counter-argument | Argumentation, rebuttal, academic register | All |

### Two-Mode Structure (Locked)

Mode selection uses a two-card selector — not a toggle switch:

**Coach Mode (default, left card)**
- Label: "Practice with feedback. No score. Low pressure. Recommended for learning a topic."
- AI generates question, student answers by voice, AI gives insight and coaching follow-up
- Conversation continues until student demonstrates understanding or disengages — no hard cap
- No VoxScore produced
- Coaching feedback uses VoxScore dimension language without numerical scores

**VoxExam Mode (right card, named "VoxExam Mode")**
- Label: "Simulate an oral exam. Get a private VoxScore estimate. Best when you want to test readiness."
- Available to all logged-in students — no enrollment gate, no professor permission required
- First activation triggers one-time expectation-setting interstitial — never blocks, always skippable
- Interstitial states: not an official grade, professor cannot see it, explains seven dimensions, frames score as diagnostic
- Full VoxScore across all seven dimensions
- Score shown with readiness band (Developing, Adequate, Proficient, Exemplary), weakest dimensions, confidence level, and specific next action
- Score labeled "Estimated VoxScore — Private practice score" never just "VoxScore"
- Score always private to student, always unofficial, professor never sees it under any circumstances

### Multiple Question Sessions
- Each question is its own conversation unit — resolved before moving to next
- Session ends with cross-question summary showing which dimensions were consistently weak
- "Coaching only — no official grade" label always visible on QuickVox

### Enrolled vs Non-Enrolled in One UI
- No enrollment: show only self-study paths, hide all class language
- Enrolled in VoxClass: class topics appear first with clear label "VoxClass Assignment — may be visible to professor", self-study topics second with label "QuickVox Self-Study — private"
- Never mix the two without clear visual distinction

### Arabic UI
- Real RTL layout — not translated English with broken alignment
- Prompt language and answer language are separate settings
- Student can receive prompt in English and answer in Arabic or vice versa

---

## VoxClasses (Locked In)

- Professor creates a class and shares a join code or QR code
- Professor uploads materials that become available to enrolled students as topic sources in QuickVox
- Professor assigns practice topics or questions
- AI scores every student answer automatically using full VoxScore across all seven dimensions
- No mandatory professor pre-approval required for practice answers
- Professor has full visibility: individual student answers, full transcripts, VoxScore history per student, sub-score breakdowns per dimension, which students are struggling and on which dimensions, which students have not practiced
- Professor can review and adjust any score at any time — every adjustment feeds VoxScore training data
- Score does not go on the official transcript — this is the only meaningful distinction from VoxExam
- No proctoring on VoxClasses
- VoxClass Exam Practice unlocks only when professor has enabled oral exam practice for that class — this is the course-calibrated version of VoxExam Mode that enrolled students see

---

## VoxExam — Official Examination (Locked In)

### Question Builder — Four Methods
1. **Manual entry** — professor types questions directly — already exists
2. **Upload materials, AI generates** — AI extracts topics and proposes questions — AI asks clarifying questions first (difficulty, depth, question type) before generating
3. **Upload previous exam plus materials, AI recreates as oral** — AI reads both and recreates as oral version — professor reviews and edits all output before publishing
4. **Conversational builder** — professor chats with AI to build and refine questions — AI asks clarifying questions back

**Hard rule:** Professor always reviews and edits all AI-generated questions before publishing. No direct publish without professor approval. No exceptions.

### AI Output Per Question — Full Structure (Locked)

**Mandatory before publishing:**
- Oral question text (Bloom's cognitive level checked — recall-level questions flagged for elevation)
- Learning outcome mapping: CLO, PLO, QF Emirates knowledge/skill/responsibility, cognitive level
- Model answer benchmark: concise benchmark, full benchmark, acceptable answer variants, excellent answer signals, minimum pass answer
- Must-have concepts (5–8 items drawn from uploaded materials)
- Partial-credit concepts
- Common misconceptions with score impact (minor, moderate, severe)
- Three tiered follow-up probing questions: clarification, depth probe, extension
- Bilingual terminology: English terms, Arabic equivalents, accepted code-switching, do-not-penalize synonyms
- VoxScore dimension weight distribution for this question
- Scoring anchors per band: 90–100, 75–89, 60–74, 50–59, below 50
- Professor approval status

**Source grounding rule:** AI generates only concepts traceable to uploaded materials. Every concept carries a source citation with confidence level (High, Medium, Low). Low-confidence concepts trigger a professor clarification prompt before approval. AI cannot invent benchmark content not grounded in professor-provided materials.

**Hidden from students always:** full model answer, must-have concept checklist, misconception map, follow-up bank, score thresholds, AI grading instructions.

### Professor Grading Workflow (Locked)
- AI suggests VoxScore across all seven dimensions with transcript evidence cited per dimension
- Professor decision on every answer: Accepted, Adjusted, or Overridden
- Override reason field always visible and open — optional but actively encouraged, never a hard gate
- If professor begins typing override reason, AI assistant activates to help structure a more useful explanation
- If professor saves without explanation, one gentle prompt appears with Skip button — never blocks
- VoxScore output cites which benchmark concepts were present, missing, or incorrect in the student's answer
- Nothing goes on official transcript until professor approves — no exceptions
- Professor holistic impression score out of 10 recorded separately on every submission

### Proctoring
- Full proctoring: webcam recording, screen recording, tab-switch detection, copy-paste blocking
- All proctoring skipped entirely on QuickVox and VoxClasses

---

## VoxLive — Public Voice Sessions (Locked In)

- Renamed from QuickVox public route — no longer called QuickVox
- Professor-created, no-login, QR-based public voice session
- Used for demos, open days, conference booths, classroom icebreakers, orientation events
- One professor-set question, one voice response, optional display name, optional lightweight demo feedback
- Demo feedback labeled "demo only — not an official VoxScore"
- Every completed session ends with CTA: "Practice privately with score history — open QuickVox"
- Codes expire by default: 24 hours for events, 7 days for pilots
- Maximum responses per code configurable by professor
- Rate limited by code and IP
- Explicit consent shown before microphone access on every VoxLive session
- Data stored separately — never enters authenticated VoxScore pipeline under any circumstances
- Audio deleted after configurable TTL
- `/q/:code` retained as compatibility alias for existing printed QR codes
- New public links use `/v/:code`
- Smart resolver: public event link → render VoxLive session; VoxClass assignment link → redirect to login with return URL; expired link → show expired page with QuickVox CTA; invalid code → safe error page
- Not called QuickVox Public, Guest QuickVox, or Anonymous QuickVox

---

## Student Identity Model (Locked In)

**Four-tier model — one account, no duplicate accounts:**

| Tier | Who | Access | Score Label | Professor Visibility |
|---|---|---|---|---|
| Personal Learner | Any verified email | Full QuickVox Coach Mode and VoxExam Mode, private score history | Private VoxScore estimate | Never |
| University Verified | University domain, SSO, or domain allowlist | Everything above plus university topic suggestions | Private VoxScore estimate | Never unless enrolled |
| VoxClass Enrolled | Professor invite, class code, roster sync | Everything above plus class materials and assignments | Institutional VoxScore | Class policy controls |
| Official VoxExam | Institution-approved, professor-enabled | Full official exam with proctoring | Official assessment | Professor reviews and approves |

**Registration:**
- Any verified email accepted at signup — no university email gate
- Email verification required before first session — no anonymous persistent accounts
- After verification, system detects if email matches institution domain allowlist
- If match found: offer university verification step — optional, student can continue as Personal Learner
- Consent screen required before first voice recording — cannot be skipped

**Account linking when joining a VoxClass:**
- System checks if professor's invited email already has a QuickVox account
- If yes: existing account promoted to VoxClass Enrolled — no new account created — all history preserved
- If institutional SSO: prompted to link SSO to existing account with one explicit confirmation step
- Personal practice history before VoxClass enrollment: visible to student only — never visible to professor unless explicitly submitted

**Privacy history rule:**
- personal_history_visibility = student only
- voxclass_history_visibility = class policy
- official_exam_visibility = institution policy
- This rule is permanent and cannot be overridden

**Identity fields:** Arabic full name, English full name, preferred display name, university legal name, student ID (optional at university verification step). No English-only name field.

**Institution domain allowlist:** configurable per institution during onboarding — not hardcoded to .ac.ae only. Supports SAML/OIDC SSO, LMS LTI launch, roster sync, admin-managed access.

**VoxScore labeling by tier:**
- Personal Learner: "Private VoxScore estimate — for your own reference only"
- VoxClass: "Institutional VoxScore — visible according to class policy"
- Official exam: "Official assessment — professor approved"

---

## QuickVox First-Time Flow (Locked In)

- Screen 0: entry detection — if no enrollments and no prior sessions, show first-run experience
- Headline: "Practice one oral answer privately. No class needed." — bilingual
- Subtext: "Your practice is private — not sent to any professor."
- Two primary CTAs: "Start practicing" and "Join a VoxClass"
- Never show "You have no classes" — feels like failure
- Topic choice hub: upload material (recommended), starter cards, subject browse, free text
- Optional profile chips (program, year, language) — three chips maximum, always skippable
- Practice setup: topic confirmed, difficulty, answer length, language mode
- AI generates three question options
- Microphone permission at practice screen only
- 30-second prep timer
- One re-record on first session
- Coaching feedback with VoxScore dimension language, no raw numbers in Coach Mode
- After first session: Recents, Suggested next topics appear on home screen

---

## Platform-Wide Tooltip System (Locked In)

- Hover tooltips on every feature, tab, switch, and button
- Replaces the yellow bulb icon at the top right of dashboards
- One to two sentences, plain language, bilingual Arabic and English
- Appears on hover, disappears when cursor moves away
- This is the onboarding system — no separate tutorial needed

---

## Programme Director Dashboard (Locked In)

The programme director dashboard is a governance, quality assurance, curriculum improvement, and accreditation tool. It is not a larger professor dashboard.

**Who has access:**
- Professor: own courses only, own students, own AI grade review queue, own class analytics
- Programme Director: assigned programme, cross-course aggregates, professor calibration signals, cohort risk clusters, accreditation evidence — cannot edit grades
- Dean / QA Officer: college or institution level, aggregated views only

**Six MVP pages:**
1. Programme Overview — KPI strip, average VoxScore by dimension, completion rate, students below threshold, calibration alerts
2. VoxScore Dimension Heatmap — rows are courses, columns are seven dimensions, cells show average score with warning color
3. Learning Outcome Map — CLO to PLO to VoxScore dimension mapping, attainment per PLO, missing coverage flags
4. Course and Section Comparison — structural course problems, section variance, difficulty normalization
5. Assessment Quality and Moderation — question benchmark completeness, follow-up probe usage, bilingual terminology coverage, AI confidence warnings, professor override rate
6. Accreditation Export Center — one-click CAA OEF formatted evidence reports, PLO attainment report, continuous improvement action log

**Two pages added post-MVP:**
- Student Support Risk — cohort risk clusters, repeated low dimension patterns, support action triggers
- Language and Equity — English vs Arabic vs Mixed performance gaps, Communication score variance by language, professor scoring differences by language mode

**Professor calibration view:**
- Shows score distribution by professor for each dimension — named to programme director only, never shown to other faculty
- AI acceptance rate by professor
- Calibration alert when one professor's mean deviates more than one standard deviation from programme mean on any dimension
- Framed as QA signal not performance ranking

**Privacy rules:**
- All views default to cohort-level aggregates
- Individual student drill-down requires explicit click, logged in audit trail, purpose reminder displayed
- Minimum five students in any displayed cohort segment — smaller segments suppressed
- Raw audio requires logged case reason
- Private QuickVox history never appears at any dashboard level

**The five decisions the dashboard serves:** curriculum redesign, assessment moderation, student support, faculty development, accreditation evidence.

---

## Arabic ASR Pipeline (Locked In)

**Whisper alone is not sufficient** for Gulf Arabic, Emirati Arabic, or Arabic-English code-switching in a grading context.

**Three-tier ASR strategy:**

| Session Type | ASR Requirement | WER Threshold | Scoring Action |
|---|---|---|---|
| Coach Mode | Whisper with glossary prompting | Up to 20–25% tolerable | Allow coaching, show transcript, allow retry |
| Private VoxExam Mode | Whisper plus confidence gate | Below 15% | Score as estimate only, show confidence label |
| Official VoxClass | High-confidence ASR ensemble | Below 10–12%, critical concept error below 5% | Block automatic scoring if below threshold, require human review |
| Any mode | Any engine | Above 25% WER or low key-term confidence | Do not score, ask for re-record or human review |

**Three-stage build plan:**

Stage 1 — MVP: OpenAI gpt-4o-transcribe or Whisper large-v3 with glossary prompt injection per course. Transcript shown to student for review. Confidence gate blocks scoring when quality is low.

Stage 2 — University pilots: Speechmatics Arabic-English bilingual model (6.3% WER on mixed speech benchmarks, on-premises deployment available) or Azure Speech ar-AE. Parallel ASR engine for comparison. Terminology alignment layer post-ASR. UAE North region deployment for data sovereignty.

Stage 3 — Institutional deployment: Proprietary VoxExam UAE academic speech dataset. Fine-tuned model on UAE university oral responses. Full on-premises or UAE-region processing. Competitive moat.

**Key metrics:**
- WER — word error rate per session type thresholds above
- Critical Concept Error Rate — whether rubric-critical concepts were preserved regardless of raw WER — primary metric for grading safety
- VoxScore Drift — grade difference between human transcript and ASR transcript — if drift exceeds 8 points on any dimension, ASR is not safe for automatic grading on that session type

**Segment-level language detection:** never label entire answer as one language. Use segment-level labels: english, arabic_msa, arabic_gulf, arabic_emirati, mixed_arabic_english, uncertain.

**Terminology layer:** per-course academic glossary generated from professor-uploaded materials, applied post-ASR before VoxScore grading. Produces raw transcript, normalized academic transcript, detected key terms, uncertain terms.

**Known Whisper bug:** Whisper large-v3-turbo consistently transcribes Arabic word نعم as "Naah" or "Naahe" — must be caught by terminology correction layer.

**MBZUAI partnership:** strategic recommendation — research collaboration or data contribution agreement with MBZUAI Speech Lab in Abu Dhabi for proprietary Gulf Arabic ASR development.

**Governing rule:** ASR supports VoxScore but never silently determines it. Low confidence triggers human review not automatic scoring.

---

## Model Answer Benchmark Creation (Locked In)

**Hybrid four-step model:**

1. Professor creates or uploads source material (lecture notes, textbook chapters, past exams, manually written question)
2. AI generates benchmark package using RAG against uploaded materials only — generation target under 30 seconds — any concept not traceable to uploaded document flagged with warning badge
3. Professor reviews using structured seven-dimension form — not a single text editor — each VoxScore dimension has its own review section — conversational refinement available for resolving ambiguities
4. Professor approves — explicit click — publishing blocked until all mandatory components are approved — audit log records who approved and when

**Governing rule:** AI may generate the benchmark. Only the professor can authorize the benchmark. Only professor-approved benchmarks can be used for official VoxScore grading. No exceptions.

**AI-only benchmark creation is never permitted.** Manual-only exists as an override but never the default path.

**Source grounding rule:** every concept carries source citation (file, page, extracted evidence, confidence level). Low-confidence concepts trigger clarification prompt. AI cannot invent content not grounded in professor-provided materials.

**VoxScore grading using the benchmark:** grades concept coverage, accuracy, relationships, reasoning chain, evidence use, follow-up responsiveness. Never compares word-for-word. VoxScore output cites which benchmark concepts were present, missing, or incorrect — transparent and auditable.

**Version history:** all professor edits versioned. Audit log exportable for CAA evidence.

---

## Flagging and Human Review System (Locked In)

Three mechanisms in order of availability:

**Mechanism 1 — available immediately:** AI confidence scoring. When AI internal certainty about a score is low the answer is flagged. Primary mechanism in early versions.

**Mechanism 2 — after sufficient real data:** Historical gap pattern prediction. System identifies characteristics of answers that historically produce large gaps and flags new answers matching that profile.

**Mechanism 3 — advanced, built over time:** Answer anomaly detection. AI detects signals suggesting uncertainty — unrecognized terminology, very short answers to hard questions, mid-answer language switches that break scoring logic.

**Gap thresholds (placeholders until real data replaces them):**
- English answers: flag when gap exceeds 8 points
- Arabic answers: flag when gap exceeds 6 points
- Mixed answers: always flag regardless of gap size

Thresholds are dynamic — calculated from rolling average gap per answer category — not hardcoded permanently.

Emergent gap patterns surfaced automatically when professor override clusters share a common characteristic not yet in a known flag category. Human reviews and confirms whether it becomes a new permanent flag category.

---

## Professor Override Data Weighting (Locked In)

Explanation quality is the primary variable in how override data is weighted for VoxScore training. Context is secondary.

| Tier | Condition | Weight |
|---|---|---|
| Highest | Detailed explanation with official VoxExam context | Highest |
| High | Detailed explanation with VoxClasses practice context | High |
| Medium | No explanation with official VoxExam context | Medium |
| Lowest | No explanation with VoxClasses practice context | Lowest |

A detailed VoxClasses explanation is weighted higher than a blank VoxExam override. Explanation quality matters more than which product it came from.

---

## Data Schema — Every Submission Must Capture

- Student ID, program, college, language used (English, Arabic, or Mixed)
- Question text, category (Conceptual, Applied, Analytical, Communication), difficulty (Easy, Medium, Hard)
- Voice recording stored securely with explicit consent flag
- Transcript with language tags, ASR confidence per segment
- Answer duration, estimated word count, fluency indicator
- AI score for all seven VoxScore dimensions individually
- AI total VoxScore out of 100
- AI grade timestamp
- Follow-up question asked (yes or no), follow-up answer quality, score change after follow-up
- Self-correction detected (yes or no), answer structure signal (memorised vs exploratory), number of professor prompts needed
- Professor decision: Accepted, Adjusted, or Overridden
- Override reason text
- Professor adjusted scores per dimension if changed
- Professor holistic impression score out of 10 (VoxExam only)
- Professor review timestamp and review time taken in minutes
- Attempt number, prior VoxScore average, score trend (Improving, Stable, or Declining)
- Grading gap calculated as AI score minus professor score
- Arabic or Mixed flag triggered automatically when gap exceeds threshold
- ASR confidence level and estimated WER band
- Critical concept error flag if rubric-critical concepts were lost in transcription

---

## Data Strategy (Locked In)

- Every voice response, transcript, VoxScore, and professor correction is a training asset and a strategic moat
- Student voice data stored long term with explicit consent
- The professor override log is the most important training dataset — every override reason, gap, and correction must be preserved and queryable
- No voice recording stored without explicit student consent flag on the submission record
- Explanation quality is the primary variable in how override data is weighted for VoxScore training
- Long-term direction: fine-tune a smaller open-source model on accumulated override data to create a proprietary VoxScore grading model — candidate model is Qwen for Arabic language strength
- Data collection must be structured correctly from day one — retroactive reconstruction is not possible
- The pilot data of 180 students used in planning documents is hypothetical — not real observed data — all numbers are illustrative placeholders until real submission data replaces them

---

## UAE PDPL Compliance (Locked In)

- No voice recording stored without explicit student consent flag — consent screen cannot be skipped
- Voice recordings may qualify as biometric data under UAE PDPL — treated as highest privacy tier
- VoxScore may qualify as profiling — purpose must be clearly stated at signup
- Cross-border data processing (Replit, OpenAI, database hosting) must be disclosed in privacy notice
- Data processing agreement required with every ASR provider before any student voice is processed
- DPIA required before university deployment
- Data processing agreement template required for every university institutional contract
- Student rights: information about data types, purposes, automated decisions, sharing, retention, correction, erasure
- Separate retention policies for audio, transcript, score, and logs
- Pseudonymization where possible
- Human review path required for all official high-stakes scoring
- Official institutional deployment must use UAE-region or on-premises ASR — global API endpoints not acceptable for universities with strict data governance requirements

---

## Tech Stack

- **Client:** React + TypeScript, wouter for routing, qrcode.react for QR
- **Server:** Node.js + TypeScript on Replit
- **DB:** PostgreSQL via Drizzle ORM. Schema lives in `shared/schema.ts`. Migrations applied via `npm run db:push`
- **Validation:** Zod via `insertExamSchema` / `insertSubmissionSchema`
- **AI:** OpenAI — `gpt-4o` for QuickVox and VoxClasses, `gpt-4o-mini` for graded exam evaluation, Whisper / gpt-4o-transcribe for audio transcription
- **Sharing:** Web Share API (`navigator.share`) with clipboard fallback
- **Auth target:** Microsoft SSO — UAE university professors and students already have university Microsoft accounts. Current auth is Replit OIDC for professors and code-based login for students — Microsoft SSO is the planned migration.
- **DNS:** `voxexam.com` and `voxexams.com` registered on Cloudflare (`voxexam.ae` not registered). A Cloudflare Page Rule redirects `voxexams.com` to `voxexam.com`.
- **Database hosting target:** PostgreSQL must move to Supabase or Neon — data must never be trapped inside Replit
- **Secrets:** All environment variables stored as Replit environment variables — never hardcoded

---

## What Is Currently Built

**Authentication** — Replit OIDC for professors and admins, local code-based login for students, demo sessions, class join code enrollment. Status: Working.

**Exam Creation (VoxExam path)** — Manual question builder (MCQ, short answer, audio response), AI question generation from materials, conversational question builder chat. Status: Partially working — gpt-5.1 bug must be fixed before professor uses chat feature.

**QuickVox (current state — being repurposed)** — One-question voice-only variant, no proctoring, no login wall on public entry, 7-day access code, public `/q/:code` route, QR code modal, Web Share API, AI insight and one follow-up question. Phase 4A (interactive follow-up reply) active on its own branch. Status: Phase 1–3 done, Phase 4A active, full repurpose pending.

**Classes (being rebuilt as VoxClasses)** — Class creation with join codes and rosters, document upload with parsing, basic AI question generation from materials. Status: Working at basic level — VoxScore analytics layer and full professor visibility not yet built.

**Take Exam Flow** — In-browser audio recording with ffmpeg.wasm format conversion, full proctoring for VoxExam, QuickVox bypasses all proctoring. Status: Working.

**AI Grading (seven-dimension VoxScore)** — `evaluateWithAI` (gpt-4o-mini) now returns a structured VoxScoreProfile across all seven dimensions (D1–D7 with weights), stored on the submissions table. Legacy `totalScore` retained for backwards compatibility on a 0–1 scale. AI strengths/weaknesses feedback on regular exams only. Status: Working.

**VoxScore breakdown UI** — Professor view shows a compact strip (total, band, strongest, weakest) with an expandable 7-row dimension table (dimension, weight, band chip, weighted contribution, evidence, view-evidence link). The table auto-opens on Adjust/Override, a near-boundary score, or a weak dimension. Students see a simplified VoxScore section in the result dialog plus a VoxScore badge on completed exam cards. Null-safe for older submissions that predate the schema upgrade. Status: Working.

**Analytics** — Per-exam averages, per-student breakdown, CSV export, radar chart and score trend. Status: Working — needs full rebuild when VoxScore schema ships.

**Admin** — Live support via WebSocket, WebRTC screen view and voice call. Status: Working.

---

## Pending and Planned Work

### Fix First — Before Any New Features

**Fix gpt-5.1 bug**
Change model reference in `server/replit_integrations/chat/routes.ts` from `gpt-5.1` to `gpt-4o`.
Status: Pending — blocks professor question builder chat.

**Consent flow**
PDPL-compliant consent screen before any voice recording begins. Stores explicit consent flag on every submission record.
Status: Pending — blocks all real student data collection.

### Foundation — Infrastructure

**Database migration** — Move PostgreSQL from Replit to Supabase or Neon. Status: Pending — high priority before real users.

**Domain registration** — `voxexam.com` and `voxexams.com` registered on Cloudflare (`voxexam.ae` was not registered as originally planned). Cloudflare Page Rule redirect from `voxexams.com` to `voxexam.com` is live. Status: Done.

**Microsoft SSO** — Replace or supplement current auth with Microsoft SSO. Status: Pending — not yet scoped.

**GitHub connection** — Connect Replit project to GitHub repository to enable Codex desktop app access and codebase backup. Status: Pending.

**Infrastructure fixes (done)** — `db:push` now runs fully non-interactively: unique constraint names in the database were renamed from `*_key` to `*_unique` to match Drizzle's expectations, removing the blocking prompts. The `/api/exams` 500 error caused by a schema/DB mismatch was fixed by applying the missing columns to the database. Status: Done.

### VoxScore Upgrade — Core Schema and Grading

**VoxScore schema upgrade** — Flat two-field grading replaced with a full VoxScoreProfile across all seven dimensions (D1–D7 with weights); 15 new nullable columns added to the submissions table; `evaluateWithAI` now returns a structured VoxScoreProfile; legacy `totalScore` retained for backwards compatibility on a 0–1 scale. Status: Done.

**Professor decision workflow** — Accept/Adjust/Override decision panel on every expanded submission in the professor dashboard, with reason text area, holistic impression score (1–10, official exams only), Save Decision button; new `PATCH /api/submissions/:id/decision` endpoint; columns came from the schema upgrade. Status: Done.

**Grading gap calculation and Arabic flag** — Grading-gap calculation and `arabicFlag` are implemented as part of the professor decision workflow (gap captured against the AI baseline, Arabic/Mixed answers flagged). Status: Done.

### Product Rebuild

**QuickVox repurpose** — Full rebuild as student self-study tool with login, topic sources, two-card mode selector, first-time flow, multi-question sessions, cross-question summary. Status: Pending.

**VoxClasses rebuild** — Rename, add VoxScore on all practice answers, full professor visibility, aggregate analytics, student VoxScore history, professor score adjustment. Status: Pending.

**VoxExam question builder upgrade** — Four-method builder, full benchmark package per question, conversational builder with professor review before publish, oral recreation from previous exam. Status: Active — partially built, significant additions pending.

**VoxLive (formerly public `/q/:code`)** — Rename, smart resolver, separate data collection, expiry, rate limiting, consent, post-session QuickVox CTA. Status: Pending.

### Platform Polish

**Platform-wide tooltip system** — Replace yellow bulb icon with hover tooltips on every feature. Status: Pending.

**Student VoxScore history and score trend view** — Improving, Stable, Declining per student per dimension. Status: Pending.

**Programme Director Dashboard** — Six MVP pages as specified above. Status: Pending — not yet designed for build.

**ASR pipeline upgrade** — Terminology layer, confidence gate, secondary ASR engine for official sessions. Status: Pending — Whisper remains in place for now.

---

## Hard Rules — Never Violated

- No proctoring on QuickVox or VoxClasses under any circumstances
- No graded transcript-impact scores without professor approval
- No AI-only final grades on anything that affects an official transcript
- No voice data stored without explicit consent flag
- No hardcoded API keys or secrets anywhere in the codebase
- No overselling — if something is broken or partial say so
- `evaluateWithAI` on the graded exam path is never to be modified by QuickVox or VoxClasses work — explicit permanent constraint
- `gpt-4o` for QuickVox and VoxClasses, `gpt-4o-mini` stays on graded exam path — never swap
- Professor always reviews and edits all AI-generated questions before publishing in VoxExam — no exceptions
- Nothing goes on the official student transcript without professor approval — no exceptions
- Override explanations are optional but actively encouraged — never a hard gate that blocks the override
- AI-only benchmark creation never permitted for official grading
- ASR must never silently determine VoxScore — low confidence triggers human review not automatic scoring
- Private QuickVox history never appears in any dashboard at any role level
- Programme director never edits student grades

---

## Open Questions — Resolved

All eight open questions from the previous version of this document have been answered and locked. They are incorporated throughout the relevant sections above.

---

## Concepts Still Being Shaped

- **VoxScore Discipline Modules** — agreed in principle, specific modules per faculty not yet designed
- **Arabic Terminology Calibration Set** — need identified, build process not yet designed
- **Fine-Tuned VoxScore Model** — long-term strategic direction agreed, timing and pipeline not yet designed. Candidate model: Qwen for Arabic language strength. MBZUAI Speech Lab identified as strategic partnership opportunity.
- **VoxScore Confidence Scoring in Prompts** — agreed in principle, exact prompt engineering approach not yet designed
- **Programme Director Dashboard Detail** — high-level structure locked, exact component design not yet built
- **MBZUAI Research Partnership** — identified as strategic opportunity, not yet initiated

---

## My Preferences

- Non-technical founder. I issue tasks to the Replit Agent — I do not write code directly. Explain what is happening and why, not just what to do.
- Plain, direct explanations. Step-by-step walkthroughs work well. No jargon dumps.
- Always put code inside a code block.
- Ship in small, revertible phases using established phase naming.
- After any Replit Agent task always include explicit verification steps — the Agent has repeatedly forgotten to run `npm run db:push` after schema changes.
- If proposing a feature give scope, risk, and recommendation then ask me to choose — do not just write code.
- Flag bugs, token costs, security risks, and UAE PDPL issues before they become problems.
- Do not claim something is done if a known sub-task is still failing.
