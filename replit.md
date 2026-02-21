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

- **Branding**: Renamed to VoxExams throughout the app
- **AI Question Generation**: Professors can generate exam questions from uploaded class materials using GPT-4o-mini
- **Custom OpenAI API Key**: Professors can link their university's OpenAI API key in Settings for both question generation and grading
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
