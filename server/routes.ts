import express from "express";
import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import os from "os";
import { Storage } from "@google-cloud/storage";
import { createHash, randomUUID } from "crypto";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

import { processLecturePdf } from "./pdf/pdf-service";
import { storage, transcribeAudio, generateQuestionsFromMaterials, aiQuestionChat, generateFeedback, analyzeProctoringScreenshot, analyzeProctoringPatterns, computeStudentRadar, logUserEvent, analyzePracticeMaterial, generatePracticeQuestions, generatePracticeProbe, generatePracticeMicroFeedback, buildPracticeReadinessReport } from "./storage";
import { isAuthenticated, isProfessor, isStudent } from "./auth";
import { db } from "./db";
import { classes, enrollments, exams, submissions, users } from "@shared/schema";
import { eq, and, or, sql } from "drizzle-orm";
import {
  analyzeLectureMaterial,
  evaluateAnswerAndGenerateAdaptiveNextQuestion,
  evaluateCompleteExamAttempt,
  evaluateOralAnswer,
  type ExamBlueprint,
  type ExamBlueprintConcept,
} from "./gemini";
import { insertExamSchema, insertExamSubmissionSchema, insertPracticeSessionSchema, TAB_SWITCH_SUSPICIOUS_THRESHOLD, type PracticeQuestion } from "@shared/schema";
import { z } from "zod";
import {
  buildImmediateAdaptiveDiagnosticReport,
  buildStudentExamSummary,
  buildStudentHistoryItem,
  canStudentAccessExam,
  dedupeAndSortStudentExams,
  hasStudentMembership,
  leaveStudentClassMembership,
  normalizeAccessCode,
  sanitizeExamForStudent,
  studentOwnsAttempt,
  validateAttemptLimit,
  validateExamCodeExpiry,
  validateExamWindow,
  validateNewAttemptCreation,
} from "./student-experience";

const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: parseInt(process.env.MAX_LECTURE_FILE_MB || "50", 10) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['application/pdf'];
    const ext = (file.originalname || "").toLowerCase();
    if (allowedMimeTypes.includes(file.mimetype) || ext.endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed types: PDF.`));
    }
  }
});

const recordingUpload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'audio/webm',
      'video/webm',
      'audio/mp4',
      'video/mp4',
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'video/ogg',
      'application/octet-stream' // sometimes sent by older browsers for media
    ];
    // Since some browsers don't send the exact mime type, we also check the extension or allow some generic ones
    if (allowedMimeTypes.includes(file.mimetype) || file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid media type: ${file.mimetype}. Only audio and video are allowed.`));
    }
  }
});

function getUserId(req: any): string {
  if (!req?.user) return "";
  return req.user.claims?.sub || req.user.id || req.user.sub || "";
}

const RECORDINGS_DIR = path.join(process.cwd(), "recordings");
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

// Resolve the bucket and object name for a proctoring recording stored in
// object storage under the private object dir's "recordings/" prefix.
function getRecordingObjectLocation(fileName: string): { bucketName: string; objectName: string } {
  const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!privateDir) {
    throw new Error(
      "PRIVATE_OBJECT_DIR not set. Object Storage must be configured to store recordings."
    );
  }
  const fullPath = `${privateDir.replace(/\/$/, "")}/recordings/${fileName}`;
  const normalized = fullPath.startsWith("/") ? fullPath : `/${fullPath}`;
  const parts = normalized.split("/");
  const bucketName = parts[1];
  const objectName = parts.slice(2).join("/");
  return { bucketName, objectName };
}

// Upload a proctoring recording buffer to local recordings folder. Returns void.
async function uploadRecordingToObjectStorage(fileName: string, buffer: Buffer): Promise<void> {
  if (process.env.GCS_BUCKET_NAME || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      const storage = new Storage();
      const bucketName = process.env.GCS_BUCKET_NAME || "voxexam-recordings";
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(fileName);
      await file.save(buffer, {
        metadata: { contentType: "video/webm" }
      });
      return;
    } catch (e) {
      console.error("GCS upload failed, falling back to temp dir:", e);
    }
  }

  // Fallback for local development if GCS is not configured.
  // Never write to the git working tree; write to a temp directory instead.
  const tempDir = path.join(os.tmpdir(), "voxexam-recordings");
  await fs.promises.mkdir(tempDir, { recursive: true });
  const filePath = path.join(tempDir, fileName);
  await fs.promises.writeFile(filePath, buffer);
}


declare global {
  namespace Express {
    interface User {
      claims: {
        sub: string;
        email?: string;
        first_name?: string;
        last_name?: string;
        profile_image_url?: string;
      };
      access_token?: string;
      refresh_token?: string;
      expires_at?: number;
    }
  }
}

function p(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : val || "";
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Users routes
  const sanitizeUser = (user: any) => {
    const {
      passwordHash: _passwordHash,
      openaiApiKey: _openaiApiKey,
      geminiApiKey: _geminiApiKey,
      ...safe
    } = user;
    return safe;
  };

  type StudentExamGrant = {
    examId: string;
    codeFingerprint: string;
    expiresAt: string | null;
  };

  const fingerprintAccessCode = (code: string): string => {
    return createHash("sha256").update(normalizeAccessCode(code)).digest("hex");
  };

  const getDirectExamGrants = (req: Request): StudentExamGrant[] => {
    const values = (req.session as any)?.studentExamGrants;
    if (!Array.isArray(values)) return [];
    return values.filter((value): value is StudentExamGrant => Boolean(
      value &&
      typeof value === "object" &&
      typeof value.examId === "string" &&
      typeof value.codeFingerprint === "string" &&
      (value.expiresAt === null || typeof value.expiresAt === "string"),
    ));
  };

  const hasValidDirectExamGrant = (
    req: Request,
    exam: Pick<typeof exams.$inferSelect, "id" | "publicExamCode" | "accessCode" | "accessCodeExpiresAt">,
    now = new Date(),
  ): boolean => {
    if (exam.accessCodeExpiresAt && exam.accessCodeExpiresAt.getTime() < now.getTime()) {
      return false;
    }
    const validFingerprints = new Set(
      [exam.publicExamCode, exam.accessCode]
        .map(normalizeAccessCode)
        .filter(Boolean)
        .map(fingerprintAccessCode),
    );
    if (validFingerprints.size === 0) return false;

    return getDirectExamGrants(req).some((grant) => {
      if (grant.examId !== exam.id || !validFingerprints.has(grant.codeFingerprint)) return false;
      if (!grant.expiresAt) return true;
      const expiresAt = new Date(grant.expiresAt).getTime();
      return Number.isFinite(expiresAt) && expiresAt >= now.getTime();
    });
  };

  const getValidDirectExamGrantIds = (
    req: Request,
    examRows: ReadonlyArray<typeof exams.$inferSelect>,
    now = new Date(),
  ): Set<string> => {
    return new Set(
      examRows.filter((exam) => hasValidDirectExamGrant(req, exam, now)).map((exam) => exam.id),
    );
  };

  const grantDirectExamAccess = (
    req: Request,
    exam: Pick<typeof exams.$inferSelect, "id" | "accessCodeExpiresAt">,
    normalizedCode: string,
  ): void => {
    const grants = getDirectExamGrants(req).filter((grant) => grant.examId !== exam.id);
    grants.push({
      examId: exam.id,
      codeFingerprint: fingerprintAccessCode(normalizedCode),
      expiresAt: exam.accessCodeExpiresAt?.toISOString() ?? null,
    });
    delete (req.session as any).studentExamGrantIds;
    (req.session as any).studentExamGrants = grants;
  };

  const professorDisplayName = (user: { firstName: string | null; lastName: string | null } | undefined): string | null => {
    if (!user) return null;
    return `${user.firstName || ""} ${user.lastName || ""}`.trim() || null;
  };

  const sanitizeClassForStudent = (cls: typeof classes.$inferSelect) => ({
    id: cls.id,
    subjectName: cls.subjectName,
    courseNumber: cls.courseNumber ?? null,
    sectionNumber: cls.sectionNumber ?? null,
    universityId: cls.universityId ?? null,
    professorId: cls.professorId ?? null,
    status: cls.status ?? null,
  });

  const getStudentMembershipContext = async (studentId: string) => {
    const membershipRows = (await storage.getEnrollmentsByStudent(studentId)).filter(
      (membership) => membership.status !== "inactive",
    );
    const classIds = new Set(membershipRows.map((membership) => membership.classId));
    return { membershipRows, classIds };
  };

  const studentCanAccessExam = async (req: Request, studentId: string, exam: typeof exams.$inferSelect) => {
    const { classIds } = await getStudentMembershipContext(studentId);
    const ownAttempts = await storage.getSubmissionsByStudent(studentId);
    // Attempt ownership permits resuming an active attempt, but a completed
    // direct-code attempt must not become permanent authorization for a later
    // attempt after the code expires or rotates.
    if (ownAttempts.some((attempt) => (
      attempt.examId === exam.id &&
      attempt.isPreview !== "true" &&
      attempt.status === "in_progress"
    ))) {
      return true;
    }
    return canStudentAccessExam({
      exam,
      examId: exam.id,
      studentId,
      enrolledClassIds: classIds,
      directGrantExamIds: hasValidDirectExamGrant(req, exam) ? new Set([exam.id]) : new Set(),
    });
  };

  const withStudentExamAttemptLock = async <T>(
    studentId: string,
    examId: string,
    operation: () => Promise<T>,
  ): Promise<T> => {
    return db.transaction(async (transaction) => {
      // Every attempt-creating path takes the same transaction-scoped lock before
      // recounting attempts. This closes the count-then-insert race without
      // changing the grading implementation.
      await transaction.execute(sql`
        select pg_advisory_xact_lock(hashtextextended(${`${studentId.length}:${studentId}:${examId}`}, 0))
      `);
      return operation();
    });
  };

  const classCodeBody = z.object({ classCode: z.string().trim().min(1).max(32) }).strict();
  const examCodeBody = z.object({ examCode: z.string().trim().min(1).max(32) }).strict();

  // Purpose-built student dashboard. Never return raw users, answer keys, or
  // unpublished grading fields to the student client.
  app.get("/api/student/dashboard", isStudent, async (req, res) => {
    try {
      const studentId = getUserId(req);
      const student = await storage.getUser(studentId);
      if (!student || student.role !== "student") {
        return res.status(403).json({ error: "Student access required." });
      }

      const { classIds } = await getStudentMembershipContext(studentId);
      const classRows = (await Promise.all(Array.from(classIds).map((id) => storage.getClass(id))))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      const attempts = (await storage.getSubmissionsByStudent(studentId)).filter(
        (attempt) => attempt.isPreview !== "true",
      );
      const attemptedExamIds = new Set(attempts.map((attempt) => attempt.examId));
      const inProgressExamIds = new Set(
        attempts.filter((attempt) => attempt.status === "in_progress").map((attempt) => attempt.examId),
      );
      const allExams = await storage.getAllExams();
      const directGrantExamIds = getValidDirectExamGrantIds(req, allExams);
      const dashboardExams = allExams.filter((exam) => {
        // Joined-class exams are loaded through the class-scoped endpoint so
        // they are not duplicated in the ungrouped dashboard list.
        if (exam.classId && classIds.has(exam.classId)) return false;

        const hasIndividualAccess = exam.assignedStudentIds.includes(studentId);
        const hasDirectAccess = directGrantExamIds.has(exam.id);
        const isOwnedInProgressFallback = inProgressExamIds.has(exam.id);
        if (!hasIndividualAccess && !hasDirectAccess && !isOwnedInProgressFallback) return false;
        if (exam.archivedAt && !isOwnedInProgressFallback) return false;
        return exam.status !== "draft" || isOwnedInProgressFallback;
      });
      const historyExams = allExams.filter((exam) => attemptedExamIds.has(exam.id));

      // Keep the enrolled-class list separate from class metadata used by direct
      // exam-code attempts and historical attempts. A student may legitimately
      // have an exam record without a current class membership.
      const memberClassById = new Map(classRows.map((cls) => [cls.id, cls]));
      const metadataExams = Array.from(
        new Map([...dashboardExams, ...historyExams].map((exam) => [exam.id, exam])).values(),
      );
      const additionalClassIds = Array.from(new Set(
        metadataExams
          .map((exam) => exam.classId)
          .filter((classId): classId is string => typeof classId === "string" && !memberClassById.has(classId)),
      ));
      const additionalClassRows = (await Promise.all(
        additionalClassIds.map((id) => storage.getClass(id)),
      )).filter((item): item is NonNullable<typeof item> => Boolean(item));
      const classById = new Map(
        [...classRows, ...additionalClassRows].map((cls) => [cls.id, cls]),
      );

      const professorIds = new Set<string>();
      for (const cls of classRows) if (cls.professorId) professorIds.add(cls.professorId);
      for (const exam of metadataExams) professorIds.add(exam.professorId);
      const professorRows = await Promise.all(Array.from(professorIds).map((id) => storage.getUser(id)));
      const professorNames = new Map<string, string | null>();
      professorRows.forEach((professor, index) => {
        professorNames.set(Array.from(professorIds)[index], professorDisplayName(professor));
      });

      const classSummaries = classRows.map((cls) => ({
        id: cls.id,
        name: cls.subjectName,
        courseNumber: cls.courseNumber ?? null,
        sectionNumber: cls.sectionNumber ?? null,
        professorName: cls.professorId ? professorNames.get(cls.professorId) ?? null : null,
      }));

      const examSummaries = dedupeAndSortStudentExams(
        dashboardExams.map((exam) => {
          const cls = exam.classId ? classById.get(exam.classId) : undefined;
          return buildStudentExamSummary({
            exam,
            attempts: attempts.filter((attempt) => attempt.examId === exam.id),
            className: cls?.subjectName ?? null,
            professorName: professorNames.get(exam.professorId) ?? null,
          });
        }),
      );

      const examById = new Map(historyExams.map((exam) => [exam.id, exam]));
      const history = attempts
        .filter((attempt) => attempt.status !== "in_progress")
        .map((attempt) => {
          const exam = examById.get(attempt.examId);
          if (!exam) return null;
          const cls = exam.classId ? classById.get(exam.classId) : undefined;
          return buildStudentHistoryItem({
            submission: attempt,
            exam,
            className: cls?.subjectName ?? null,
            professorName: professorNames.get(exam.professorId) ?? null,
          });
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

      return res.json({
        data: {
          student: {
            id: student.id,
            email: student.email || "",
            displayName: `${student.firstName || ""} ${student.lastName || ""}`.trim() || "Student",
          },
          classes: classSummaries,
          exams: examSummaries,
          history,
        },
      });
    } catch (error) {
      console.error("Student dashboard query failed");
      return res.status(500).json({ error: "Failed to load the student dashboard." });
    }
  });

  app.post("/api/student/classes/join", isStudent, async (req, res) => {
    try {
      const parsed = classCodeBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "A valid Class Code is required." });
      const classCode = normalizeAccessCode(parsed.data.classCode);
      const [cls] = await db
        .select()
        .from(classes)
        .where(sql`upper(${classes.classCode}) = ${classCode}`);
      if (!cls || cls.status !== "active") {
        return res.status(404).json({ error: "Invalid Class Code." });
      }

      const studentId = getUserId(req);
      const student = await storage.getUser(studentId);
      if (!student || student.role !== "student") return res.status(403).json({ error: "Student access required." });
      const studentMemberships = await storage.getEnrollmentsByStudent(studentId);
      const existing = studentMemberships.find(
        (membership) => membership.classId === cls.id,
      );
      let alreadyJoined = hasStudentMembership(studentMemberships, cls.id);
      if (existing) {
        if (existing.status === "inactive") {
          await db.update(enrollments).set({ status: "active", updatedAt: new Date() }).where(eq(enrollments.id, existing.id));
        }
      } else {
        try {
          await storage.createEnrollment({
            studentId,
            classId: cls.id,
            displayName: `${student.firstName || ""} ${student.lastName || ""}`.trim() || "Student",
            status: "active",
          });
        } catch (error: any) {
          if (error?.code !== "23505") throw error;
          alreadyJoined = true;
        }
      }

      const professor = cls.professorId ? await storage.getUser(cls.professorId) : undefined;
      return res.status(alreadyJoined ? 200 : 201).json({
        data: {
          alreadyJoined,
          message: alreadyJoined ? "You are already a member of this class." : "Class joined successfully.",
          class: {
            id: cls.id,
            name: cls.subjectName,
            courseNumber: cls.courseNumber ?? null,
            sectionNumber: cls.sectionNumber ?? null,
            professorName: professorDisplayName(professor),
          },
        },
      });
    } catch (error) {
      console.error("Student class join failed");
      return res.status(500).json({ error: "Unable to join this class right now." });
    }
  });

  app.delete("/api/student/classes/:classId/membership", isStudent, async (req, res) => {
    try {
      const studentId = getUserId(req);
      const classId = p(req.params.classId);
      const deleted = await leaveStudentClassMembership({
        authenticatedStudentId: studentId,
        classId,
        deleteEnrollment: (ownedStudentId, ownedClassId) => (
          storage.deleteEnrollment(ownedStudentId, ownedClassId)
        ),
      });
      if (!deleted) {
        return res.status(404).json({ error: "Class membership not found." });
      }
      return res.json({
        data: {
          classId,
          message: "You have left the class.",
        },
      });
    } catch {
      return res.status(500).json({ error: "Unable to leave this class right now." });
    }
  });

  app.get("/api/student/classes/:classId/exams", isStudent, async (req, res) => {
    try {
      const studentId = getUserId(req);
      const classId = p(req.params.classId);
      const memberships = await storage.getEnrollmentsByStudent(studentId);
      if (!hasStudentMembership(memberships, classId)) {
        return res.status(403).json({ error: "You are not an active member of this class." });
      }

      const cls = await storage.getClass(classId);
      if (!cls) return res.status(404).json({ error: "Class not found." });

      const attempts = (await storage.getSubmissionsByStudent(studentId)).filter(
        (attempt) => attempt.isPreview !== "true",
      );
      const attemptedExamIds = new Set(attempts.map((attempt) => attempt.examId));
      const classExams = (await storage.getExamsByClass(classId)).filter((exam) => (
        (!exam.archivedAt && exam.status !== "draft") || attemptedExamIds.has(exam.id)
      ));
      const professorIds = Array.from(new Set(classExams.map((exam) => exam.professorId)));
      const professorRows = await Promise.all(professorIds.map((id) => storage.getUser(id)));
      const professorNames = new Map<string, string | null>();
      professorRows.forEach((professor, index) => {
        professorNames.set(professorIds[index], professorDisplayName(professor));
      });
      const examSummaries = dedupeAndSortStudentExams(classExams.map((exam) => (
        buildStudentExamSummary({
          exam,
          attempts: attempts.filter((attempt) => attempt.examId === exam.id),
          className: cls.subjectName,
          professorName: professorNames.get(exam.professorId) ?? null,
        })
      )));

      return res.json({ data: { classId, exams: examSummaries } });
    } catch {
      return res.status(500).json({ error: "Failed to load class exams." });
    }
  });

  app.post("/api/student/exams/join", isStudent, async (req, res) => {
    try {
      const parsed = examCodeBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "A valid Exam Code is required." });
      const examCode = normalizeAccessCode(parsed.data.examCode);
      const [exam] = await db
        .select()
        .from(exams)
        .where(or(
          sql`upper(${exams.publicExamCode}) = ${examCode}`,
          sql`upper(${exams.accessCode}) = ${examCode}`,
        ));
      if (!exam) return res.status(404).json({ error: "Invalid exam code." });

      const now = new Date();
      const codeExpiry = validateExamCodeExpiry(exam, now);
      if (!codeExpiry.allowed) return res.status(codeExpiry.status).json({ error: codeExpiry.error });
      const window = validateExamWindow(exam, now);
      if (!window.allowed) return res.status(window.status).json({ error: window.error });
      if (exam.mode === "adaptive" && !exam.blueprint) {
        return res.status(403).json({ error: "This exam is not ready yet." });
      }

      const studentId = getUserId(req);
      const attempts = (await storage.getSubmissionsByStudent(studentId)).filter(
        (attempt) => attempt.examId === exam.id && attempt.isPreview !== "true",
      );
      const attemptLimit = validateAttemptLimit(exam, attempts);
      if (!attemptLimit.allowed) {
        const message = (exam.maxAttempts ?? 1) === 1 && attempts.some((attempt) => attempt.status !== "in_progress")
          ? "You have already completed this exam."
          : attemptLimit.error;
        return res.status(attemptLimit.status).json({ error: message });
      }

      grantDirectExamAccess(req, exam, examCode);
      const cls = exam.classId ? await storage.getClass(exam.classId) : undefined;
      const professor = await storage.getUser(exam.professorId);
      const summary = buildStudentExamSummary({
        exam,
        attempts,
        className: cls?.subjectName ?? null,
        professorName: professorDisplayName(professor),
        now,
      });
      return res.json({ data: { message: "Exam access confirmed.", exam: summary } });
    } catch (error) {
      console.error("Student exam code join failed");
      return res.status(500).json({ error: "Unable to access this exam right now." });
    }
  });

  app.get("/api/student/exams/:id", isStudent, async (req, res) => {
    try {
      const studentId = getUserId(req);
      const exam = await storage.getExam(p(req.params.id));
      if (!exam) return res.status(404).json({ error: "Exam not found." });
      if (!(await studentCanAccessExam(req, studentId, exam))) {
        return res.status(403).json({ error: "You do not have permission to access this exam." });
      }
      const window = validateExamWindow(exam);
      if (!window.allowed) return res.status(window.status).json({ error: window.error });
      const attempts = (await storage.getSubmissionsByStudent(studentId)).filter(
        (attempt) => attempt.examId === exam.id && attempt.isPreview !== "true",
      );
      const attemptLimit = validateAttemptLimit(exam, attempts);
      if (!attemptLimit.allowed) return res.status(attemptLimit.status).json({ error: attemptLimit.error });
      const inProgress = attempts.find((attempt) => attempt.status === "in_progress");
      return res.json({ data: { exam: sanitizeExamForStudent(exam), attemptId: inProgress?.id ?? null } });
    } catch (error) {
      return res.status(500).json({ error: "Failed to open this exam." });
    }
  });

  app.get("/api/student/results/:attemptId", isStudent, async (req, res) => {
    try {
      const studentId = getUserId(req);
      const attempt = await storage.getSubmission(p(req.params.attemptId));
      if (!attempt || !studentOwnsAttempt(studentId, attempt)) {
        return res.status(404).json({ error: "Result not found." });
      }
      const exam = await storage.getExam(attempt.examId);
      if (!exam) return res.status(404).json({ error: "Exam not found." });
      const cls = exam.classId ? await storage.getClass(exam.classId) : undefined;
      const professor = await storage.getUser(exam.professorId);
      return res.json({
        data: buildStudentHistoryItem({
          submission: attempt,
          exam,
          className: cls?.subjectName ?? null,
          professorName: professorDisplayName(professor),
        }),
      });
    } catch (error) {
      return res.status(500).json({ error: "Failed to load this result." });
    }
  });

  // =========================================================================
  // GOOGLE GEMINI ADAPTIVE ORAL EXAM ROUTES
  // =========================================================================

  // 1. Create Exam (Doctor)
  app.post("/api/adaptive-exams", isProfessor, async (req, res) => {
    try {
      const sessUser = req.user as any;
      const professorId = sessUser?.claims?.sub || sessUser?.id || "demo-doctor";
      const {
        title,
        description,
        subjectName,
        maxQuestions = 10,
        maxFollowUpsPerConcept = 2,
        durationMinutes = 30,
        passingScore = 60,
        showFinalScoreImmediately = true,
      } = req.body;

      if (!title || typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ error: "Exam title is required" });
      }

      const accessCode = Math.floor(10000 + Math.random() * 90000).toString();

      const [newExam] = await db.insert(exams).values({
        title: title.trim(),
        description: description?.trim() || "",
        subjectName: subjectName?.trim() || "",
        professorId,
        questions: [],
        maxQuestions: Number(maxQuestions) || 10,
        maxFollowUpsPerConcept: Number(maxFollowUpsPerConcept) || 2,
        durationMinutes: Number(durationMinutes) || 30,
        passingScore: Number(passingScore) || 60,
        showFinalScoreImmediately: Boolean(showFinalScoreImmediately),
        accessCode,
        status: "draft",
        mode: "adaptive",
      }).returning();

      res.json(newExam);
    } catch (error: any) {
      console.error("Create adaptive exam error:", error);
      res.status(500).json({ error: "Failed to create exam: " + error.message });
    }
  });

  // 2. Upload Material & Generate Gemini Blueprint (Doctor)
  app.post("/api/adaptive-exams/:id/upload-material", isProfessor, upload.array("materials", 1), async (req, res) => {
    try {
      const examId = p(req.params.id);
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No PDF file uploaded" });
      }

      const file = files[0];
      const result = await processLecturePdf(file.buffer, file.originalname);

      // Save material & blueprint to exam
      const [updatedExam] = await db.update(exams).set({
        blueprint: result.blueprint as any,
        materialSummary: result.blueprint.summary,
        subjectName: result.blueprint.courseName || undefined,
        processingMethod: result.processingMethod,
        pageCount: result.pageCount,
        processingStatus: "success",
        status: "active",
      }).where(eq(exams.id, examId)).returning();

      res.json({ success: true, blueprint: result.blueprint, exam: updatedExam });
    } catch (error: any) {
      console.error("Material analysis error:", error);
      res.status(500).json({ error: "Material analysis failed: " + error.message });
    }
  });

  // 3. Edit Blueprint & Publish Exam (Doctor)
  app.put("/api/adaptive-exams/:id/blueprint", isProfessor, async (req, res) => {
    try {
      const examId = p(req.params.id);
      const { blueprint, status = "active", maxQuestions, maxFollowUpsPerConcept, durationMinutes } = req.body;

      const [updatedExam] = await db.update(exams).set({
        blueprint: blueprint as any,
        status,
        ...(maxQuestions ? { maxQuestions: Number(maxQuestions) } : {}),
        ...(maxFollowUpsPerConcept ? { maxFollowUpsPerConcept: Number(maxFollowUpsPerConcept) } : {}),
        ...(durationMinutes ? { durationMinutes: Number(durationMinutes) } : {}),
      }).where(eq(exams.id, examId)).returning();

      res.json(updatedExam);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to update blueprint" });
    }
  });

  // 4. Validate Student Access Code (Student)
  app.post("/api/student/validate-code", isStudent, async (req, res) => {
    try {
      const { accessCode } = req.body;
      if (!accessCode || typeof accessCode !== "string") {
        return res.status(400).json({ error: "Access code is required" });
      }

      const cleanCode = normalizeAccessCode(accessCode);
      const [rawExam] = await db
        .select()
        .from(exams)
        .where(or(
          sql`upper(${exams.publicExamCode}) = ${cleanCode}`,
          sql`upper(${exams.accessCode}) = ${cleanCode}`,
        ));

      if (!rawExam) {
        return res.status(404).json({ error: "Invalid exam code. Please check with your professor." });
      }

      const exam = await storage.getExam(rawExam.id);
      
      if (!exam) {
        return res.status(404).json({ error: "Exam data could not be retrieved." });
      }

      if (exam.status === "inactive" || exam.status === "draft") {
        return res.status(403).json({ error: "This exam is not active." });
      }

      const window = validateExamWindow(exam);
      if (!window.allowed) {
        return res.status(window.status).json({ error: window.error });
      }

      if (exam.mode === "adaptive" && !exam.blueprint) {
        return res.status(403).json({ error: "This adaptive exam is incomplete (missing blueprint). Please check with your professor." });
      }

      const codeExpiry = validateExamCodeExpiry(exam);
      if (!codeExpiry.allowed) return res.status(codeExpiry.status).json({ error: codeExpiry.error });

      const studentId = getUserId(req);
      const attempts = (await storage.getSubmissionsByStudent(studentId)).filter(
        (attempt) => attempt.examId === exam.id && attempt.isPreview !== "true",
      );
      const attemptLimit = validateAttemptLimit(exam, attempts);
      if (!attemptLimit.allowed) {
        return res.status(attemptLimit.status).json({ error: attemptLimit.error });
      }
      grantDirectExamAccess(req, exam, cleanCode);

      res.json({
        valid: true,
        examId: exam.id,
        title: exam.title,
        description: exam.description,
        subjectName: exam.subjectName,
        maxQuestions: exam.maxQuestions,
        durationMinutes: exam.durationMinutes,
        showFinalScoreImmediately: exam.showFinalScoreImmediately,
        mode: exam.mode,
      });
    } catch (error: any) {
      res.status(500).json({ error: "Validation failed" });
    }
  });

  // 5. Start Adaptive Exam Attempt (Student)
  app.post("/api/adaptive-attempts/start", isStudent, async (req, res) => {
    try {
      const { examId } = req.body;
      const studentId = getUserId(req);
      if (!examId || typeof examId !== "string") {
        return res.status(400).json({ error: "Exam ID is required" });
      }
      const exam = await storage.getExam(examId);

      if (!exam || exam.mode !== "adaptive" || !exam.blueprint) {
        return res.status(404).json({ error: "Exam or exam blueprint not found" });
      }
      if (!(await studentCanAccessExam(req, studentId, exam))) {
        return res.status(403).json({ error: "You do not have permission to access this exam." });
      }
      const window = validateExamWindow(exam);
      if (!window.allowed) return res.status(window.status).json({ error: window.error });

      const startResult = await withStudentExamAttemptLock(studentId, exam.id, async () => {
        const existingAttempts = (await storage.getSubmissionsByStudent(studentId)).filter(
          (attempt) => attempt.examId === exam.id && attempt.isPreview !== "true",
        );
        const inProgress = existingAttempts.find((attempt) => attempt.status === "in_progress");
        if (inProgress) {
          const logs = (inProgress.questionLogs as any[]) || [];
          const currentLog = logs[logs.length - 1];
          return {
            ok: true,
            data: {
              attemptId: inProgress.id,
              examTitle: exam.title,
              currentQuestion: currentLog?.question || "",
              questionNumber: logs.length || 1,
              totalQuestions: exam.maxQuestions || 10,
              conceptTitle: currentLog?.conceptTitle || "",
              resumed: true,
            },
          } as const;
        }

        const attemptLimit = validateAttemptLimit(exam, existingAttempts);
        if (!attemptLimit.allowed) {
          return {
            ok: false,
            status: attemptLimit.status,
            error: attemptLimit.error || "You have used all allowed attempts.",
          } as const;
        }

        const blueprint = exam.blueprint as ExamBlueprint;
        const firstConcept = blueprint.topics?.[0]?.concepts?.[0];
        if (!firstConcept) {
          return {
            ok: false,
            status: 400,
            error: "No concepts available in this exam blueprint",
          } as const;
        }

        const initialQuestion = firstConcept.suggestedInitialQuestion || `Explain the key ideas of ${firstConcept.title}.`;
        const initialAdaptiveState = {
          currentTopicIndex: 0,
          currentConceptIndex: 0,
          currentConceptId: firstConcept.id,
          currentConceptTitle: firstConcept.title,
          followUpCountForConcept: 0,
          totalQuestionsAsked: 1,
          conceptCoverageMap: {},
        };
        const initialQuestionLog = {
          questionIndex: 1,
          conceptId: firstConcept.id,
          conceptTitle: firstConcept.title,
          question: initialQuestion,
          createdAt: new Date().toISOString(),
        };

        const [attempt] = await db.insert(submissions).values({
          examId,
          studentId,
          startedAt: new Date(),
          status: "in_progress",
          currentConceptIndex: 0,
          adaptiveState: initialAdaptiveState as any,
          questionLogs: [initialQuestionLog] as any,
          responses: [],
          scores: {},
          totalScore: 0,
          submittedAt: new Date().toISOString(),
        }).returning();

        return {
          ok: true,
          data: {
            attemptId: attempt.id,
            examTitle: exam.title,
            currentQuestion: initialQuestion,
            questionNumber: 1,
            totalQuestions: exam.maxQuestions || 10,
            conceptTitle: firstConcept.title,
          },
        } as const;
      });

      if (!startResult.ok) {
        return res.status(startResult.status).json({ error: startResult.error });
      }
      return res.json(startResult.data);
    } catch {
      console.error("Adaptive attempt start failed");
      return res.status(500).json({ error: "Failed to start exam attempt." });
    }
  });

  // 6. Submit Audio/Text Answer & Get Next Adaptive Question (Student)
  app.post("/api/adaptive-attempts/:id/answer", isStudent, recordingUpload.single("audio"), async (req, res) => {
    try {
      const attemptId = p(req.params.id);
      const { transcriptText } = req.body;
      const file = req.file;

      const [attempt] = await db.select().from(submissions).where(eq(submissions.id, attemptId));
      if (!attempt) {
        return res.status(404).json({ error: "Exam attempt not found" });
      }

      const studentId = getUserId(req);
      if (!studentOwnsAttempt(studentId, attempt)) {
        return res.status(403).json({ error: "You do not have permission to modify this attempt." });
      }

      if (attempt.status === "completed") {
        return res.status(400).json({ error: "Exam attempt is already completed" });
      }

      const exam = await storage.getExam(attempt.examId);
      if (!exam || !exam.blueprint) {
        return res.status(404).json({ error: "Exam definition not found" });
      }
      const window = validateExamWindow(exam);
      if (!window.allowed) {
        return res.status(window.status).json({ error: window.error });
      }

      const blueprint = exam.blueprint as ExamBlueprint;
      const originalLogs = Array.isArray(attempt.questionLogs)
        ? structuredClone(attempt.questionLogs as any[])
        : [];
      const logs = structuredClone(originalLogs);
      const currentLog = logs[logs.length - 1];

      if (!currentLog) {
        return res.status(400).json({ error: "No active question found in attempt log" });
      }

      let targetConcept: ExamBlueprintConcept | null = null;
      for (const topic of blueprint.topics || []) {
        for (const concept of topic.concepts || []) {
          if (concept.id === currentLog.conceptId || concept.title === currentLog.conceptTitle) {
            targetConcept = concept;
            break;
          }
        }
        if (targetConcept) break;
      }

      if (!targetConcept && blueprint.topics?.[0]?.concepts?.[0]) {
        targetConcept = blueprint.topics[0].concepts[0];
      }

      let audioBase64: string | undefined;
      let mimeType: string | undefined;

      if (file) {
        audioBase64 = file.buffer.toString("base64");
        mimeType = file.mimetype || "audio/webm";
      }

      const state = (attempt.adaptiveState as any) || {};
      const followUpCount = state.followUpCountForConcept || 0;
      const totalAsked = logs.length;
      const maxQ = exam.maxQuestions || 10;
      const maxF = exam.maxFollowUpsPerConcept || 2;

      // Evaluate answer and generate next adaptive question using Google Gemini
      const evalResult = await evaluateAnswerAndGenerateAdaptiveNextQuestion({
        blueprint,
        currentConcept: targetConcept!,
        currentQuestion: currentLog.question,
        studentAudioBase64: audioBase64,
        audioMimeType: mimeType,
        studentTranscriptText: transcriptText || undefined,
        previousLogs: logs.map(l => ({
          question: l.question,
          conceptId: l.conceptId,
          transcript: l.transcript || "",
          coveredPoints: l.coveredKeyPoints || [],
          missingPoints: l.missingKeyPoints || [],
          misconceptions: l.misconceptions || [],
          score: l.score || 0,
        })),
        followUpCountForConcept: followUpCount,
        maxFollowUpsPerConcept: maxF,
        totalQuestionsAsked: totalAsked,
        maxQuestions: maxQ,
      });

      currentLog.transcript = evalResult.transcript;
      currentLog.answerSummary = evalResult.answerSummary;
      currentLog.coveredKeyPoints = evalResult.coveredKeyPoints;
      currentLog.missingKeyPoints = evalResult.missingKeyPoints;
      currentLog.misconceptions = evalResult.misconceptions;
      currentLog.score = evalResult.score;
      currentLog.correctness = evalResult.correctness;
      currentLog.studentFeedback = evalResult.studentFeedback;
      if (audioBase64) {
        currentLog.audioBase64 = audioBase64;
      }

      let isFinished = false;
      let nextQuestionText: string | null = null;
      let nextConcept: ExamBlueprintConcept | null = null;

      if (totalAsked >= maxQ || evalResult.nextAction === "finish_exam") {
        isFinished = true;
      } else if (evalResult.nextAction === "follow_up" || evalResult.nextAction === "clarify" || evalResult.nextAction === "simplify") {
        nextQuestionText = evalResult.nextQuestion || `Could you elaborate further on ${targetConcept?.title}?`;
        nextConcept = targetConcept;
        state.followUpCountForConcept = followUpCount + 1;
      } else {
        state.followUpCountForConcept = 0;
        let foundCurrent = false;
        for (const topic of blueprint.topics || []) {
          for (const concept of topic.concepts || []) {
            if (foundCurrent) {
              nextConcept = concept;
              break;
            }
            if (concept.id === targetConcept?.id) {
              foundCurrent = true;
            }
          }
          if (nextConcept) break;
        }

        if (!nextConcept) {
          isFinished = true;
        } else {
          nextQuestionText = evalResult.nextQuestion || nextConcept.suggestedInitialQuestion || `Explain ${nextConcept.title}.`;
        }
      }

      if (!isFinished && nextQuestionText && nextConcept) {
        const nextLog = {
          questionIndex: logs.length + 1,
          conceptId: nextConcept.id,
          conceptTitle: nextConcept.title,
          question: nextQuestionText,
          createdAt: new Date().toISOString(),
        };
        logs.push(nextLog);
        state.currentConceptId = nextConcept.id;
        state.currentConceptTitle = nextConcept.title;
      }

      if (isFinished) {
        const finalReport = await evaluateCompleteExamAttempt({
          blueprint,
          attemptLogs: logs.map(l => ({
            question: l.question,
            conceptTitle: l.conceptTitle,
            transcript: l.transcript || "",
            coveredPoints: l.coveredKeyPoints || [],
            missingPoints: l.missingKeyPoints || [],
            misconceptions: l.misconceptions || [],
            score: l.score || 0,
          })),
        });

        const [finalAttempt] = await db.update(submissions).set({
          status: "completed",
          questionLogs: logs as any,
          adaptiveState: state as any,
          finalScore: finalReport.finalScore,
          totalScore: finalReport.finalScore,
          topicScores: finalReport.topicScores as any,
          strengths: finalReport.strengths as any,
          weaknesses: finalReport.weaknesses as any,
          missingConcepts: finalReport.missingConcepts as any,
          misconceptions: finalReport.misconceptions as any,
          recommendations: finalReport.recommendations as any,
          futureSuggestions: finalReport.futureSuggestions as any,
          submittedAt: new Date().toISOString(),
        }).where(and(
          eq(submissions.id, attemptId),
          eq(submissions.status, "in_progress"),
          eq(submissions.questionLogs, originalLogs),
        )).returning();

        if (!finalAttempt) {
          return res.status(409).json({
            error: "This answer was already processed. Reopen the exam to continue from the latest question.",
          });
        }

        const immediateReport = buildImmediateAdaptiveDiagnosticReport({
          exam,
          attempt: finalAttempt,
        });

        return res.json({
          isFinished: true,
          status: "pending_review",
          attempt: {
            id: finalAttempt.id,
            status: finalAttempt.status,
            submittedAt: finalAttempt.submittedAt,
          },
          ...(immediateReport ? { report: immediateReport } : {}),
        });
      } else {
        const [updatedAttempt] = await db.update(submissions).set({
          questionLogs: logs as any,
          adaptiveState: state as any,
        }).where(and(
          eq(submissions.id, attemptId),
          eq(submissions.status, "in_progress"),
          eq(submissions.questionLogs, originalLogs),
        )).returning();

        if (!updatedAttempt) {
          return res.status(409).json({
            error: "This answer was already processed. Reopen the exam to continue from the latest question.",
          });
        }

        return res.json({
          isFinished: false,
          nextQuestion: nextQuestionText,
          questionNumber: logs.length,
          totalQuestions: maxQ,
          conceptTitle: nextConcept?.title,
        });
      }
    } catch {
      console.error("Adaptive answer submission failed");
      return res.status(500).json({ error: "Failed to evaluate this answer." });
    }
  });

  // 7. Get Attempt State or Diagnostic Report (Student / Doctor)
  app.get("/api/adaptive-attempts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const attemptId = p(req.params.id);
      const [attempt] = await db.select().from(submissions).where(eq(submissions.id, attemptId));
      if (!attempt) {
        return res.status(404).json({ error: "Attempt not found" });
      }
      const exam = await storage.getExam(attempt.examId);
      
      if (attempt.studentId !== userId && (!exam || exam.professorId !== userId)) {
        return res.status(403).json({ error: "Not authorized to view this attempt" });
      }
      const currentUser = await storage.getUser(userId);
      if (attempt.studentId === userId && currentUser?.role === "student") {
        const logs = (attempt.questionLogs as any[]) || [];
        const currentLog = logs[logs.length - 1];
        return res.json({
          attempt: {
            id: attempt.id,
            status: attempt.status,
            submittedAt: attempt.submittedAt,
          },
          exam: exam ? sanitizeExamForStudent(exam) : null,
          currentQuestion: attempt.status === "in_progress" ? currentLog?.question || "" : null,
          questionNumber: logs.length || 1,
          totalQuestions: exam?.maxQuestions || 10,
          conceptTitle: attempt.status === "in_progress" ? currentLog?.conceptTitle || "" : null,
          resultStatus: attempt.status === "completed" && attempt.professorDecision
            ? "published"
            : "pending_review",
        });
      }

      return res.json({ attempt, exam });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch attempt" });
    }
  });

  // 8. Doctor Score Override Endpoint (Doctor)
  app.post("/api/adaptive-attempts/:id/override", isProfessor, async (req, res) => {
    try {
      const attemptId = p(req.params.id);
      const sessUser = req.user as any;
      const doctorId = sessUser?.claims?.sub || sessUser?.id || "doctor";
      const { doctorFinalScore, doctorTopicScores, questionOverrides, reason } = req.body;

      const [attempt] = await db.select().from(submissions).where(eq(submissions.id, attemptId));
      if (!attempt) {
        return res.status(404).json({ error: "Attempt not found" });
      }

      const exam = await storage.getExam(attempt.examId);
      if (!exam || exam.professorId !== doctorId) {
        return res.status(403).json({ error: "Not authorized to override scores for this exam" });
      }
      if (attempt.status !== "completed") {
        return res.status(409).json({ error: "This attempt must be completed before a result can be published." });
      }

      const existingOverrides = (attempt.doctorScoreOverrides as any[]) || [];
      const newOverrideLog = {
        doctorId,
        timestamp: new Date().toISOString(),
        originalFinalScore: attempt.finalScore ?? attempt.totalScore,
        newDoctorFinalScore: doctorFinalScore !== undefined ? Number(doctorFinalScore) : attempt.finalScore,
        reason: reason || "Doctor manual score review",
        questionOverrides: questionOverrides || [],
      };

      existingOverrides.push(newOverrideLog);

      const [updated] = await db.update(submissions).set({
        doctorFinalScore: doctorFinalScore !== undefined ? Number(doctorFinalScore) : attempt.doctorFinalScore,
        doctorTopicScores: doctorTopicScores !== undefined ? doctorTopicScores : attempt.doctorTopicScores,
        doctorScoreOverrides: existingOverrides as any,
        professorDecision: "overridden",
        professorOverrideReason: reason || "Doctor override",
        professorReviewTimestamp: new Date(),
      }).where(eq(submissions.id, attemptId)).returning();

      res.json({ success: true, attempt: updated });
    } catch (error: any) {
      console.error("Score override error:", error);
      res.status(500).json({ error: "Failed to apply score override" });
    }
  });

  // =========================================================================
  // STANDARD EXAM: ORAL ANSWER EVALUATION (0–10 scoring via Gemini)
  // =========================================================================
  app.post("/api/evaluate-oral", isAuthenticated, recordingUpload.single("audio"), async (req, res) => {
    try {
      const { questionText, expectedAnswer, rubric, keyPoints, transcriptText } = req.body;

      if (!questionText) {
        return res.status(400).json({ error: "Question text is required." });
      }

      let audioBase64: string | undefined;
      let mimeType: string | undefined;
      const file = req.file;

      if (file) {
        audioBase64 = file.buffer.toString("base64");
        mimeType = file.mimetype || "audio/webm";
      }

      let parsedKeyPoints: string[] | undefined;
      if (keyPoints) {
        try {
          parsedKeyPoints = typeof keyPoints === "string" ? JSON.parse(keyPoints) : keyPoints;
        } catch {
          parsedKeyPoints = keyPoints.split(",").map((k: string) => k.trim()).filter(Boolean);
        }
      }

      const evaluation = await evaluateOralAnswer({
        questionText,
        expectedAnswer: expectedAnswer || undefined,
        rubric: rubric || undefined,
        keyPoints: parsedKeyPoints,
        studentAudioBase64: audioBase64,
        audioMimeType: mimeType,
        studentTranscriptText: transcriptText || undefined,
      });

      res.json({ success: true, evaluation });
    } catch (error: any) {
      console.error("Oral evaluation error:", error);
      res.status(500).json({ error: error.message || "Oral evaluation failed." });
    }
  });

  const sanitizeUniversity = (uni: any) => {
    const { geminiApiKey, openaiApiKey, ...safe } = uni;
    return { ...safe, hasApiKey: !!(geminiApiKey || openaiApiKey) };
  };

  app.get("/api/users", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const requester = await storage.getUser(userId);
      if (!requester || (requester.role !== "professor" && requester.role !== "admin")) {
        return res.status(403).json({ error: "Professor or admin access required" });
      }
      let users = await storage.getAllUsers();

      const demoMatch = userId.match(/^demo-(professor|student)-(.+)$/);
      if (demoMatch) {
        const demoSessionId = demoMatch[2];
        users = users.filter((u) => {
          if (u.id.startsWith("demo-")) {
            return u.id.endsWith(`-${demoSessionId}`);
          }
          return true;
        });
      }

      res.json(users.map(sanitizeUser));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.get("/api/users/:id", isAuthenticated, async (req, res) => {
    try {
      const requester = await storage.getUser(getUserId(req));
      const targetId = p(req.params.id);
      if (!requester || (requester.id !== targetId && requester.role !== "professor" && requester.role !== "admin")) {
        return res.status(403).json({ error: "Not authorized to view this user" });
      }
      const user = await storage.getUser(targetId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(sanitizeUser(user));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.patch("/api/users/:id/role", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const targetId = p(req.params.id);
      const currentUser = await storage.getUser(userId);
      if (!currentUser) return res.status(401).json({ error: "Unauthorized" });
      if (currentUser.role !== "admin" && userId !== targetId) {
        return res.status(403).json({ error: "Cannot update another user's role" });
      }
      const { role, universityId } = req.body;
      if (!role || (role !== "professor" && role !== "student")) {
        return res.status(400).json({ error: "Invalid role" });
      }
      if (currentUser.role !== "admin" && currentUser.role && currentUser.role !== role) {
        return res.status(403).json({ error: "You cannot change your account role." });
      }
      if (currentUser.role === "student") {
        return res.status(403).json({ error: "Student roles are assigned by the server and cannot be changed." });
      }
      const user = await storage.updateUserRole(targetId, role, universityId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(sanitizeUser(user));
    } catch (error) {
      res.status(500).json({ error: "Failed to update user role" });
    }
  });

  app.patch("/api/universities/:id/api-key", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user || user.role !== "professor") {
        return res.status(403).json({ error: "Only professors can manage university settings" });
      }
      if (user.universityId !== p(req.params.id)) {
        return res.status(403).json({ error: "You can only manage your own university's settings" });
      }
      const { apiKey } = req.body;
      const uni = await storage.updateUniversityApiKey(p(req.params.id), apiKey || null);
      if (!uni) {
        return res.status(404).json({ error: "University not found" });
      }
      res.json({ hasApiKey: !!uni.geminiApiKey });
    } catch (error) {
      res.status(500).json({ error: "Failed to update API key" });
    }
  });

  app.post("/api/generate-questions", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user || user.role !== "professor") {
        return res.status(403).json({ error: "Only professors can generate questions" });
      }

      const { classId, numQuestions = 5, questionTypes: qTypes, instructions } = req.body;
      if (!classId) {
        return res.status(400).json({ error: "Class ID is required to generate questions from materials" });
      }

      const cls = await storage.getClass(classId);
      if (!cls) {
        return res.status(404).json({ error: "Class not found" });
      }
      if (cls.professorId !== userId) {
        return res.status(403).json({ error: "You can only generate questions from your own classes" });
      }

      const materials = await storage.getMaterialsByClass(classId);
      if (materials.length === 0) {
        return res.status(400).json({ error: "No materials uploaded for this class. Upload course materials first." });
      }

      let customApiKey: string | null = null;
      if (user.universityId) {
        const uni = await storage.getUniversity(user.universityId);
        if (uni?.geminiApiKey) customApiKey = uni.geminiApiKey;
      }

      const combinedContent = materials.map(m => `--- ${m.fileName} ---\n${m.content}`).join("\n\n");
      const questions = await generateQuestionsFromMaterials(
        combinedContent,
        Math.min(numQuestions, 20),
        qTypes || ["short", "mcq", "audio"],
        customApiKey,
        instructions
      );

      res.json({ questions });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to generate questions" });
    }
  });

  app.post("/api/ai-question-chat", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user || user.role !== "professor") {
        return res.status(403).json({ error: "Only professors can use AI question generation" });
      }

      const { classId, messages: conversationMessages } = req.body;
      if (!classId) {
        return res.status(400).json({ error: "Class ID is required" });
      }
      if (!conversationMessages || !Array.isArray(conversationMessages) || conversationMessages.length === 0) {
        return res.status(400).json({ error: "Conversation messages are required" });
      }
      if (conversationMessages.length > 30) {
        return res.status(400).json({ error: "Conversation too long. Please start a new chat." });
      }
      const validatedMessages = conversationMessages
        .filter((m: any) => m && typeof m.content === "string" && ["user", "assistant"].includes(m.role))
        .map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content.substring(0, 2000) }));
      if (validatedMessages.length === 0) {
        return res.status(400).json({ error: "No valid messages provided" });
      }

      const cls = await storage.getClass(classId);
      if (!cls) {
        return res.status(404).json({ error: "Class not found" });
      }
      if (cls.professorId !== userId) {
        return res.status(403).json({ error: "You can only generate questions from your own classes" });
      }

      const materials = await storage.getMaterialsByClass(classId);
      if (materials.length === 0) {
        return res.status(400).json({ error: "No materials uploaded for this class. Upload course materials first." });
      }

      let customApiKey: string | null = null;
      if (user.universityId) {
        const uni = await storage.getUniversity(user.universityId);
        if (uni?.geminiApiKey) customApiKey = uni.geminiApiKey;
      }

      const combinedContent = materials.map(m => `--- ${m.fileName} ---\n${m.content}`).join("\n\n");
      const result = await aiQuestionChat(validatedMessages, combinedContent, customApiKey);

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to process AI chat" });
    }
  });

  // Universities routes
  app.get("/api/universities", isAuthenticated, async (req, res) => {
    try {
      const universities = await storage.getAllUniversities();
      res.json(universities.map(sanitizeUniversity));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch universities" });
    }
  });

  app.get("/api/universities/:id", isAuthenticated, async (req, res) => {
    try {
      const university = await storage.getUniversity(p(req.params.id));
      if (!university) {
        return res.status(404).json({ error: "University not found" });
      }
      res.json(sanitizeUniversity(university));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch university" });
    }
  });

  app.post("/api/universities", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user || user.role !== "professor") {
        return res.status(403).json({ error: "Only professors can create universities" });
      }
      const { name, domain } = req.body;
      if (!name) {
        return res.status(400).json({ error: "University name is required" });
      }
      const university = await storage.createUniversity({ name, domain });
      res.status(201).json(university);
    } catch (error) {
      res.status(500).json({ error: "Failed to create university" });
    }
  });

  // Classes routes
  app.get("/api/classes", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      if (user.role === "professor") {
        const classes = await storage.getAllClasses();
        res.json(classes.filter(c => c.status !== 'archived'));
      } else if (user.role === "student") {
        const enrollmentsList = (await storage.getEnrollmentsByStudent(userId))
          .filter((enrollment) => enrollment.status !== "inactive");
        const classIds = enrollmentsList.map(e => e.classId);
        const allClasses = await Promise.all(classIds.map(id => storage.getClass(id)));
        res.json(
          allClasses
            .filter((cls): cls is NonNullable<typeof cls> => Boolean(cls))
            .map(sanitizeClassForStudent),
        );
      } else {
        res.json([]);
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch classes" });
    }
  });

  app.get("/api/classes/:id", isAuthenticated, async (req, res) => {
    try {
      const requesterId = getUserId(req);
      const requester = await storage.getUser(requesterId);
      const cls = await storage.getClass(p(req.params.id));
      if (!cls) {
        return res.status(404).json({ error: "Class not found" });
      }
      if (requester?.role === "student") {
        const memberships = await storage.getEnrollmentsByStudent(requesterId);
        if (!memberships.some((membership) => membership.classId === cls.id && membership.status !== "inactive")) {
          return res.status(403).json({ error: "You are not enrolled in this class" });
        }
      } else if (requester?.role === "professor" && cls.professorId !== requesterId) {
        return res.status(403).json({ error: "Not authorized to view this class" });
      } else if (!requester || !["professor", "admin"].includes(requester.role || "")) {
        return res.status(403).json({ error: "Not authorized to view this class" });
      }
      res.json(requester?.role === "student" ? sanitizeClassForStudent(cls) : cls);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch class" });
    }
  });

  app.post("/api/admin/classes", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ error: "Only admins can create classes" });
      }
      const { subjectName, courseNumber, sectionNumber, universityId, roster } = req.body;
      if (!subjectName) {
        return res.status(400).json({ error: "Subject name is required" });
      }
      const cls = await storage.createClass({ subjectName, courseNumber, sectionNumber, universityId, createdByAdminId: userId, roster: roster || [] });
      res.status(201).json(cls);
    } catch (error) {
      res.status(500).json({ error: "Failed to create class" });
    }
  });

  app.get("/api/admin/classes", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(getUserId(req));
      if (!user || user.role !== "admin") {
        return res.status(403).json({ error: "Only admins can access all classes" });
      }
      const allClasses = await storage.getAllClasses();
      res.json(allClasses);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch classes" });
    }
  });

  app.patch("/api/admin/classes/:id", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(getUserId(req));
      if (!user || user.role !== "admin") {
        return res.status(403).json({ error: "Only admins can edit classes" });
      }
      const classId = p(req.params.id);
      const updateData = req.body;
      const updatedClass = await storage.updateClass(classId, updateData);
      if (!updatedClass) {
        return res.status(404).json({ error: "Class not found" });
      }
      res.json(updatedClass);
    } catch (error) {
      res.status(500).json({ error: "Failed to update class" });
    }
  });

  app.patch("/api/classes/:id/roster", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user || user.role !== "professor") {
        return res.status(403).json({ error: "Only professors can update class roster" });
      }
      const classId = p(req.params.id);
      const cls = await storage.getClass(classId);
      if (!cls) {
        return res.status(404).json({ error: "Class not found" });
      }
      if (cls.professorId !== userId) {
        return res.status(403).json({ error: "You can only modify your own classes" });
      }
      const { addStudents, removeStudents } = req.body;
      let roster = cls.roster || [];
      if (addStudents && Array.isArray(addStudents)) {
        for (const name of addStudents) {
          const trimmed = String(name).trim();
          if (trimmed && !roster.includes(trimmed)) {
            roster.push(trimmed);
          }
        }
      }
      if (removeStudents && Array.isArray(removeStudents)) {
        roster = roster.filter((n: string) => !removeStudents.includes(n));
      }
      await storage.updateClassRoster(classId, roster);
      const updated = await storage.getClass(classId);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update roster" });
    }
  });

  app.delete("/api/classes/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user || user.role !== "professor") {
        return res.status(403).json({ error: "Only professors can delete classes" });
      }
      const classId = p(req.params.id);
      const cls = await storage.getClass(classId);
      if (!cls) return res.status(404).json({ error: "Class not found" });
      if (cls.professorId !== userId) {
        return res.status(403).json({ error: "You can only delete your own classes" });
      }
      const deleted = await storage.deleteClass(classId);
      if (!deleted) {
        return res.status(404).json({ error: "Class not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete class" });
    }
  });

  // Enrollments routes
  app.get("/api/classes/:classId/enrollments", isAuthenticated, async (req, res) => {
    try {
      const requester = await storage.getUser(getUserId(req));
      const classId = p(req.params.classId);
      const cls = await storage.getClass(classId);
      if (!cls) return res.status(404).json({ error: "Class not found" });
      if (!requester || (requester.role !== "admin" && (requester.role !== "professor" || cls.professorId !== requester.id))) {
        return res.status(403).json({ error: "Professor or admin access required" });
      }
      const enrollmentsList = await storage.getEnrollmentsByClass(classId);
      const students = await Promise.all(
        enrollmentsList.map(async (e) => {
          const user = e.studentId ? await storage.getUser(e.studentId) : null;
          return { ...e, student: user ? sanitizeUser(user) : null };
        })
      );
      res.json(students);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch enrollments" });
    }
  });

  app.post("/api/classes/:classId/enroll", isStudent, async (_req, res) => {
    return res.status(410).json({ error: "Join classes from the Student Dashboard using a Class Code." });
  });

  app.post("/api/classes/:classId/enrollments", isProfessor, async (req, res) => {
    try {
      const { studentId } = req.body;
      const classId = p(req.params.classId);
      const professorId = getUserId(req);
      const cls = await storage.getClass(classId);
      if (!cls) return res.status(404).json({ error: "Class not found" });
      if (cls.professorId !== professorId) return res.status(403).json({ error: "You can only manage your own class" });
      
      if (!studentId) {
        return res.status(400).json({ error: "Student ID is required" });
      }
      const student = await storage.getUser(studentId);
      if (!student || student.role !== "student") return res.status(404).json({ error: "Student account not found" });
      
      const existingEnrollments = await storage.getEnrollmentsByClass(classId);
      const alreadyEnrolled = existingEnrollments.some(e => e.studentId === studentId);
      if (alreadyEnrolled) {
        return res.status(400).json({ error: "Student already enrolled" });
      }
      
      const enrollment = await storage.createEnrollment({ studentId, classId });
      res.status(201).json(enrollment);
    } catch (error) {
      res.status(500).json({ error: "Failed to add enrollment" });
    }
  });

  app.delete("/api/classes/:classId/enrollments/:studentId", isAuthenticated, async (req, res) => {
    try {
      const requester = await storage.getUser(getUserId(req));
      const classId = p(req.params.classId);
      const cls = await storage.getClass(classId);
      if (!cls) return res.status(404).json({ error: "Class not found" });
      if (!requester || (requester.role !== "admin" && (requester.role !== "professor" || cls.professorId !== requester.id))) {
        return res.status(403).json({ error: "Professor or admin access required" });
      }
      const deleted = await storage.deleteEnrollment(p(req.params.studentId), classId);
      if (!deleted) {
        return res.status(404).json({ error: "Enrollment not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to remove enrollment" });
    }
  });

  // Class Materials routes
  app.get("/api/classes/:classId/materials", isAuthenticated, async (req, res) => {
    try {
      const requesterId = getUserId(req);
      const requester = await storage.getUser(requesterId);
      const classId = p(req.params.classId);
      const cls = await storage.getClass(classId);
      if (!cls) return res.status(404).json({ error: "Class not found" });
      if (requester?.role === "student") {
        const memberships = await storage.getEnrollmentsByStudent(requesterId);
        if (!memberships.some((membership) => membership.classId === classId && membership.status !== "inactive")) {
          return res.status(403).json({ error: "You are not enrolled in this class" });
        }
      } else if (!requester || (requester.role !== "admin" && (requester.role !== "professor" || cls.professorId !== requesterId))) {
        return res.status(403).json({ error: "Not authorized to view class materials" });
      }
      const materials = await storage.getMaterialsByClass(classId);
      res.json(materials.map(m => ({ ...m, content: m.content.substring(0, 200) + (m.content.length > 200 ? "..." : "") })));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch materials" });
    }
  });

  app.post("/api/classes/:classId/materials", isAuthenticated, upload.single("file"), async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user || user.role !== "professor") {
        return res.status(403).json({ error: "Only professors can upload materials" });
      }

      const classId = p(req.params.classId);
      const cls = await storage.getClass(classId);
      if (!cls) {
        return res.status(404).json({ error: "Class not found" });
      }
      if (cls.professorId !== userId) {
        return res.status(403).json({ error: "You can only upload materials to your own classes" });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      let content = "";
      const fileName = file.originalname || "unknown";
      const mimeType = file.mimetype || "";

      if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
        try {
          const pdfData = await pdf(file.buffer);
          content = pdfData.text || "";
        } catch (pdfParseError: any) {
          console.error("[PDF] pdf-parse failed:", pdfParseError?.message);
        }
      } else {
        return res.status(400).json({ error: "Unsupported file type. Please upload a PDF file." });
      }

      if (!content.trim()) {
        return res.status(400).json({ error: "File has no readable text content" });
      }

      const material = await storage.createMaterial({
        classId,
        professorId: userId,
        fileName,
        content,
      });

      res.status(201).json({ ...material, content: content.substring(0, 200) + (content.length > 200 ? "..." : "") });
    } catch (error) {
      res.status(500).json({ error: "Failed to upload material" });
    }
  });

  app.delete("/api/materials/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user || user.role !== "professor") {
        return res.status(403).json({ error: "Only professors can delete materials" });
      }
      const deleted = await storage.deleteMaterial(p(req.params.id));
      if (!deleted) {
        return res.status(404).json({ error: "Material not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete material" });
    }
  });

  // Exams routes
  app.get("/api/exams", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      if (user.role === "professor") {
        const examsList = await storage.getExamsByProfessor(userId);
        res.json(examsList.filter((exam) => !exam.archivedAt));
      } else if (user.role === "student") {
        const enrollmentsList = await storage.getEnrollmentsByStudent(userId);
        const classIds = new Set(enrollmentsList.filter((e) => e.status !== "inactive").map((e) => e.classId));
        const ownAttempts = await storage.getSubmissionsByStudent(userId);
        const attemptedExamIds = new Set(ownAttempts.map((attempt) => attempt.examId));
        const allExams = await storage.getAllExams();
        const directGrantExamIds = getValidDirectExamGrantIds(req, allExams);
        const myExams = allExams.filter(exam => {
          if (exam.archivedAt && !attemptedExamIds.has(exam.id)) return false;
          const related = attemptedExamIds.has(exam.id) || canStudentAccessExam({
            exam,
            examId: exam.id,
            studentId: userId,
            enrolledClassIds: classIds,
            directGrantExamIds,
          });
          return related && (exam.status !== "draft" || attemptedExamIds.has(exam.id));
        });
        // The list endpoint is metadata-only for students. Questions are returned
        // only by the guarded exam-detail endpoint once the exam is available.
        res.json(myExams.map((exam) => ({
          ...sanitizeExamForStudent(exam),
          questions: [],
        })));
      } else if (user.role === "admin") {
        res.json(await storage.getAllExams());
      } else {
        res.status(403).json({ error: "Not authorized to view exams" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch exams" });
    }
  });

  // =========================================================================
  // VoxPractice — private, student-led oral self-training.
  // Every route is scoped to the authenticated student; practice data is never
  // exposed to professors, directors, or any other role.
  // =========================================================================

  // Resolve the Gemini key for a practice student: prefer their university's
  // configured key, otherwise fall back to the default integration key.
  const resolvePracticeApiKey = async (userId: string): Promise<string | null> => {
    const user = await storage.getUser(userId);
    if (user?.universityId) {
      const uni = await storage.getUniversity(user.universityId);
      if (uni?.geminiApiKey) return uni.geminiApiKey;
    }
    return null;
  };

  // Load a practice session and assert the caller owns it. Returns the session
  // or sends the appropriate error response and returns null.
  const loadOwnedPracticeSession = async (req: Request, res: any) => {
    const userId = getUserId(req);
    const session = await storage.getPracticeSession(p(req.params.id));
    if (!session) {
      res.status(404).json({ error: "Practice session not found" });
      return null;
    }
    if (session.studentId !== userId) {
      res.status(403).json({ error: "Not authorized to access this practice session" });
      return null;
    }
    return session;
  };

  // Resolve a transcript from the request body — either provided directly or by
  // transcribing supplied audio through the existing transcription pipeline.
  const resolvePracticeTranscript = async (body: any, questionText?: string): Promise<string> => {
    if (typeof body?.transcript === "string" && body.transcript.trim().length > 0) {
      return body.transcript.trim();
    }
    if (typeof body?.audioData === "string" && body.audioData.length > 0) {
      const t = await transcribeAudio(body.audioData, questionText);
      return (t || "").trim();
    }
    return "";
  };

  // Student-only guard: VoxPractice is a private self-training tool. Professors,
  // directors, and admins must never access it. Runs after isAuthenticated.
  const requireStudent: express.RequestHandler = async (req, res, next) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user || user.role !== "student") {
        return res.status(403).json({ error: "VoxPractice is available to students only" });
      }
      next();
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Authorization check failed" });
    }
  };

  // Zod request contracts for the practice routes (creation uses the shared
  // insert schema). An answer payload must carry either a transcript or audio.
  const analyzeMaterialBody = z.object({ content: z.string().min(1) });
  const generateQuestionsBody = z.object({
    materialContent: z.string().min(1),
    count: z.number().int().positive().max(20).optional(),
    focusConcepts: z.array(z.string()).optional(),
  });
  const answerPayloadBody = z.object({
    questionId: z.string().min(1),
    transcript: z.string().optional(),
    audioData: z.string().optional(),
    materialContent: z.string().optional(),
  });
  const requireTranscriptOrAudio = (b: { transcript?: string; audioData?: string }) =>
    (b.transcript && b.transcript.trim().length > 0) || (b.audioData && b.audioData.length > 0);
  const answerBody = answerPayloadBody.refine(requireTranscriptOrAudio, {
    message: "A transcript or audio answer is required",
  });
  const feedbackBody = answerPayloadBody
    .extend({
      skippedProbe: z.boolean().optional(),
    })
    .refine(requireTranscriptOrAudio, {
      message: "A transcript or audio answer is required",
    });
  const finalizeBody = z.object({}).optional();
  const consentBody = z.object({
    consentGiven: z.literal(true),
    consentTimestamp: z.string().optional(),
  });

  // Analyze chosen material into a concept/topic/question summary.
  app.post("/api/practice/analyze-material", isAuthenticated, requireStudent, async (req, res) => {
    try {
      const userId = getUserId(req);
      const parsed = analyzeMaterialBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Material content is required", details: parsed.error.errors });
      }
      const apiKey = await resolvePracticeApiKey(userId);
      const summary = await analyzePracticeMaterial(parsed.data.content, apiKey);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to analyze material" });
    }
  });

  // Extract plain text from an uploaded study-material file so the student can
  // feed it into analyze-material. Stores nothing; private to the caller.
  app.post(
    "/api/practice/extract-material",
    isAuthenticated,
    requireStudent,
    upload.single("file"),
    async (req: any, res) => {
      try {
        const file = req.file;
        if (!file) {
          return res.status(400).json({ error: "No file uploaded" });
        }
        // Reuse the adaptive-exam PDF pipeline. It first extracts embedded text
        // and automatically falls back to visual AI analysis for scanned PDFs.
        const processed = await processLecturePdf(file.buffer, file.originalname || "practice-material.pdf");
        const content = processed.extractedText || [
          processed.blueprint.summary,
          ...processed.blueprint.topics.flatMap((topic) => [
            topic.title,
            topic.description,
            ...topic.concepts.flatMap((concept) => [
              concept.title,
              concept.description,
              ...concept.learningObjectives,
              ...concept.expectedKeyPoints,
              ...concept.commonMisconceptions,
              concept.suggestedInitialQuestion,
            ]),
          ]),
        ].filter(Boolean).join("\n").slice(0, 50_000);

        if (!content.trim()) {
          return res.status(400).json({ error: "No readable educational content was found in this PDF." });
        }
        res.json({ fileName: file.originalname || "upload", content });
      } catch (error: any) {
        res.status(400).json({ error: error.message || "Could not read this file" });
      }
    },
  );

  // Create a practice session (scoped to the authenticated student).
  app.post("/api/practice/sessions", isAuthenticated, requireStudent, async (req, res) => {
    try {
      const userId = getUserId(req);
      const parsed = insertPracticeSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid practice session data", details: parsed.error.errors });
      }
      const session = await storage.createPracticeSession(userId, parsed.data);
      res.status(201).json(session);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to create practice session" });
    }
  });

  app.post("/api/practice/sessions/:id/consent", isAuthenticated, requireStudent, async (req, res) => {
    try {
      const parsed = consentBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Consent is required before recording starts" });
      }
      const session = await loadOwnedPracticeSession(req, res);
      if (!session) return;
      const consentTimestamp = parsed.data.consentTimestamp
        ? new Date(parsed.data.consentTimestamp)
        : new Date();
      if (Number.isNaN(consentTimestamp.getTime())) {
        return res.status(400).json({ error: "Invalid consent timestamp" });
      }
      const updated = await storage.updatePracticeSession(session.id, {
        consentGiven: true,
        consentTimestamp,
      });
      res.json({ session: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to record consent" });
    }
  });

  // List the authenticated student's own practice sessions.
  app.get("/api/practice/sessions", isAuthenticated, requireStudent, async (req, res) => {
    try {
      const userId = getUserId(req);
      const sessions = await storage.getPracticeSessionsByStudent(userId);
      res.json(sessions);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch practice sessions" });
    }
  });

  // Get one practice session (must be owned by the caller).
  app.get("/api/practice/sessions/:id", isAuthenticated, requireStudent, async (req, res) => {
    try {
      const session = await loadOwnedPracticeSession(req, res);
      if (!session) return;
      res.json(session);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch practice session" });
    }
  });

  // Generate a material-grounded question set and store it on the session.
  app.post("/api/practice/sessions/:id/generate-questions", isAuthenticated, requireStudent, async (req, res) => {
    try {
      const parsed = generateQuestionsBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid generate-questions request", details: parsed.error.errors });
      }
      const session = await loadOwnedPracticeSession(req, res);
      if (!session) return;
      const apiKey = await resolvePracticeApiKey(session.studentId);
      const questions = await generatePracticeQuestions(
        parsed.data.materialContent,
        {
          sessionMode: session.sessionMode as any,
          coachStyle: session.coachStyle as any,
          count: parsed.data.count,
          focusConcepts: parsed.data.focusConcepts,
        },
        apiKey
      );
      const updated = await storage.updatePracticeSession(session.id, { questions });
      res.json({ questions, session: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to generate practice questions" });
    }
  });

  // Produce a single follow-up probe for an answer (from the approved list only).
  app.post("/api/practice/sessions/:id/probe", isAuthenticated, requireStudent, async (req, res) => {
    try {
      const parsed = answerBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid probe request", details: parsed.error.errors });
      }
      const session = await loadOwnedPracticeSession(req, res);
      if (!session) return;
      if (session.consentGiven !== true) {
        return res.status(400).json({ error: "Consent is required before recording starts" });
      }
      const questions = (session.questions || []) as PracticeQuestion[];
      const question = questions.find((q) => q.id === parsed.data.questionId);
      if (!question) {
        return res.status(400).json({ error: "questionId does not match a question in this session" });
      }
      const transcript = await resolvePracticeTranscript(parsed.data, question.text);
      if (!transcript) {
        return res.status(400).json({ error: "A transcript or audio answer is required" });
      }
      const apiKey = await resolvePracticeApiKey(session.studentId);
      const { probe } = await generatePracticeProbe(
        question.text,
        transcript,
        { coachStyle: session.coachStyle as any },
        apiKey
      );
      const updatedQuestions = questions.map((q) =>
        q.id === parsed.data.questionId ? { ...q, transcript, followUpProbe: probe } : q
      );
      await storage.updatePracticeSession(session.id, { questions: updatedQuestions });
      res.json({ probe, transcript });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to generate follow-up probe" });
    }
  });

  // Produce per-answer micro-feedback plus a 7-dimension practice VoxScore.
  app.post("/api/practice/sessions/:id/feedback", isAuthenticated, requireStudent, async (req, res) => {
    try {
      const parsed = feedbackBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid feedback request", details: parsed.error.errors });
      }
      const session = await loadOwnedPracticeSession(req, res);
      if (!session) return;
      if (session.consentGiven !== true) {
        return res.status(400).json({ error: "Consent is required before recording starts" });
      }
      const questions = (session.questions || []) as PracticeQuestion[];
      const question = questions.find((q) => q.id === parsed.data.questionId);
      if (!question) {
        return res.status(400).json({ error: "questionId does not match a question in this session" });
      }
      const transcript = await resolvePracticeTranscript(parsed.data, question.text);
      if (!transcript) {
        return res.status(400).json({ error: "A transcript or audio answer is required" });
      }
      const materialContent = parsed.data.materialContent ?? null;
      const apiKey = await resolvePracticeApiKey(session.studentId);
      const { microFeedback, voxScoreProfile } = await generatePracticeMicroFeedback(
        question.text,
        transcript,
        { coachStyle: session.coachStyle as any, materialContent, concept: question.concept ?? null, skippedProbe: parsed.data.skippedProbe === true },
        apiKey
      );
      const updatedQuestions = questions.map((q) =>
        q.id === parsed.data.questionId ? { ...q, transcript, microFeedback, voxScoreProfile } : q
      );
      await storage.updatePracticeSession(session.id, {
        questions: updatedQuestions,
        languageUsed: session.languageUsed || voxScoreProfile.languageDetected,
      });
      res.json({ microFeedback, voxScoreProfile });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to generate micro-feedback" });
    }
  });

  // Finalize a session into a readiness report (aggregate over answered questions).
  app.post("/api/practice/sessions/:id/finalize", isAuthenticated, requireStudent, async (req, res) => {
    try {
      const parsed = finalizeBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid finalize request", details: parsed.error.errors });
      }
      const session = await loadOwnedPracticeSession(req, res);
      if (!session) return;
      const questions = (session.questions || []) as PracticeQuestion[];
      const report = buildPracticeReadinessReport(questions);
      const updated = await storage.updatePracticeSession(session.id, {
        overallReadinessScore: report.overallReadinessScore,
        overallVoxScoreProfile: report.overallVoxScoreProfile ?? undefined,
        conceptCoverageMap: report.conceptCoverageMap,
        completedQuestionCount: report.completedQuestionCount,
        languageUsed: session.languageUsed || report.languageUsed,
        completedAt: new Date(),
      });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to finalize practice session" });
    }
  });

  app.get("/api/exams/:id", isAuthenticated, async (req, res) => {
    try {
      const exam = await storage.getExam(p(req.params.id));
      if (!exam) {
        return res.status(404).json({ error: "Exam not found" });
      }
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      if (user.role === "student") {
        if (!(await studentCanAccessExam(req, userId, exam))) {
          return res.status(403).json({ error: "You do not have permission to access this exam." });
        }
        const window = validateExamWindow(exam);
        if (!window.allowed) {
          return res.status(window.status).json({ error: window.error });
        }
        const attempts = (await storage.getSubmissionsByStudent(userId)).filter(
          (attempt) => attempt.examId === exam.id && attempt.isPreview !== "true",
        );
        const attemptLimit = validateAttemptLimit(exam, attempts);
        if (!attemptLimit.allowed) {
          return res.status(attemptLimit.status).json({ error: attemptLimit.error });
        }
        return res.json(sanitizeExamForStudent(exam));
      }
      if (user.role === "professor" && exam.professorId !== userId) {
        return res.status(403).json({ error: "Not authorized to view this exam" });
      }
      if (user.role !== "professor" && user.role !== "admin") {
        return res.status(403).json({ error: "Not authorized to view this exam" });
      }
      return res.json(exam);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch exam" });
    }
  });

  app.get("/api/exams/:id/analytics", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "professor" && user.role !== "admin")) {
        return res.status(403).json({ error: "Professor or admin access required" });
      }
      const exam = await storage.getExam(p(req.params.id));
      if (!exam) {
        return res.status(404).json({ error: "Exam not found" });
      }
      if (user.role === "professor" && exam.professorId !== userId) {
        return res.status(403).json({ error: "Not authorized to view this exam's analytics" });
      }
      const analytics = await storage.getExamAnalytics(exam.id);
      res.json(analytics);
    } catch (error) {
      console.error("Failed to fetch exam analytics:", error);
      res.status(500).json({ error: "Failed to fetch exam analytics" });
    }
  });

  app.post("/api/exams", isProfessor, async (req, res) => {
    try {
      const parseResult = insertExamSchema.safeParse(req.body);
      if (!parseResult.success) {
        console.error("Validation error:", JSON.stringify(parseResult.error.errors, null, 2));
        return res.status(400).json({ 
          error: "Invalid exam data", 
          details: parseResult.error.errors 
        });
      }

      const professorId = getUserId(req);
      const exam = await storage.createExam(professorId, parseResult.data);
      res.status(201).json(exam);
    } catch (error: any) {
      console.error("POST /api/exams error:", error);
      res.status(500).json({ error: error.message || "Failed to create exam" });
    }
  });

  app.patch("/api/exams/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "professor" && user.role !== "admin")) {
        return res.status(403).json({ error: "Only professors can update exams" });
      }
      const existing = await storage.getExam(p(req.params.id));
      if (!existing) {
        return res.status(404).json({ error: "Exam not found" });
      }
      if (user.role === "professor" && existing.professorId !== user.id) {
        return res.status(403).json({ error: "Not authorized to update this exam" });
      }
      const isPublishing = req.body.startTime && !existing.startTime;
      const exam = await storage.updateExam(p(req.params.id), req.body);
      if (!exam) {
        return res.status(404).json({ error: "Exam not found" });
      }
      if (isPublishing) {
        const refreshed = await storage.regenerateExamAccessCode(exam.id);
        return res.json(refreshed);
      }
      res.json(exam);
    } catch (error) {
      res.status(500).json({ error: "Failed to update exam" });
    }
  });

  app.delete("/api/exams/:id", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(getUserId(req));
      if (!user || (user.role !== "professor" && user.role !== "admin")) {
        return res.status(403).json({ error: "Only professors can delete exams" });
      }
      const existing = await storage.getExam(p(req.params.id));
      if (!existing) {
        return res.status(404).json({ error: "Exam not found" });
      }
      if (user.role === "professor" && existing.professorId !== user.id) {
        return res.status(403).json({ error: "Not authorized to delete this exam" });
      }
      const existingAttempts = await storage.getSubmissionsByExam(existing.id);
      if (existingAttempts.length > 0) {
        // Preserve the exam definition required to render historical attempts.
        // It disappears from professor/student active lists but remains available
        // to authorized result and history lookups.
        await storage.updateExam(existing.id, {
          status: "inactive",
          archivedAt: new Date(),
        });
        return res.status(204).send();
      }
      const deleted = await storage.deleteExam(existing.id);
      if (!deleted) {
        return res.status(404).json({ error: "Exam not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete exam" });
    }
  });

  // Submissions routes
  app.get("/api/submissions", isAuthenticated, async (req, res) => {
    try {
      const { examId, studentId } = req.query;
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      let subs;
      const includePreview = req.query.includePreview === "true";
      if (user.role === "student") {
        subs = await storage.getSubmissionsByStudent(userId);
      } else if (user.role === "professor") {
        const profExams = await storage.getExamsByProfessor(userId);
        const ownedExamIds = new Set(profExams.map((exam) => exam.id));
        if (examId && !ownedExamIds.has(String(examId))) {
          return res.status(403).json({ error: "Not authorized to view these submissions" });
        }
        const allSubs = examId
          ? await storage.getSubmissionsByExam(String(examId))
          : await storage.getAllSubmissions();
        subs = allSubs.filter((submission) => ownedExamIds.has(submission.examId));
      } else if (user.role === "admin") {
        subs = examId
          ? await storage.getSubmissionsByExam(String(examId))
          : studentId
            ? await storage.getSubmissionsByStudent(String(studentId))
            : await storage.getAllSubmissions();
      } else {
        return res.status(403).json({ error: "Not authorized to view submissions" });
      }

      if (!includePreview) {
        subs = subs.filter(s => s.isPreview !== "true");
      }
      
      if (user.role === "student") {
        const safeResults = await Promise.all(subs.map(async (submission) => {
          const exam = await storage.getExam(submission.examId);
          if (!exam) return null;
          const cls = exam.classId ? await storage.getClass(exam.classId) : undefined;
          const professor = await storage.getUser(exam.professorId);
          return buildStudentHistoryItem({
            submission,
            exam,
            className: cls?.subjectName ?? null,
            professorName: professorDisplayName(professor),
          });
        }));
        return res.json(safeResults.filter(Boolean));
      }
      return res.json(subs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch submissions" });
    }
  });

  app.get("/api/submissions/:id", isAuthenticated, async (req, res) => {
    try {
      const submission = await storage.getSubmission(p(req.params.id));
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      const exam = await storage.getExam(submission.examId);
      if (!user || !exam) return res.status(404).json({ error: "Submission not found" });
      if (user.role === "student") {
        if (submission.studentId !== userId || submission.isPreview === "true") {
          return res.status(403).json({ error: "Not authorized to view this submission" });
        }
        const cls = exam.classId ? await storage.getClass(exam.classId) : undefined;
        const professor = await storage.getUser(exam.professorId);
        return res.json(buildStudentHistoryItem({
          submission,
          exam,
          className: cls?.subjectName ?? null,
          professorName: professorDisplayName(professor),
        }));
      }
      if (user.role === "professor" && exam.professorId !== userId) {
        return res.status(403).json({ error: "Not authorized to view this submission" });
      }
      if (user.role !== "professor" && user.role !== "admin") {
        return res.status(403).json({ error: "Not authorized to view this submission" });
      }
      return res.json(submission);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch submission" });
    }
  });

  app.post("/api/submissions", isAuthenticated, async (req, res) => {
    try {
      const parseResult = insertExamSubmissionSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid submission data", 
          details: parseResult.error.errors 
        });
      }

      const { examId, responses, isPreview, consentGiven, consentTimestamp } = parseResult.data;
      const studentId = getUserId(req);
      const currentUser = await storage.getUser(studentId);
      if (!currentUser) return res.status(401).json({ error: "Unauthorized" });

      const exam = await storage.getExam(examId);
      if (!exam) {
        return res.status(404).json({ error: "Exam not found" });
      }

      if (isPreview) {
        if (currentUser.role !== "professor" || exam.professorId !== studentId) {
          return res.status(403).json({ error: "Only the exam's professor can preview this exam" });
        }
      } else if (currentUser.role !== "student") {
        return res.status(403).json({ error: "Student access required" });
      }

      if (!isPreview && exam.mode === "adaptive") {
        return res.status(409).json({
          error: "Adaptive exams must be completed through the active adaptive attempt.",
        });
      }

      if (consentGiven !== true) {
        return res.status(400).json({ error: "Consent is required before recording starts" });
      }

      const consentDate = consentTimestamp ? new Date(consentTimestamp) : new Date();
      if (Number.isNaN(consentDate.getTime())) {
        return res.status(400).json({ error: "Invalid consent timestamp" });
      }

      if (!isPreview) {
        if (!(await studentCanAccessExam(req, studentId, exam))) {
          return res.status(403).json({ error: "You do not have permission to access this exam." });
        }
        const window = validateExamWindow(exam);
        if (!window.allowed) return res.status(window.status).json({ error: window.error });
      }

      const submissionResult = isPreview
        ? {
            ok: true,
            data: await storage.createSubmission(studentId, examId, responses, true, {
              consentGiven: true,
              consentTimestamp: consentDate,
            }),
          } as const
        : await withStudentExamAttemptLock(studentId, examId, async () => {
            const currentExam = await storage.getExam(examId);
            if (!currentExam) {
              return { ok: false, status: 404, error: "Exam not found." } as const;
            }
            if (!(await studentCanAccessExam(req, studentId, currentExam))) {
              return {
                ok: false,
                status: 403,
                error: "You do not have permission to access this exam.",
              } as const;
            }
            const currentWindow = validateExamWindow(currentExam);
            if (!currentWindow.allowed) {
              return {
                ok: false,
                status: currentWindow.status,
                error: currentWindow.error || "This exam is unavailable.",
              } as const;
            }
            const existingSubmissions = (await storage.getSubmissionsByStudent(studentId)).filter(
              (submission) => submission.examId === examId && submission.isPreview !== "true",
            );
            const attemptLimit = validateNewAttemptCreation(currentExam, existingSubmissions);
            if (!attemptLimit.allowed) {
              return {
                ok: false,
                status: attemptLimit.status,
                error: (currentExam.maxAttempts ?? 1) === 1 && attemptLimit.error === "You have used all allowed attempts."
                  ? "You have already completed this exam."
                  : attemptLimit.error || "You have used all allowed attempts.",
              } as const;
            }
            return {
              ok: true,
              data: await storage.createSubmission(studentId, examId, responses, false, {
                consentGiven: true,
                consentTimestamp: consentDate,
              }),
            } as const;
          });

      if (!submissionResult.ok) {
        return res.status(submissionResult.status).json({ error: submissionResult.error });
      }
      const submission = submissionResult.data;
      if (!isPreview) {
        logUserEvent(studentId, "exam_submitted", { examId, submissionId: submission.id });
      }
      if (!isPreview) {
        if (exam.mode === "quickvox") {
          return res.status(201).json({
            id: submission.id,
            examId: submission.examId,
            status: submission.status,
            submittedAt: submission.submittedAt,
            quickvoxInsight: submission.quickvoxInsight,
            quickvoxFollowUp: submission.quickvoxFollowUp,
          });
        }
        return res.status(201).json({
          id: submission.id,
          examId: submission.examId,
          status: submission.status,
          submittedAt: submission.submittedAt,
          resultStatus: "pending_review",
        });
      }
      return res.status(201).json(submission);
    } catch (error) {
      res.status(500).json({ error: "Failed to create submission" });
    }
  });

  app.patch("/api/submissions/:id/score", isProfessor, async (req, res) => {
    try {
      const { questionId, score, understandingScore } = req.body;
      
      if (!questionId || typeof score !== "number") {
        return res.status(400).json({ error: "questionId and score are required" });
      }

      if (score < 0 || score > 1) {
        return res.status(400).json({ error: "Score must be between 0 and 1" });
      }

      if (understandingScore !== undefined && (understandingScore < 0 || understandingScore > 1)) {
        return res.status(400).json({ error: "Understanding score must be between 0 and 1" });
      }

      const existing = await storage.getSubmission(p(req.params.id));
      if (!existing) return res.status(404).json({ error: "Submission not found" });
      const exam = await storage.getExam(existing.examId);
      if (!exam || exam.professorId !== getUserId(req)) {
        return res.status(403).json({ error: "Only the exam's professor can update this score" });
      }

      const submission = await storage.updateSubmissionScore(
        p(req.params.id),
        questionId,
        score,
        understandingScore
      );

      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      res.json(submission);
    } catch (error) {
      res.status(500).json({ error: "Failed to update submission score" });
    }
  });

  app.patch("/api/submissions/:id/decision", isProfessor, async (req, res) => {
    try {
      const userId = getUserId(req);
      const {
        professorDecision,
        professorOverrideReason,
        professorHolisticScore,
        professorReviewDurationMinutes,
        adjustedScores,
        aiTotalScore,
      } = req.body;

      if (!["accepted", "adjusted", "overridden"].includes(professorDecision)) {
        return res.status(400).json({ error: "Invalid professorDecision" });
      }

      if (
        professorHolisticScore !== undefined &&
        professorHolisticScore !== null &&
        professorHolisticScore !== "" &&
        (!Number.isFinite(Number(professorHolisticScore)) || Number(professorHolisticScore) < 0 || Number(professorHolisticScore) > 10)
      ) {
        return res.status(400).json({ error: "professorHolisticScore must be a number between 0 and 10" });
      }

      if (professorOverrideReason !== undefined && professorOverrideReason !== null && typeof professorOverrideReason !== "string") {
        return res.status(400).json({ error: "professorOverrideReason must be a string" });
      }

      let submission = await storage.getSubmission(p(req.params.id));
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      const exam = await storage.getExam(submission.examId);
      if (!exam) {
        return res.status(404).json({ error: "Exam not found" });
      }

      if (exam.professorId !== userId) {
        return res.status(403).json({ error: "Only the exam's professor can record a decision" });
      }
      if (submission.status !== "completed") {
        return res.status(409).json({ error: "This attempt must be completed before a result can be published." });
      }

      const aiTotal = (typeof aiTotalScore === "number" && aiTotalScore >= 0 && aiTotalScore <= 1)
        ? aiTotalScore
        : submission.totalScore;

      if (adjustedScores && typeof adjustedScores === "object") {
        for (const [questionId, rawScore] of Object.entries(adjustedScores)) {
          const score = Number(rawScore);
          if (isNaN(score) || score < 0 || score > 1) continue;
          const updated = await storage.updateSubmissionScore(submission.id, questionId, score);
          if (updated) submission = updated;
        }
      }

      const professorTotal = submission.totalScore;
      const gradingGap = professorDecision === "accepted"
        ? 0
        : Math.round((aiTotal - professorTotal) * 100);

      const lang = (submission.languageUsed || "").toLowerCase();
      const arabicFlag = (lang === "arabic" || lang === "mixed") && gradingGap > 6;

      const holistic = professorHolisticScore === undefined || professorHolisticScore === null || professorHolisticScore === ""
        ? null
        : Math.max(1, Math.min(10, Number(professorHolisticScore)));

      const duration = professorReviewDurationMinutes === undefined || professorReviewDurationMinutes === null
        ? null
        : Number(professorReviewDurationMinutes);

      const result = await storage.updateSubmissionDecision(submission.id, {
        professorDecision,
        professorOverrideReason: professorDecision === "accepted" ? null : (professorOverrideReason || null),
        professorHolisticScore: exam.mode === "exam" ? holistic : null,
        professorReviewDurationMinutes: duration,
        gradingGap,
        arabicFlag,
      });

      if (!result) {
        return res.status(404).json({ error: "Submission not found" });
      }

      res.json(result);
    } catch (error) {
      console.error("Failed to record decision:", error);
      res.status(500).json({ error: "Failed to record professor decision" });
    }
  });

  app.post("/api/submissions/:id/feedback", isProfessor, async (req, res) => {
    try {
      const userId = getUserId(req);

      const submission = await storage.getSubmission(p(req.params.id));
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      const exam = await storage.getExam(submission.examId);
      if (!exam) {
        return res.status(404).json({ error: "Exam not found" });
      }

      if (exam.professorId !== userId) {
        return res.status(403).json({ error: "Not authorized to generate feedback for this submission" });
      }

      let materialContext = "";
      if (exam.classId) {
        const materials = await storage.getMaterialsByClass(exam.classId);
        if (materials.length > 0) {
          const combinedContent = materials.map(m => `--- ${m.fileName} ---\n${m.content}`).join("\n\n");
          materialContext = combinedContent.length > 8000
            ? combinedContent.substring(0, 8000) + "\n[Content truncated for length]"
            : combinedContent;
        }
      }

      const professor = await storage.getUser(exam.professorId);
      let customApiKey: string | null = null;
      if (professor?.universityId) {
        const uni = await storage.getUniversity(professor.universityId);
        if (uni?.geminiApiKey) customApiKey = uni.geminiApiKey;
      }

      const feedback = await generateFeedback(
        exam,
        submission.responses,
        submission.scores,
        submission.understandingScores || {},
        materialContext || undefined,
        customApiKey
      );

      const { submissions: submissionsTable } = await import("@shared/schema");
      const drizzleOrm = await import("drizzle-orm");
      const { db } = await import("./db");
      await db.update(submissionsTable).set({ feedback }).where(drizzleOrm.eq(submissionsTable.id, submission.id));

      res.json({ feedback });
    } catch (error) {
      console.error("Failed to generate feedback:", error);
      res.status(500).json({ error: "Failed to generate feedback" });
    }
  });

  app.post("/api/transcribe", isAuthenticated, async (req, res) => {
    try {
      const { audioData, questionText } = req.body;
      if (!audioData || typeof audioData !== "string") {
        return res.status(400).json({ error: "audioData is required" });
      }
      const transcript = await transcribeAudio(audioData, questionText);
      res.json({ transcript });
    } catch (error) {
      res.status(500).json({ error: "Failed to transcribe audio" });
    }
  });

  app.post("/api/submissions/:id/recordings", isAuthenticated, recordingUpload.fields([
    { name: "screenRecording", maxCount: 1 },
    { name: "webcamRecording", maxCount: 1 },
  ]), async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const submissionId = p(req.params.id);
      const submission = await storage.getSubmission(submissionId);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      if (submission.studentId !== userId) {
        const exam = await storage.getExam(submission.examId);
        if (!exam || exam.professorId !== userId) {
          return res.status(403).json({ error: "Not authorized to upload recordings for this submission" });
        }
      }

      const { submissions: submissionsTable } = await import("@shared/schema");
      const drizzleOrm = await import("drizzle-orm");
      const { db } = await import("./db");

      const updates: any = {};

      if (req.files?.screenRecording?.[0]) {
        const file = req.files.screenRecording[0];
        const fileName = `screen_${submissionId}_${Date.now()}.webm`;
        await uploadRecordingToObjectStorage(fileName, file.buffer);
        updates.screenRecordingUrl = `/api/recordings/${fileName}`;
      }

      if (req.files?.webcamRecording?.[0]) {
        const file = req.files.webcamRecording[0];
        const fileName = `webcam_${submissionId}_${Date.now()}.webm`;
        await uploadRecordingToObjectStorage(fileName, file.buffer);
        updates.webcamRecordingUrl = `/api/recordings/${fileName}`;
      }

      if (Object.keys(updates).length > 0) {
        const screenRecordingUrl = updates.screenRecordingUrl || submission.screenRecordingUrl;
        const webcamRecordingUrl = updates.webcamRecordingUrl || submission.webcamRecordingUrl;
        if (screenRecordingUrl && webcamRecordingUrl) {
          updates.proctoringUploadStatus = "upload_saved";
          updates.proctoringUploadError = null;
        }
        await db.update(submissionsTable).set(updates).where(drizzleOrm.eq(submissionsTable.id, submissionId));
      }

      res.json({ success: true, ...updates });
    } catch (error) {
      console.error("Failed to upload recordings:", error);
      res.status(500).json({ error: "Failed to upload recordings" });
    }
  });

  app.post("/api/submissions/:id/proctoring-status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const submissionId = p(req.params.id);
      const submission = await storage.getSubmission(submissionId);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      if (submission.studentId !== userId) {
        const exam = await storage.getExam(submission.examId);
        if (!exam || exam.professorId !== userId) {
          return res.status(403).json({ error: "Not authorized to update proctoring status" });
        }
      }

      const statusSchema = z.object({
        status: z.enum(["upload_failed"]),
        error: z.string().max(1000).optional(),
      });
      const statusResult = statusSchema.safeParse(req.body);
      if (!statusResult.success) {
        return res.status(400).json({ error: "Invalid proctoring upload status" });
      }

      const { submissions: submissionsTable } = await import("@shared/schema");
      const drizzleOrm = await import("drizzle-orm");
      const { db } = await import("./db");

      await db.update(submissionsTable).set({
        proctoringUploadStatus: statusResult.data.status,
        proctoringUploadError: statusResult.data.error || "Recording upload failed",
      }).where(drizzleOrm.eq(submissionsTable.id, submissionId));

      res.json({ success: true });
    } catch (error) {
      console.error("Failed to update proctoring upload status:", error);
      res.status(500).json({ error: "Failed to update proctoring upload status" });
    }
  });

  app.get("/api/recordings/:filename", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    const filename = p(req.params.filename);
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return res.status(400).json({ error: "Invalid filename" });
    }

    const recordingPath = `/api/recordings/${filename}`;
    const [submission] = await db
      .select()
      .from(submissions)
      .where(or(
        eq(submissions.screenRecordingUrl, recordingPath),
        eq(submissions.webcamRecordingUrl, recordingPath),
      ))
      .limit(1);
    if (!submission) {
      return res.status(404).json({ error: "Recording not found" });
    }

    const requester = await storage.getUser(userId);
    if (!requester) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (submission.studentId !== userId && requester.role !== "admin") {
      const exam = await storage.getExam(submission.examId);
      if (!exam || requester.role !== "professor" || exam.professorId !== userId) {
        return res.status(403).json({ error: "Not authorized to view this recording" });
      }
    }

    // Check if recording file exists locally (for legacy files)
    try {
      const filePath = path.join(RECORDINGS_DIR, filename);
      if (fs.existsSync(filePath)) {
        res.setHeader("Content-Type", "video/webm");
        return res.sendFile(filePath);
      }
      
      const tempPath = path.join(os.tmpdir(), "voxexam-recordings", filename);
      if (fs.existsSync(tempPath)) {
        res.setHeader("Content-Type", "video/webm");
        return res.sendFile(tempPath);
      }

      // If not local, generate signed URL from GCS
      if (process.env.GCS_BUCKET_NAME || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        const storage = new Storage();
        const bucketName = process.env.GCS_BUCKET_NAME || "voxexam-recordings";
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(filename);
        const [url] = await file.getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        });
        return res.redirect(url);
      }

      return res.status(404).json({ error: "Recording not found on GCS or locally" });
    } catch (error) {
      console.error("Error retrieving recording:", error);
      res.status(500).json({ error: "Failed to retrieve recording" });
    }
  });

  app.post("/api/submissions/:id/proctoring", isAuthenticated, express.json({ limit: "50mb" }), async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const submissionId = p(req.params.id);
      const submission = await storage.getSubmission(submissionId);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      if (submission.studentId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const { flags, tabSwitchCount } = req.body;
      if (!flags || !Array.isArray(flags)) {
        return res.status(400).json({ error: "Invalid proctoring data" });
      }

      const { submissions: submissionsTable } = await import("@shared/schema");
      const drizzleOrm = await import("drizzle-orm");
      const { db } = await import("./db");

      const exam = await storage.getExam(submission.examId);
      const examTitle = exam?.title || "Unknown Exam";

      let customApiKey: string | null = null;
      if (exam?.classId) {
        const cls = await storage.getClass(exam.classId);
        if (cls?.universityId) {
          const uni = await storage.getUniversity(cls.universityId);
          if (uni?.geminiApiKey) customApiKey = uni.geminiApiKey;
        }
      }

      const analyzedFlags = [];
      for (const flag of flags) {
        const screenshotsToAnalyze = [flag.screenshotBefore, flag.screenshotDuring, flag.screenshotAfter].filter(Boolean) as string[];
        const labelMap = ["BEFORE leaving", "WHEN leaving", "AFTER returning"];
        const activeLabels = [flag.screenshotBefore && labelMap[0], flag.screenshotDuring && labelMap[1], flag.screenshotAfter && labelMap[2]].filter(Boolean) as string[];

        let aiVerdict = "Tab switch detected";
        if (screenshotsToAnalyze.length > 0) {
          aiVerdict = await analyzeProctoringScreenshot(screenshotsToAnalyze, activeLabels, examTitle, customApiKey);
        }

        analyzedFlags.push({
          type: "tab_switch",
          timestamp: flag.timestamp,
          durationAway: flag.durationAway || undefined,
          screenshotBefore: flag.screenshotBefore ? `[screenshot]` : undefined,
          screenshotDuring: flag.screenshotDuring ? `[screenshot]` : undefined,
          screenshotAfter: flag.screenshotAfter ? `[screenshot]` : undefined,
          aiVerdict,
        });
      }

      const existingFlags = (submission.proctoringFlags as any[]) || [];
      const allFlags = [...existingFlags, ...analyzedFlags];

      const switchCount = typeof tabSwitchCount === "number" ? tabSwitchCount : allFlags.length;
      const isSuspicious = switchCount >= TAB_SWITCH_SUSPICIOUS_THRESHOLD ? "true" : "false";

      await db.update(submissionsTable).set({
        proctoringFlags: allFlags,
        tabSwitchCount: switchCount,
        isSuspicious,
      }).where(drizzleOrm.eq(submissionsTable.id, submissionId));

      res.json({ success: true, flags: analyzedFlags, tabSwitchCount: switchCount, isSuspicious });
    } catch (error) {
      console.error("Failed to process proctoring data:", error);
      res.status(500).json({ error: "Failed to process proctoring data" });
    }
  });

  app.post("/api/submissions/:id/analyze-proctoring", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const submissionId = p(req.params.id);
      const submission = await storage.getSubmission(submissionId);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      const exam = await storage.getExam(submission.examId);
      if (!exam) {
        return res.status(404).json({ error: "Exam not found" });
      }

      if (exam.professorId !== userId) {
        return res.status(403).json({ error: "Only the exam professor can run proctoring analysis" });
      }

      const proctoringFlags = (submission.proctoringFlags as any[]) || [];
      const tabSwitchCount = submission.tabSwitchCount || proctoringFlags.length || 0;

      if (tabSwitchCount === 0 && proctoringFlags.length === 0) {
        return res.json({ analysis: "No tab switches detected — no proctoring concerns." });
      }

      let customApiKey: string | null = null;
      if (exam.classId) {
        const cls = await storage.getClass(exam.classId);
        if (cls?.universityId) {
          const uni = await storage.getUniversity(cls.universityId);
          if (uni?.geminiApiKey) customApiKey = uni.geminiApiKey;
        }
      }

      const analysis = await analyzeProctoringPatterns(
        exam.title,
        exam.questions,
        submission.responses,
        submission.scores,
        proctoringFlags,
        tabSwitchCount,
        customApiKey
      );

      res.json({ analysis });
    } catch (error) {
      console.error("Failed to analyze proctoring:", error);
      res.status(500).json({ error: "Failed to analyze proctoring patterns" });
    }
  });

  app.get("/api/students/:id/performance-radar", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user || user.role !== "professor") {
        return res.status(403).json({ error: "Only professors can access performance radar" });
      }

      const studentId = p(req.params.id);
      const student = await storage.getUser(studentId);
      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      const classId = p(req.query.classId as string | string[] | undefined);
      let filterExamIds: string[] | undefined;
      if (classId) {
        const cls = await storage.getClass(classId);
        if (!cls) {
          return res.status(404).json({ error: "Class not found" });
        }
        if (cls.professorId !== userId) {
          return res.status(403).json({ error: "You can only view performance data for your own classes" });
        }
        const classExams = await storage.getExamsByClass(classId);
        filterExamIds = classExams.map(e => e.id);
      } else {
        // Without an explicit class, scope the aggregate to exams owned by the
        // authenticated professor. A student ID alone is never authorization
        // to inspect work submitted to another professor.
        const professorExams = await storage.getExamsByProfessor(userId);
        filterExamIds = professorExams.map((exam) => exam.id);
      }

      const radar = await computeStudentRadar(studentId, filterExamIds);
      res.json(radar);
    } catch (error) {
      console.error("Failed to compute student performance radar:", error);
      res.status(500).json({ error: "Failed to compute performance radar" });
    }
  });

  app.get("/api/classes/:id/performance-radar", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user || user.role !== "professor") {
        return res.status(403).json({ error: "Only professors can access class performance radar" });
      }

      const classId = p(req.params.id);
      const cls = await storage.getClass(classId);
      if (!cls) {
        return res.status(404).json({ error: "Class not found" });
      }
      if (cls.professorId !== userId) {
        return res.status(403).json({ error: "You can only view performance data for your own classes" });
      }

      const classExams = await storage.getExamsByClass(classId);
      const examId = p(req.query.examId as string | string[] | undefined);
      let scopedExams = classExams;
      if (examId) {
        const selectedExam = classExams.find(e => e.id === examId);
        if (!selectedExam) {
          return res.status(404).json({ error: "Exam not found in this class" });
        }
        scopedExams = [selectedExam];
      }
      const scopedExamIds = scopedExams.map(e => e.id);

      if (scopedExamIds.length === 0) {
        return res.json([]);
      }

      const enrollmentsList = await storage.getEnrollmentsByClass(classId);
      const roster = cls.roster || [];
      const allUsers = await storage.getAllUsers();

      const studentIds = new Set<string>();
      for (const enrollment of enrollmentsList) {
        if (enrollment.studentId) {
          studentIds.add(enrollment.studentId);
        }
      }
      for (const exam of scopedExams) {
        for (const sid of (exam.assignedStudentIds || [])) {
          studentIds.add(sid);
        }
      }
      for (const rosterName of roster) {
        const matched = allUsers.find(
          u => u.role === "student" &&
            ((u.firstName + " " + u.lastName).toLowerCase() === rosterName.toLowerCase() ||
             u.email?.toLowerCase() === rosterName.toLowerCase())
        );
        if (matched) studentIds.add(matched.id);
      }

      const radars = await Promise.all(
        Array.from(studentIds).map(sid => computeStudentRadar(sid, scopedExamIds))
      );

      const nonEmpty = radars.filter(r => r.totalSubmissions > 0);
      res.json(nonEmpty);
    } catch (error) {
      console.error("Failed to compute class performance radar:", error);
      res.status(500).json({ error: "Failed to compute class performance radar" });
    }
  });

  // Exam access code regeneration
  app.post("/api/exams/:id/regenerate-code", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(getUserId(req));
      if (!user || user.role !== "professor") {
        return res.status(403).json({ error: "Only professors can regenerate exam codes" });
      }
      const exam = await storage.getExam(p(req.params.id));
      if (!exam) {
        return res.status(404).json({ error: "Exam not found" });
      }
      if (exam.professorId !== user.id) {
        return res.status(403).json({ error: "Not authorized" });
      }
      const updated = await storage.regenerateExamAccessCode(exam.id);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to regenerate exam code" });
    }
  });

  // Class join code regeneration
  app.post("/api/classes/:id/regenerate-code", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(getUserId(req));
      if (!user || user.role !== "professor") {
        return res.status(403).json({ error: "Only professors can regenerate class codes" });
      }
      const cls = await storage.getClass(p(req.params.id));
      if (!cls) {
        return res.status(404).json({ error: "Class not found" });
      }
      if (cls.professorId !== user.id) {
        return res.status(403).json({ error: "Not authorized" });
      }
      const updated = await storage.regenerateClassClassCode(p(req.params.id));
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to regenerate class code" });
    }
  });

  // Support request routes
  app.post("/api/support-requests", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      const request = await storage.createSupportRequest({
        userId,
        userName: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : "Unknown",
        userRole: user?.role || "unknown",
        message: req.body.message || null,
        pageUrl: req.body.pageUrl || null,
      });
      const { getWebSocketServer } = await import("./websocket");
      const wss = getWebSocketServer();
      if (wss) {
        wss.sendToAdmins({ type: "support_request", supportRequestId: request.id, request });
      }
      res.status(201).json(request);
    } catch (error) {
      res.status(500).json({ error: "Failed to create support request" });
    }
  });

  app.get("/api/admin/support-requests", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(getUserId(req));
      if (!user || user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      const requests = await storage.getSupportRequests();
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch support requests" });
    }
  });

  app.patch("/api/admin/support-requests/:id", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(getUserId(req));
      if (!user || user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      const updated = await storage.updateSupportRequestStatus(p(req.params.id), req.body.status);
      if (!updated) {
        return res.status(404).json({ error: "Support request not found" });
      }
      const { getWebSocketServer } = await import("./websocket");
      const wss = getWebSocketServer();
      if (wss) {
        wss.sendToUser(updated.userId, { type: "support_status_update", supportRequestId: updated.id, status: updated.status });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update support request" });
    }
  });

  app.get("/api/support-requests/:id/messages", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      const request = await storage.getSupportRequest(p(req.params.id));
      if (!request) {
        return res.status(404).json({ error: "Support request not found" });
      }
      if (request.userId !== userId && user?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized" });
      }
      const messages = await storage.getChatMessages(request.id);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.post("/api/support-requests/:id/messages", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      const request = await storage.getSupportRequest(p(req.params.id));
      if (!request) {
        return res.status(404).json({ error: "Support request not found" });
      }
      if (request.userId !== userId && user?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized" });
      }
      const senderRole = user?.role === "admin" ? "admin" : "user";
      const message = await storage.createChatMessage({
        supportRequestId: request.id,
        senderId: userId,
        senderRole,
        message: req.body.message,
      });
      if (request.status === "pending" && senderRole === "admin") {
        await storage.updateSupportRequestStatus(request.id, "in-progress");
      }
      const { getWebSocketServer } = await import("./websocket");
      const wss = getWebSocketServer();
      if (wss) {
        const chatPayload = { type: "chat_message", supportRequestId: request.id, message };
        const targetUserId = senderRole === "admin" ? request.userId : null;
        if (targetUserId) {
          wss.sendToUser(targetUserId, chatPayload);
        }
        if (senderRole === "user") {
          wss.sendToAdmins(chatPayload);
        }
      }
      res.status(201).json(message);
    } catch (error) {
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Admin user list
  app.get("/api/admin/users", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(getUserId(req));
      if (!user || user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      const allUsers = await storage.getAllUsers();
      const { getWebSocketServer } = await import("./websocket");
      const wss = getWebSocketServer();
      const onlineUserIds = wss ? wss.getOnlineUserIds() : [];
      const safeUsers = allUsers.map(u => {
        return { ...sanitizeUser(u), isOnline: onlineUserIds.includes(u.id) };
      });
      res.json(safeUsers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Get user's own active support request
  app.get("/api/my-support-request", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const requests = await storage.getSupportRequests();
      const active = requests.find(r => r.userId === userId && r.status !== "resolved");
      res.json(active || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch support request" });
    }
  });

  // Grade review requests
  app.post("/api/attempts/:id/review-request", isAuthenticated, async (req, res) => {
    try {
      const studentId = getUserId(req);
      const attemptId = p(req.params.id);
      const attempt = await storage.getSubmission(attemptId);
      if (!attempt) return res.status(404).json({ error: "Attempt not found" });
      if (attempt.studentId !== studentId) return res.status(403).json({ error: "Unauthorized" });
      
      const existing = await storage.getReviewRequestsByAttempt(attemptId);
      if (existing.some(r => r.status === "pending" || r.status === "in_review")) {
        return res.status(400).json({ error: "A review request is already active for this attempt." });
      }

      const { studentExplanation } = req.body;
      const reviewReq = await storage.createReviewRequest({
        attemptId,
        studentId,
        examId: attempt.examId,
        studentExplanation,
        status: "pending",
      });

      res.json(reviewReq);
    } catch (error) {
      res.status(500).json({ error: "Failed to create review request" });
    }
  });

  app.get("/api/review-requests", isProfessor, async (req, res) => {
    try {
      const professorId = getUserId(req);
      const requests = await storage.getReviewRequestsByProfessor(professorId);
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch review requests" });
    }
  });

  app.put("/api/review-requests/:id", isProfessor, async (req, res) => {
    try {
      const professorId = getUserId(req);
      const { status, professorResponse } = req.body;
      const reviewReq = await storage.getReviewRequest(p(req.params.id));
      if (!reviewReq) return res.status(404).json({ error: "Not found" });
      
      const exam = await storage.getExam(reviewReq.examId);
      if (!exam || exam.professorId !== professorId) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const updated = await storage.updateReviewRequest(reviewReq.id, {
        status,
        professorResponse,
        resolvedAt: ["approved", "partially_approved", "rejected", "resolved"].includes(status) ? new Date() : null,
        resolvedByProfessorId: professorId,
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update review request" });
    }
  });

  app.put("/api/attempts/:id/override-score", isProfessor, async (req, res) => {
    try {
      const professorId = getUserId(req);
      const attemptId = p(req.params.id);
      const { questionId, newScore, reason } = req.body;
      
      const attempt = await storage.getSubmission(attemptId);
      if (!attempt) return res.status(404).json({ error: "Not found" });
      
      const exam = await storage.getExam(attempt.examId);
      if (!exam || exam.professorId !== professorId) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      if (newScore < 0 || newScore > 1) {
        return res.status(400).json({ error: "Score must be between 0 and 1" });
      }
      if (!reason || !reason.trim()) {
        return res.status(400).json({ error: "A reason is required to override a score" });
      }

      const updated = await storage.overrideSubmissionScore(attemptId, questionId, newScore, reason, professorId);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to override score" });
    }
  });

  app.get("/api/exams/:id/attempts", isProfessor, async (req, res) => {
    try {
      const professorId = getUserId(req);
      const exam = await storage.getExam(p(req.params.id));
      if (!exam) return res.status(404).json({ error: "Exam not found" });
      if (exam.professorId !== professorId) {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const attempts = await storage.getSubmissionsByExam(exam.id);
      res.json(attempts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch attempts" });
    }
  });

  return httpServer;
}
