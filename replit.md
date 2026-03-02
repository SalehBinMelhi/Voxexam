# VoxExams - Oral Exam Management System

## Overview

VoxExams is a comprehensive web application designed for universities to manage and conduct oral examinations efficiently. It enables professors to create and schedule exams, utilize AI for contextual grading based on uploaded class materials, and provides students with a streamlined platform to take exams and receive immediate, dual AI-powered feedback on correctness and understanding. The project aims to modernize oral exam processes, reduce administrative overhead, and provide richer, more consistent student feedback through intelligent automation.

## User Preferences

*   I want iterative development.
*   I want all changes to be clearly communicated.
*   I prefer detailed explanations for complex technical decisions.
*   I like functional programming paradigms where they improve code clarity and maintainability.
*   I prefer the communication style to be professional yet approachable.
*   I expect the agent to ask for confirmation before implementing significant architectural changes or adding new external dependencies.
*   I want the agent to prioritize security and data privacy in all development aspects.
*   I prefer the agent to suggest improvements or alternative approaches, but always confirm with me before proceeding.
*   I prefer concise and clear language, avoiding jargon where simpler terms suffice.
*   I expect the agent to document all major changes and additions within the relevant codebase sections.

## System Architecture

The application is a full-stack web platform built with a React, TypeScript, Vite, TailwindCSS, and shadcn/ui frontend, and an Express.js backend utilizing a PostgreSQL database with Drizzle ORM. Authentication is handled via Replit Auth for professors and a custom local login system for students. Server state management leverages TanStack Query. AI grading and transcription capabilities are powered by OpenAI's GPT-4o-mini model, integrated through Replit AI Integrations.

**UI/UX Decisions:**
- Uses TailwindCSS and shadcn/ui for a modern, responsive, and accessible user interface.
- Features a clean, question-by-question interface for students taking exams.
- Dashboards are role-specific (professor/student) providing tailored functionalities and views.
- Student performance is visualized using Recharts for graphical representations (e.g., radar charts, line graphs).
- Interactive chat interface for AI question generation.

**Technical Implementations:**
- **Authentication:** Dual system: Replit OIDC for professors/admins, custom `studentId` + `examCode` login for students.
- **Database:** PostgreSQL with Drizzle ORM for type-safe schema definition and querying.
- **State Management:** TanStack Query for efficient server-side data fetching, caching, and synchronization.
- **AI Integration:** OpenAI GPT-4o-mini for dual scoring (correctness and understanding) and audio transcription.
- **File Processing:** `unpdf` and `pdf-parse` for PDF text extraction, direct parsing for TXT, MD, CSV, DOCX, PPTX, XLSX.
- **Audio Processing:** `ffmpeg` for converting audio formats (WebM/OGG to WAV) before transcription.
- **Proctoring:** Webcam and screen recording for exam integrity, recordings saved per submission.
- **Scalability:** Designed with a clear separation of frontend and backend concerns, and leveraging PostgreSQL for data storage.

**Feature Specifications:**
- **Exam Creation:** Professors can create exams with MCQ, short answer, and audio response questions, manually or via AI generation (with conversational AI assistance).
- **Class Management:** Professors can create and manage universities and classes, assign students, and upload class materials for AI context.
- **Student Exam Workflow:** Students can view assigned exams, take them, record audio responses, and receive immediate dual scores (correctness and understanding) with AI feedback.
- **Grading:** Dual AI grading provides both correctness and understanding scores. Manual override for professor adjustments.
- **Class Materials:** Upload and processing of various document types (PDF, TXT, MD, CSV, DOCX, PPTX, XLSX) to provide AI with contextual information for grading.
- **Performance Analytics:** Professors have access to student performance radar charts, score trends, and detailed submission breakdowns, including proctoring alerts.
- **Session Management:** Demo sessions are isolated using `demo_session_id` cookies.

## External Dependencies

-   **Frontend Framework:** React
-   **TypeScript:** Language for both frontend and backend
-   **Vite:** Frontend build tool
-   **TailwindCSS:** CSS framework for styling
-   **shadcn/ui:** UI component library
-   **Backend Framework:** Express.js
-   **Database:** PostgreSQL (e.g., Neon for hosting)
-   **ORM:** Drizzle ORM
-   **Authentication:** Replit Auth (for OIDC integration with Google, GitHub, Apple, email+password)
-   **AI Services:** OpenAI GPT-4o-mini (via Replit AI Integrations) for:
    -   AI Question Generation
    -   Dual AI Grading (correctness and understanding)
    -   Audio Transcription (gpt-4o-mini-transcribe)
-   **State Management Library:** TanStack Query
-   **PDF Parsing:** `unpdf`, `pdf-parse`
-   **Audio Processing:** `ffmpeg` (for client-side audio format conversion)
-   **Charting Library:** Recharts
-   **Validation:** Zod (for schema validation)