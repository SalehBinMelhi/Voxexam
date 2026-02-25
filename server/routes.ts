import express from "express";
import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { createRequire } from "module";
import fs from "fs";
import path from "path";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { storage, transcribeAudio, generateQuestionsFromMaterials, aiQuestionChat, generateFeedback, analyzeProctoringScreenshot, analyzeProctoringPatterns, computeStudentRadar } from "./storage";
import { isAuthenticated } from "./replit_integrations/auth";
import { insertExamSchema, insertExamSubmissionSchema, TAB_SWITCH_SUSPICIOUS_THRESHOLD } from "@shared/schema";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const recordingUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const RECORDINGS_DIR = path.join(process.cwd(), "recordings");
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
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
    const { openaiApiKey, ...safe } = user;
    return safe;
  };

  const sanitizeUniversity = (uni: any) => {
    const { openaiApiKey, ...safe } = uni;
    return { ...safe, hasApiKey: !!openaiApiKey };
  };

  app.get("/api/users", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.claims.sub;
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
      const user = await storage.getUser(p(req.params.id));
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
      const userId = req.user!.claims.sub;
      if (userId !== p(req.params.id)) {
        return res.status(403).json({ error: "Cannot update another user's role" });
      }
      const { role, universityId } = req.body;
      if (!role || (role !== "professor" && role !== "student")) {
        return res.status(400).json({ error: "Invalid role" });
      }
      const user = await storage.updateUserRole(p(req.params.id), role, universityId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to update user role" });
    }
  });

  app.patch("/api/universities/:id/api-key", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.claims.sub;
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
      res.json({ hasApiKey: !!uni.openaiApiKey });
    } catch (error) {
      res.status(500).json({ error: "Failed to update API key" });
    }
  });

  app.post("/api/generate-questions", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.claims.sub;
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
        if (uni?.openaiApiKey) customApiKey = uni.openaiApiKey;
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
      const userId = req.user!.claims.sub;
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
        if (uni?.openaiApiKey) customApiKey = uni.openaiApiKey;
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
      const userId = req.user!.claims.sub;
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
      const userId = req.user!.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      if (user.role === "professor") {
        const classes = await storage.getClassesByProfessor(userId);
        res.json(classes);
      } else if (user.role === "student") {
        const enrollmentsList = await storage.getEnrollmentsByStudent(userId);
        const classIds = enrollmentsList.map(e => e.classId);
        const allClasses = await Promise.all(classIds.map(id => storage.getClass(id)));
        res.json(allClasses.filter(Boolean));
      } else {
        res.json([]);
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch classes" });
    }
  });

  app.get("/api/classes/:id", isAuthenticated, async (req, res) => {
    try {
      const cls = await storage.getClass(p(req.params.id));
      if (!cls) {
        return res.status(404).json({ error: "Class not found" });
      }
      res.json(cls);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch class" });
    }
  });

  app.post("/api/classes", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.claims.sub;
      const user = await storage.getUser(userId);
      if (!user || user.role !== "professor") {
        return res.status(403).json({ error: "Only professors can create classes" });
      }
      const { name, universityId, roster } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Class name is required" });
      }
      const cls = await storage.createClass({ name, universityId, professorId: userId, roster: roster || [] });
      res.status(201).json(cls);
    } catch (error) {
      res.status(500).json({ error: "Failed to create class" });
    }
  });

  app.patch("/api/classes/:id/roster", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.claims.sub;
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
      const userId = req.user!.claims.sub;
      const user = await storage.getUser(userId);
      if (!user || user.role !== "professor") {
        return res.status(403).json({ error: "Only professors can delete classes" });
      }
      const deleted = await storage.deleteClass(p(req.params.id));
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
      const enrollmentsList = await storage.getEnrollmentsByClass(p(req.params.classId));
      const students = await Promise.all(
        enrollmentsList.map(async (e) => {
          const user = await storage.getUser(e.studentId);
          return { ...e, student: user };
        })
      );
      res.json(students);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch enrollments" });
    }
  });

  app.post("/api/classes/:classId/enroll", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.claims.sub;
      const classId = p(req.params.classId);
      
      const existingEnrollments = await storage.getEnrollmentsByStudent(userId);
      const alreadyEnrolled = existingEnrollments.some(e => e.classId === classId);
      if (alreadyEnrolled) {
        return res.status(400).json({ error: "Already enrolled in this class" });
      }
      
      const enrollment = await storage.createEnrollment({ studentId: userId, classId });
      res.status(201).json(enrollment);
    } catch (error) {
      res.status(500).json({ error: "Failed to enroll" });
    }
  });

  app.post("/api/classes/:classId/enrollments", isAuthenticated, async (req, res) => {
    try {
      const { studentId } = req.body;
      const classId = p(req.params.classId);
      
      if (!studentId) {
        return res.status(400).json({ error: "Student ID is required" });
      }
      
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
      const deleted = await storage.deleteEnrollment(p(req.params.studentId), p(req.params.classId));
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
      const materials = await storage.getMaterialsByClass(p(req.params.classId));
      res.json(materials.map(m => ({ ...m, content: m.content.substring(0, 200) + (m.content.length > 200 ? "..." : "") })));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch materials" });
    }
  });

  app.post("/api/classes/:classId/materials", isAuthenticated, upload.single("file"), async (req: any, res) => {
    try {
      const userId = req.user!.claims.sub;
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
        // Try unpdf first (modern, handles more PDF types)
        try {
          const { extractText, getDocumentProxy } = await import("unpdf");
          const pdfDoc = await getDocumentProxy(new Uint8Array(file.buffer));
          const { text } = await extractText(pdfDoc, { mergePages: true });
          content = text || "";
          console.log("[PDF] unpdf extracted", content.length, "chars");
        } catch (unpdfError: any) {
          console.error("[PDF] unpdf failed, trying pdf-parse fallback:", unpdfError?.message);
          // Fallback to pdf-parse
          try {
            const pdfData = await pdf(file.buffer);
            content = pdfData.text || "";
            console.log("[PDF] pdf-parse extracted", content.length, "chars");
          } catch (pdfParseError: any) {
            console.error("[PDF] pdf-parse also failed:", pdfParseError?.message);
          }
        }

        if (!content || content.trim().length === 0) {
          return res.status(400).json({
            error: "Could not read this PDF. It may be scanned, image-based, or password-protected. Try re-saving it as a new PDF, or convert it to a .docx or .txt file first."
          });
        }
      } else if (fileName.endsWith(".docx") || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        try {
          const result = await mammoth.extractRawText({ buffer: file.buffer });
          content = result.value;
        } catch {
          return res.status(400).json({ error: "Could not parse Word document" });
        }
      } else if (fileName.endsWith(".pptx") || mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
        try {
          const zip = await JSZip.loadAsync(file.buffer);
          const slideTexts: string[] = [];
          const slideFiles = Object.keys(zip.files).filter(f => f.match(/^ppt\/slides\/slide\d+\.xml$/)).sort();
          for (const slideFile of slideFiles) {
            const xmlContent = await zip.files[slideFile].async("text");
            const textMatches = xmlContent.match(/<a:t>([^<]*)<\/a:t>/g);
            if (textMatches) {
              const slideText = textMatches.map(m => m.replace(/<\/?a:t>/g, "")).join(" ");
              slideTexts.push(slideText);
            }
          }
          content = slideTexts.join("\n\n");
        } catch {
          return res.status(400).json({ error: "Could not parse PowerPoint file" });
        }
      } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls") ||
                 mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
                 mimeType === "application/vnd.ms-excel") {
        try {
          const workbook = XLSX.read(file.buffer, { type: "buffer" });
          const sheetTexts: string[] = [];
          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(sheet);
            if (csv.trim()) {
              sheetTexts.push(`Sheet: ${sheetName}\n${csv}`);
            }
          }
          content = sheetTexts.join("\n\n");
        } catch {
          return res.status(400).json({ error: "Could not parse Excel file" });
        }
      } else if (mimeType.startsWith("text/") || mimeType === "application/json" ||
                 fileName.endsWith(".txt") || fileName.endsWith(".md") || fileName.endsWith(".csv")) {
        content = file.buffer.toString("utf-8");
      } else {
        return res.status(400).json({ error: "Unsupported file type. Please upload PDF, Word, PowerPoint, Excel, TXT, MD, or CSV files." });
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
      const userId = req.user!.claims.sub;
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
      const userId = req.user!.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      if (user.role === "professor") {
        const examsList = await storage.getExamsByProfessor(userId);
        res.json(examsList);
      } else {
        const enrollmentsList = await storage.getEnrollmentsByStudent(userId);
        const classIds = enrollmentsList.map(e => e.classId);
        
        const allExams = await storage.getAllExams();
        const myExams = allExams.filter(exam => {
          const assignedById = exam.assignedStudentIds.includes(userId);
          const assignedByName = (exam.assignedStudentNames || []).some(
            n => n.toLowerCase() === (user.firstName?.toLowerCase() + " " + user.lastName?.toLowerCase()) ||
                 n.toLowerCase() === (user.email?.toLowerCase() || "")
          );
          const inClass = exam.classId && classIds.includes(exam.classId);
          return assignedById || assignedByName || inClass;
        });
        res.json(myExams);
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch exams" });
    }
  });

  app.get("/api/exams/:id", isAuthenticated, async (req, res) => {
    try {
      const exam = await storage.getExam(p(req.params.id));
      if (!exam) {
        return res.status(404).json({ error: "Exam not found" });
      }
      res.json(exam);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch exam" });
    }
  });

  app.post("/api/exams", isAuthenticated, async (req, res) => {
    try {
      const parseResult = insertExamSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid exam data", 
          details: parseResult.error.errors 
        });
      }

      const professorId = req.user!.claims.sub;
      const exam = await storage.createExam(professorId, parseResult.data);
      res.status(201).json(exam);
    } catch (error) {
      res.status(500).json({ error: "Failed to create exam" });
    }
  });

  app.patch("/api/exams/:id", isAuthenticated, async (req, res) => {
    try {
      const exam = await storage.updateExam(p(req.params.id), req.body);
      if (!exam) {
        return res.status(404).json({ error: "Exam not found" });
      }
      res.json(exam);
    } catch (error) {
      res.status(500).json({ error: "Failed to update exam" });
    }
  });

  app.delete("/api/exams/:id", isAuthenticated, async (req, res) => {
    try {
      const deleted = await storage.deleteExam(p(req.params.id));
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
      
      let subs;
      const includePreview = req.query.includePreview === "true";
      if (examId) {
        subs = await storage.getSubmissionsByExam(examId as string);
      } else if (studentId) {
        subs = await storage.getSubmissionsByStudent(studentId as string);
      } else {
        const userId = req.user!.claims.sub;
        const user = await storage.getUser(userId);
        if (user?.role === "professor") {
          const profExams = await storage.getExamsByProfessor(userId);
          const examIds = profExams.map(e => e.id);
          const allSubs = await storage.getAllSubmissions();
          subs = allSubs.filter(s => examIds.includes(s.examId));
        } else {
          subs = await storage.getSubmissionsByStudent(userId);
        }
      }

      if (!includePreview) {
        subs = subs.filter(s => s.isPreview !== "true");
      }
      
      res.json(subs);
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
      res.json(submission);
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

      const { examId, responses, isPreview } = parseResult.data;
      const studentId = req.user!.claims.sub;

      const exam = await storage.getExam(examId);
      if (!exam) {
        return res.status(404).json({ error: "Exam not found" });
      }

      if (!isPreview) {
        if (exam.startTime && exam.endTime) {
          const now = new Date();
          const start = new Date(exam.startTime);
          const end = new Date(exam.endTime);
          
          if (now < start || now > end) {
            return res.status(400).json({ error: "Exam is not currently active" });
          }
        }

        const existingSubmissions = await storage.getSubmissionsByStudent(studentId);
        const alreadySubmitted = existingSubmissions.some(s => s.examId === examId && s.isPreview !== "true");
        if (alreadySubmitted) {
          return res.status(400).json({ error: "You have already submitted this exam" });
        }
      }

      const submission = await storage.createSubmission(studentId, examId, responses, !!isPreview);
      res.status(201).json(submission);
    } catch (error) {
      res.status(500).json({ error: "Failed to create submission" });
    }
  });

  app.patch("/api/submissions/:id/score", isAuthenticated, async (req, res) => {
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

  app.post("/api/submissions/:id/feedback", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.claims.sub;

      const submission = await storage.getSubmission(p(req.params.id));
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      const exam = await storage.getExam(submission.examId);
      if (!exam) {
        return res.status(404).json({ error: "Exam not found" });
      }

      if (exam.professorId !== userId && submission.studentId !== userId) {
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
        if (uni?.openaiApiKey) customApiKey = uni.openaiApiKey;
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
      const userId = req.user!.claims.sub;
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
        const filePath = path.join(RECORDINGS_DIR, fileName);
        fs.writeFileSync(filePath, file.buffer);
        updates.screenRecordingUrl = `/api/recordings/${fileName}`;
      }

      if (req.files?.webcamRecording?.[0]) {
        const file = req.files.webcamRecording[0];
        const fileName = `webcam_${submissionId}_${Date.now()}.webm`;
        const filePath = path.join(RECORDINGS_DIR, fileName);
        fs.writeFileSync(filePath, file.buffer);
        updates.webcamRecordingUrl = `/api/recordings/${fileName}`;
      }

      if (Object.keys(updates).length > 0) {
        await db.update(submissionsTable).set(updates).where(drizzleOrm.eq(submissionsTable.id, submissionId));
      }

      res.json({ success: true, ...updates });
    } catch (error) {
      console.error("Failed to upload recordings:", error);
      res.status(500).json({ error: "Failed to upload recordings" });
    }
  });

  app.get("/api/recordings/:filename", isAuthenticated, async (req, res) => {
    const userId = req.user!.claims.sub;
    const filename = p(req.params.filename);
    if (filename.includes("..") || filename.includes("/")) {
      return res.status(400).json({ error: "Invalid filename" });
    }

    const submissionIdMatch = filename.match(/(?:screen|webcam)_([^_]+)_/);
    if (submissionIdMatch) {
      const subId = submissionIdMatch[1];
      const submission = await storage.getSubmission(subId);
      if (submission) {
        if (submission.studentId !== userId) {
          const exam = await storage.getExam(submission.examId);
          if (!exam || exam.professorId !== userId) {
            return res.status(403).json({ error: "Not authorized to view this recording" });
          }
        }
      }
    }

    const filePath = path.join(RECORDINGS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Recording not found" });
    }
    res.setHeader("Content-Type", "video/webm");
    res.sendFile(filePath);
  });

  app.post("/api/submissions/:id/proctoring", isAuthenticated, express.json({ limit: "50mb" }), async (req: any, res) => {
    try {
      const userId = req.user!.claims.sub;
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
          if (uni?.openaiApiKey) customApiKey = uni.openaiApiKey;
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
      const userId = req.user!.claims.sub;
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
          if (uni?.openaiApiKey) customApiKey = uni.openaiApiKey;
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
      const userId = req.user!.claims.sub;
      const user = await storage.getUser(userId);
      if (!user || user.role !== "professor") {
        return res.status(403).json({ error: "Only professors can access performance radar" });
      }

      const studentId = p(req.params.id);
      const student = await storage.getUser(studentId);
      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      const radar = await computeStudentRadar(studentId);
      res.json(radar);
    } catch (error) {
      console.error("Failed to compute student performance radar:", error);
      res.status(500).json({ error: "Failed to compute performance radar" });
    }
  });

  app.get("/api/classes/:id/performance-radar", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.claims.sub;
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
      const classExamIds = classExams.map(e => e.id);

      if (classExamIds.length === 0) {
        return res.json([]);
      }

      const enrollmentsList = await storage.getEnrollmentsByClass(classId);
      const roster = cls.roster || [];
      const allUsers = await storage.getAllUsers();

      const studentIds = new Set<string>();
      for (const enrollment of enrollmentsList) {
        studentIds.add(enrollment.studentId);
      }
      for (const exam of classExams) {
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
        Array.from(studentIds).map(sid => computeStudentRadar(sid, classExamIds))
      );

      const nonEmpty = radars.filter(r => r.totalSubmissions > 0);
      res.json(nonEmpty);
    } catch (error) {
      console.error("Failed to compute class performance radar:", error);
      res.status(500).json({ error: "Failed to compute class performance radar" });
    }
  });

  return httpServer;
}
