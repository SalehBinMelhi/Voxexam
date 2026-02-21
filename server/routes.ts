import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { storage, transcribeAudio } from "./storage";
import { isAuthenticated } from "./replit_integrations/auth";
import { insertExamSchema, insertExamSubmissionSchema } from "@shared/schema";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
  app.get("/api/users", isAuthenticated, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
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
      res.json(user);
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

  // Universities routes
  app.get("/api/universities", isAuthenticated, async (req, res) => {
    try {
      const universities = await storage.getAllUniversities();
      res.json(universities);
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
      res.json(university);
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
      const { name, universityId } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Class name is required" });
      }
      const cls = await storage.createClass({ name, universityId, professorId: userId });
      res.status(201).json(cls);
    } catch (error) {
      res.status(500).json({ error: "Failed to create class" });
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

      if (mimeType === "application/pdf") {
        try {
          const pdfData = await pdf(file.buffer);
          content = pdfData.text;
        } catch {
          return res.status(400).json({ error: "Could not parse PDF file" });
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

      const { examId, responses } = parseResult.data;
      const studentId = req.user!.claims.sub;

      const exam = await storage.getExam(examId);
      if (!exam) {
        return res.status(404).json({ error: "Exam not found" });
      }

      if (exam.startTime && exam.endTime) {
        const now = new Date();
        const start = new Date(exam.startTime);
        const end = new Date(exam.endTime);
        
        if (now < start || now > end) {
          return res.status(400).json({ error: "Exam is not currently active" });
        }
      }

      const existingSubmissions = await storage.getSubmissionsByStudent(studentId);
      const alreadySubmitted = existingSubmissions.some(s => s.examId === examId);
      if (alreadySubmitted) {
        return res.status(400).json({ error: "You have already submitted this exam" });
      }

      const submission = await storage.createSubmission(studentId, examId, responses);
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

  app.post("/api/transcribe", isAuthenticated, async (req, res) => {
    try {
      const { audioData } = req.body;
      if (!audioData || typeof audioData !== "string") {
        return res.status(400).json({ error: "audioData is required" });
      }
      const transcript = await transcribeAudio(audioData);
      res.json({ transcript });
    } catch (error) {
      res.status(500).json({ error: "Failed to transcribe audio" });
    }
  });

  return httpServer;
}
