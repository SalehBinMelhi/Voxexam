# VoxExams - Oral Exam Management System

A comprehensive web application for conducting and managing university oral examinations. Professors can create and schedule exams with various question types, upload class materials for AI context, while students can take assigned exams and receive dual AI grading (correctness + understanding).

## Overview

This is a full-stack application built with:
- **Frontend**: React with TypeScript, Vite, TailwindCSS, and shadcn/ui components
- **Backend**: Express.js with PostgreSQL database (Drizzle ORM)
- **Authentication**: Replit Auth (Google, GitHub, Apple, email+password)
- **State Management**: TanStack Query for server state
- **AI Grading**: OpenAI GPT-4o-mini via Replit AI Integrations

## Features

### For Professors
- Create oral exams with multiple question types (MCQ, short answer, audio response)
- Schedule exams with start and end times (or leave unscheduled for immediate availability)
- Manage universities and classes
- Assign students to exams by typing names/emails directly
- View exam submissions and scores with grading method indicators
- Manually override AI scores
- Delete exams and classes

### For Students
- View assigned exams (active, upcoming, completed)
- Take active exams with a clean question-by-question interface
- Record audio responses with microphone
- Navigate between questions freely during the exam
- Receive immediate scoring upon submission
- View past exam scores

## Authentication

Users authenticate via Replit Auth (supports Google, GitHub, Apple, email+password). On first login, users select their role (professor or student) via a role selection page. The role is stored in the users table.

- `/api/login` - Redirects to Replit Auth login
- `/api/logout` - Logs out and redirects to home
- `/api/auth/user` - Returns current authenticated user

## Project Structure

```
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   │   ├── ui/       # shadcn/ui components
│   │   │   ├── create-exam-dialog.tsx
│   │   │   ├── exam-details-dialog.tsx
│   │   │   ├── take-exam-dialog.tsx
│   │   │   └── theme-toggle.tsx
│   │   ├── hooks/        # Custom hooks
│   │   │   ├── use-auth.ts    # Auth hook (useAuth)
│   │   │   └── use-toast.ts
│   │   ├── lib/          # Utilities
│   │   │   ├── auth-utils.ts  # Auth utility functions
│   │   │   └── queryClient.ts # TanStack Query setup
│   │   ├── pages/        # Page components
│   │   │   ├── landing.tsx            # Landing page (logged out)
│   │   │   ├── role-select.tsx        # Role selection (first login)
│   │   │   ├── professor-dashboard.tsx
│   │   │   └── student-dashboard.tsx
│   │   ├── App.tsx       # Main app with auth-based routing
│   │   └── index.css     # Global styles and theme
├── server/                # Backend Express application
│   ├── db.ts             # Database connection (Drizzle + Neon)
│   ├── routes.ts         # API route handlers
│   ├── storage.ts        # DatabaseStorage with AI grading logic
│   ├── index.ts          # Server entry point with auth setup
│   └── replit_integrations/  # Replit auth integration
│       └── auth.ts
├── shared/               # Shared code between frontend and backend
│   ├── schema.ts         # Drizzle schema + Zod schemas
│   └── models/
│       └── auth.ts       # Users and sessions tables
```

## API Endpoints

### Authentication
- `GET /api/auth/user` - Get current authenticated user
- `GET /api/login` - Redirect to Replit Auth
- `GET /api/logout` - Logout
- `PATCH /api/users/:id/role` - Set user role (professor/student)

### Users
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID

### Universities
- `GET /api/universities` - Get all universities
- `GET /api/universities/:id` - Get university by ID
- `POST /api/universities` - Create university

### Classes
- `GET /api/classes` - Get classes (filtered by role: professor sees own, student sees enrolled)
- `GET /api/classes/:id` - Get class by ID
- `POST /api/classes` - Create class (professor)
- `DELETE /api/classes/:id` - Delete class

### Enrollments
- `GET /api/classes/:classId/enrollments` - Get class enrollments
- `POST /api/classes/:classId/enroll` - Self-enroll student
- `POST /api/classes/:classId/enrollments` - Add student enrollment
- `DELETE /api/classes/:classId/enrollments/:studentId` - Remove enrollment

### Exams
- `GET /api/exams` - Get exams (filtered by role)
- `GET /api/exams/:id` - Get exam by ID
- `POST /api/exams` - Create a new exam
- `PATCH /api/exams/:id` - Update an exam
- `DELETE /api/exams/:id` - Delete an exam

### Submissions
- `GET /api/submissions` - Get submissions (filtered by role)
- `GET /api/submissions/:id` - Get submission by ID
- `POST /api/submissions` - Submit exam responses
- `PATCH /api/submissions/:id/score` - Manual score update

### Transcription
- `POST /api/transcribe` - Transcribe audio to text (live preview)

## Data Models

### User (shared/models/auth.ts)
- `id`: UUID primary key
- `email`: Unique email
- `firstName`, `lastName`: Name fields
- `profileImageUrl`: Avatar URL
- `role`: "professor" | "student" | null (set on first login)
- `universityId`: Optional university association

### University
- `id`: UUID, `name`: string, `domain`: optional string

### Class
- `id`: UUID, `name`: string, `universityId`: FK, `professorId`: FK

### Enrollment
- `id`: UUID, `studentId`: FK, `classId`: FK

### Exam
- `id`: UUID, `title`: string, `professorId`: FK, `classId`: optional FK
- `questions`: JSONB array of Question objects
- `startTime`, `endTime`: Optional ISO strings
- `assignedStudentIds`: JSONB string array
- `assignedStudentNames`: JSONB string array

### ExamSubmission
- `id`: UUID, `examId`: FK, `studentId`: FK
- `responses`: JSONB array of ExamResponse
- `scores`: JSONB object (questionId -> 0-1 score)
- `gradingMethods`: JSONB object (questionId -> "ai"|"exact"|"fallback"|"manual")
- `totalScore`: float, `submittedAt`: ISO string

## Class Materials

Professors can upload course materials (PDF, TXT, MD, CSV) per class. These materials are:
- Stored as extracted text in the `class_materials` table
- Passed as context to the AI grading prompt when evaluating student answers
- Truncated to 8000 chars if too long for the AI context window
- PDF text extraction via `pdf-parse`, text files read directly

## Grading Logic (Dual Scoring)

Each question receives TWO scores from the AI:
1. **Correctness Score** (0-100%): Is the answer factually correct?
2. **Understanding Score** (0-100%): Does the student demonstrate deep subject understanding?

This means a student might score high on correctness but low on understanding (e.g., memorized answer without explanation).

- **MCQ Questions**: Exact match (both scores are 1.0 or 0.0)
- **Short Answer**: AI dual evaluation using GPT-4o-mini with class materials context
- **Audio Questions**: Speech-to-text transcription + AI dual grading
  - Uses gpt-4o-mini-transcribe model via Replit AI Integrations for speech-to-text
  - Audio format auto-conversion via ffmpeg (WebM/OGG -> WAV) before transcription
  - Falls back to word overlap if AI fails

Scores stored in `submissions.scores` (correctness) and `submissions.understandingScores` (understanding).

## Development

The application runs on port 5000 with both frontend and backend served together via Vite's proxy setup.

```bash
npm run dev
```

## Recent Changes

- **Student Performance Radar**: Longitudinal student analytics feature for professors. Computes per-student metrics: avg correctness/understanding scores, per-question-type breakdowns (MCQ/short/audio), improvement trend (first 3 vs last 3 submissions), grading method distribution with fallback ratio, and integrity risk level based on proctoring flags. Two professor-only API endpoints: `GET /api/students/:id/performance-radar` (single student, all exams) and `GET /api/classes/:id/performance-radar` (all students in a class, filtered to class exams). On-demand SQL computation using optimized covering index `idx_submissions_student_radar`. Types defined in `shared/schema.ts` (StudentPerformanceRadar, QuestionTypeBreakdown, PerformanceTrend, etc.). Computation logic in `computeStudentRadar()` in `server/storage.ts`.
- **Conversational AI Question Generation**: Replaced single-shot AI generation with an interactive chat assistant. When professors click "AI Generate", a chat interface opens where the AI asks clarifying questions one at a time (how many questions, what type, topic focus, difficulty) before generating. Uses POST `/api/ai-question-chat` endpoint with full conversation history. Backend validates messages and caps at 30 exchanges.
- **Robust PDF Upload**: Uses `unpdf` (PDF.js-based) as primary parser with `pdf-parse` fallback for maximum compatibility
- **Student Detail Panel**: Clickable student names in class detail view open a full detail panel with performance graph (Recharts line chart, X=exam names, Y=grades, toggle Correctness/Understanding/Both), expandable submission cards with dual scores, grading methods, AI feedback, proctoring alerts, and video playback (screen recording main + webcam PiP overlay). New component: `client/src/components/student-detail-panel.tsx`.
- **Post-Creation Class Roster Management**: Professors can add/remove students from classes at any time via PATCH `/api/classes/:id/roster` endpoint. Class detail view has persistent "Add Student" input.
- **Create Exam Student Picker**: Collapsible dropdown panel in Create Exam dialog shows all class students (roster + enrolled) with checkboxes and Add All/Remove All.
- **Demo Login Session Isolation**: Each browser session gets unique demo professor/student pair via `demo_session_id` cookie; user list filtered by session.
- **Exam Proctoring**: Webcam and screen recording required before starting any exam (student or preview). Recordings saved per submission and accessible by professors.
- **Full Preview Pipeline**: Preview mode now runs the complete AI grading pipeline (submission, AI scoring, dual grading, feedback) — submissions flagged as preview and filtered from student results by default.
- **Exam Setup Gate**: New setup phase before exam starts requiring camera + screen share; exam starts only after both are active.
- **Dual Score Results View**: Results screen shows both correctness and understanding scores per question with AI feedback (strengths, weak points, recommendations).
- **Bulk Student Assignment**: Professors can add all enrolled class students to an exam with one click ("Add all class students" button)
- **Enhanced Results View**: Exam details show summary stats (avg correctness/understanding), expandable student submission cards with per-question scores, expected vs actual answers, and color-coded performance indicators
- **AI Feedback Per Submission**: Each submission gets AI-generated feedback with strengths, weak points, and study recommendations; auto-generated on submission and on-demand via "Generate Feedback" button
- **Branding**: Renamed to VoxExams throughout the app
- **AI Question Generation**: Professors can generate exam questions from uploaded class materials using GPT-4o-mini
- **University-level OpenAI API Key**: API key is now managed at the university level in Settings; all professors linked to the same university share the key for AI question generation and grading
- **AI Exam Instructions**: Professors can provide custom instructions (topic focus, difficulty, style) when generating AI questions
- **Enhanced Exam Creation**: Questions can be added manually or AI-generated; each question type (MCQ, short answer, audio) is selectable and editable inline
- **Expanded File Uploads**: Now supports .docx (Word), .pptx (PowerPoint), .xlsx/.xls (Excel) in addition to PDF/TXT/MD/CSV
- **Class Materials Upload**: Professors can upload course materials per class for AI grading context
- **Dual AI Grading**: Each answer receives both a correctness score and an understanding score
- **Major refactor**: Migrated from in-memory storage to PostgreSQL with Drizzle ORM
- **Authentication**: Replaced simple username/role login with Replit Auth (Google, GitHub, Apple, email+password)
- **University/Class hierarchy**: Added universities, classes, and enrollments tables
- AI-powered grading using OpenAI GPT-4o-mini for short answer and audio questions
- Audio transcription using gpt-4o-mini-transcribe with ffmpeg format conversion
- Manual grading override with grading method indicators
