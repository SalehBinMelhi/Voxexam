# Oral Exam Management System

A comprehensive web application for conducting and managing university oral examinations. Professors can create and schedule exams with various question types, while students can take assigned exams and receive automatic grading.

## Overview

This is a full-stack application built with:
- **Frontend**: React with TypeScript, Vite, TailwindCSS, and shadcn/ui components
- **Backend**: Express.js with in-memory storage
- **State Management**: TanStack Query for server state

## Features

### For Professors
- Create oral exams with multiple question types (MCQ, short answer, audio response)
- Schedule exams with start and end times (or leave unscheduled for immediate availability)
- Assign students to exams by selecting registered students or by typing names directly
- View exam submissions and scores
- Delete exams

### For Students
- View assigned exams (active, upcoming, completed)
- Take active exams with a clean question-by-question interface
- Navigate between questions freely during the exam
- Receive immediate scoring upon submission
- View past exam scores

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
│   │   ├── lib/          # Utilities and context
│   │   │   ├── auth-context.tsx  # Authentication context
│   │   │   └── queryClient.ts    # TanStack Query setup
│   │   ├── pages/        # Page components
│   │   │   ├── login.tsx
│   │   │   ├── professor-dashboard.tsx
│   │   │   └── student-dashboard.tsx
│   │   ├── App.tsx       # Main app component with routing
│   │   └── index.css     # Global styles and theme
├── server/                # Backend Express application
│   ├── routes.ts         # API route handlers
│   ├── storage.ts        # In-memory data storage
│   └── index.ts          # Server entry point
├── shared/               # Shared code between frontend and backend
│   └── schema.ts         # TypeScript types and Zod schemas
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with username and role

### Users
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID

### Exams
- `GET /api/exams` - Get all exams
- `GET /api/exams/:id` - Get exam by ID
- `POST /api/exams` - Create a new exam
- `PATCH /api/exams/:id` - Update an exam
- `DELETE /api/exams/:id` - Delete an exam

### Submissions
- `GET /api/submissions` - Get all submissions (supports ?examId and ?studentId filters)
- `GET /api/submissions/:id` - Get submission by ID
- `POST /api/submissions` - Submit exam responses

## Data Models

### User
- `id`: Unique identifier
- `username`: User's name
- `role`: "professor" or "student"

### Question
- `id`: Unique identifier
- `text`: Question content
- `type`: "mcq", "short", or "audio"
- `options`: Array of options (for MCQ)
- `correctAnswer`: Expected answer for grading

### Exam
- `id`: Unique identifier
- `title`: Exam name
- `professorId`: Creator's user ID
- `questions`: Array of questions
- `startTime`: ISO datetime string (optional - if not set, exam is immediately available)
- `endTime`: ISO datetime string (optional)
- `assignedStudentIds`: Array of student user IDs
- `assignedStudentNames`: Array of manually typed student names (matched case-insensitively)

### ExamSubmission
- `id`: Unique identifier
- `examId`: Associated exam
- `studentId`: Student who submitted
- `responses`: Array of question responses
- `scores`: Object mapping questionId to score (0-1)
- `totalScore`: Average of all scores (0-1)
- `submittedAt`: Submission timestamp

## Grading Logic

- **MCQ Questions**: Exact match comparison (case-insensitive) returns 1.0 for correct, 0.0 for incorrect
- **Short Answer/Audio**: Word overlap comparison - calculates percentage of expected answer words present in response

## Development

The application runs on port 5000 with both frontend and backend served together via Vite's proxy setup.

To start development:
```bash
npm run dev
```

## Recent Changes

- Initial implementation: Complete oral exam system with professor and student dashboards
- Support for three question types: MCQ, short answer, and audio (simulated as text)
- Automatic grading with word-match scoring for short answers
- Dark mode support with theme toggle
- Manual student assignment: Professors can type student names directly when creating exams, allowing exam access before students first log in
- Unscheduled exams are now immediately available to assigned students (shown as "Available" status)
- Audio questions now have microphone recording UI with start/stop/play/re-record controls
- Audio questions include a required text input for grading (text-based word matching)
- Submit Exam button is now visible on every question, not just the last one
