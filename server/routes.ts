import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertExamSchema, insertExamSubmissionSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Auth routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, role } = req.body;
      
      if (!username || !role || (role !== "professor" && role !== "student")) {
        return res.status(400).json({ error: "Invalid username or role" });
      }

      // Look up user by both username AND role to allow same name for different roles
      let user = await storage.getUserByUsernameAndRole(username, role);
      
      if (!user) {
        user = await storage.createUser({ username, role });
      }

      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to login" });
    }
  });

  // Users routes
  app.get("/api/users", async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // Exams routes
  app.get("/api/exams", async (req, res) => {
    try {
      const exams = await storage.getAllExams();
      res.json(exams);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch exams" });
    }
  });

  app.get("/api/exams/:id", async (req, res) => {
    try {
      const exam = await storage.getExam(req.params.id);
      if (!exam) {
        return res.status(404).json({ error: "Exam not found" });
      }
      res.json(exam);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch exam" });
    }
  });

  app.post("/api/exams", async (req, res) => {
    try {
      const parseResult = insertExamSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid exam data", 
          details: parseResult.error.errors 
        });
      }

      const professorId = parseResult.data.professorId || req.headers["x-user-id"];
      if (!professorId) {
        return res.status(400).json({ error: "Professor ID is required" });
      }

      const exam = await storage.createExam(professorId as string, parseResult.data);
      res.status(201).json(exam);
    } catch (error) {
      res.status(500).json({ error: "Failed to create exam" });
    }
  });

  app.patch("/api/exams/:id", async (req, res) => {
    try {
      const exam = await storage.updateExam(req.params.id, req.body);
      if (!exam) {
        return res.status(404).json({ error: "Exam not found" });
      }
      res.json(exam);
    } catch (error) {
      res.status(500).json({ error: "Failed to update exam" });
    }
  });

  app.delete("/api/exams/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteExam(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Exam not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete exam" });
    }
  });

  // Submissions routes
  app.get("/api/submissions", async (req, res) => {
    try {
      const { examId, studentId } = req.query;
      
      let submissions;
      if (examId) {
        submissions = await storage.getSubmissionsByExam(examId as string);
      } else if (studentId) {
        submissions = await storage.getSubmissionsByStudent(studentId as string);
      } else {
        submissions = await storage.getAllSubmissions();
      }
      
      res.json(submissions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch submissions" });
    }
  });

  app.get("/api/submissions/:id", async (req, res) => {
    try {
      const submission = await storage.getSubmission(req.params.id);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }
      res.json(submission);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch submission" });
    }
  });

  app.post("/api/submissions", async (req, res) => {
    try {
      const parseResult = insertExamSubmissionSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid submission data", 
          details: parseResult.error.errors 
        });
      }

      const { examId, responses, studentId } = parseResult.data;

      const actualStudentId = studentId || req.headers["x-user-id"];
      if (!actualStudentId) {
        return res.status(400).json({ error: "Student ID is required" });
      }

      // Check if exam exists
      const exam = await storage.getExam(examId);
      if (!exam) {
        return res.status(404).json({ error: "Exam not found" });
      }

      // Check if student is assigned to exam (by ID or by name)
      const student = await storage.getUser(actualStudentId as string);
      const isAssignedById = exam.assignedStudentIds.includes(actualStudentId as string);
      const isAssignedByName = student && (exam.assignedStudentNames || []).some(
        (name) => name.toLowerCase() === student.username.toLowerCase()
      );
      
      if (!isAssignedById && !isAssignedByName) {
        return res.status(403).json({ error: "Student is not assigned to this exam" });
      }

      // Check if exam is active
      if (exam.startTime && exam.endTime) {
        const now = new Date();
        const start = new Date(exam.startTime);
        const end = new Date(exam.endTime);
        
        if (now < start || now > end) {
          return res.status(400).json({ error: "Exam is not currently active" });
        }
      }

      // Check if student has already submitted
      const existingSubmissions = await storage.getSubmissionsByStudent(actualStudentId as string);
      const alreadySubmitted = existingSubmissions.some(s => s.examId === examId);
      if (alreadySubmitted) {
        return res.status(400).json({ error: "You have already submitted this exam" });
      }

      const submission = await storage.createSubmission(
        actualStudentId as string,
        examId,
        responses
      );
      
      res.status(201).json(submission);
    } catch (error) {
      res.status(500).json({ error: "Failed to create submission" });
    }
  });

  // Update submission score (for manual grading by professor)
  app.patch("/api/submissions/:id/score", async (req, res) => {
    try {
      const { questionId, score } = req.body;
      
      if (!questionId || typeof score !== "number") {
        return res.status(400).json({ error: "questionId and score are required" });
      }

      if (score < 0 || score > 1) {
        return res.status(400).json({ error: "Score must be between 0 and 1" });
      }

      const submission = await storage.updateSubmissionScore(
        req.params.id,
        questionId,
        score
      );

      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      res.json(submission);
    } catch (error) {
      res.status(500).json({ error: "Failed to update submission score" });
    }
  });

  return httpServer;
}
