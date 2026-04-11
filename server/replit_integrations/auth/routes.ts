import type { Express } from "express";
import { randomUUID } from "crypto";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { db } from "../../db";
import { universities, exams, classes, enrollments } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { logUserEvent, storage } from "../../storage";

export function registerAuthRoutes(app: Express): void {
  app.post("/api/student-login", async (req: any, res) => {
    try {
      const { studentId, examCode } = req.body;
      if (!studentId || typeof studentId !== "string" || studentId.trim().length === 0) {
        return res.status(400).json({ message: "Student ID is required" });
      }
      if (!examCode || typeof examCode !== "string" || examCode.trim().length === 0) {
        return res.status(400).json({ message: "Exam code is required" });
      }

      const trimmedStudentId = studentId.trim();
      const trimmedExamCode = examCode.trim();

      let exam;
      const isShortCode = /^\d{5}$/.test(trimmedExamCode) || (trimmedExamCode.length <= 10 && !trimmedExamCode.includes("-"));

      if (isShortCode) {
        exam = await storage.getExamByAccessCode(trimmedExamCode);
        if (!exam) {
          const [byId] = await db.select().from(exams).where(eq(exams.id, trimmedExamCode));
          exam = byId;
        }
        if (exam && exam.accessCodeExpiresAt && new Date(exam.accessCodeExpiresAt) < new Date()) {
          return res.status(410).json({ message: "This exam code has expired. Please ask your professor for a new code." });
        }
      } else {
        const [byId] = await db.select().from(exams).where(eq(exams.id, trimmedExamCode));
        exam = byId;
      }

      if (!exam) {
        return res.status(404).json({ message: "Invalid exam code. Please check with your professor." });
      }

      const nameSlug = trimmedStudentId.toLowerCase().replace(/\s+/g, "-");
      const localUserId = `local-${exam.id}-${nameSlug}`;

      const assignedByName = (exam.assignedStudentNames || []).some(
        (n: string) => n.toLowerCase() === trimmedStudentId.toLowerCase()
      );
      const assignedById = (exam.assignedStudentIds || []).includes(localUserId);
      const hasAssignedStudents = (exam.assignedStudentNames || []).length > 0 || (exam.assignedStudentIds || []).length > 0;

      if (hasAssignedStudents && !assignedByName && !assignedById) {
        return res.status(403).json({ message: "You are not assigned to this exam. Please contact your professor." });
      }

      const localEmail = `${nameSlug}.${exam.id.slice(0, 8)}@local.voxexams`;

      await authStorage.upsertUser({
        id: localUserId,
        email: localEmail,
        firstName: trimmedStudentId,
        lastName: "",
        profileImageUrl: null,
      });

      const { users } = await import("@shared/models/auth");
      await db.update(users).set({
        role: "student",
        authProvider: "local",
        studentId: trimmedStudentId,
      }).where(eq(users.id, localUserId));

      if (!assignedById) {
        const updatedIds = [...(exam.assignedStudentIds || []), localUserId];
        await db.update(exams).set({ assignedStudentIds: updatedIds }).where(eq(exams.id, exam.id));
      }

      const sessionUser = {
        claims: {
          sub: localUserId,
          email: localEmail,
          first_name: trimmedStudentId,
          last_name: "",
          exp: Math.floor(Date.now() / 1000) + 86400 * 7,
        },
        access_token: `local-token-${localUserId}`,
        refresh_token: null,
        expires_at: Math.floor(Date.now() / 1000) + 86400 * 7,
      };

      req.login(sessionUser, (err: any) => {
        if (err) {
          console.error("Student login error:", err);
          return res.status(500).json({ message: "Login failed" });
        }
        logUserEvent(localUserId, "login", { authProvider: "local", studentId: trimmedStudentId, examCode: trimmedExamCode });
        return res.json({ success: true, examId: exam.id });
      });
    } catch (error) {
      console.error("Student login error:", error);
      res.status(500).json({ message: "Student login failed" });
    }
  });

  app.post("/api/demo-login", async (req: any, res) => {
    try {
      const { role } = req.body;
      if (!role || !["professor", "student"].includes(role)) {
        return res.status(400).json({ message: "Role must be 'professor' or 'student'" });
      }

      let demoSessionId = req.cookies?.demo_session_id;
      if (!demoSessionId) {
        demoSessionId = randomUUID().slice(0, 8);
        res.cookie("demo_session_id", demoSessionId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          maxAge: 7 * 24 * 60 * 60 * 1000,
          sameSite: "lax",
        });
      }

      const demoId = `demo-${role}-${demoSessionId}`;
      const demoEmail = `demo-${role}-${demoSessionId}@voxexams.local`;
      const firstName = "Demo";
      const lastName = role === "professor" ? "Professor" : "Student";

      await authStorage.upsertUser({
        id: demoId,
        email: demoEmail,
        firstName,
        lastName,
        profileImageUrl: null,
      });

      const existingUser = await authStorage.getUser(demoId);
      if (existingUser && existingUser.role !== role) {
        const { users } = await import("@shared/models/auth");
        await db.update(users).set({ role }).where(eq(users.id, demoId));
      } else if (existingUser && !existingUser.role) {
        const { users } = await import("@shared/models/auth");
        await db.update(users).set({ role }).where(eq(users.id, demoId));
      }

      const sessionUser = {
        claims: {
          sub: demoId,
          email: demoEmail,
          first_name: firstName,
          last_name: lastName,
          exp: Math.floor(Date.now() / 1000) + 86400 * 7,
        },
        access_token: `demo-token-${demoId}`,
        refresh_token: null,
        expires_at: Math.floor(Date.now() / 1000) + 86400 * 7,
      };

      req.login(sessionUser, (err: any) => {
        if (err) {
          console.error("Demo login error:", err);
          return res.status(500).json({ message: "Login failed" });
        }
        logUserEvent(demoId, "login", { authProvider: "demo", role });
        return res.json({ success: true, demoSessionId });
      });
    } catch (error) {
      console.error("Demo login error:", error);
      res.status(500).json({ message: "Demo login failed" });
    }
  });

  app.get("/api/demo-logout", (req: any, res) => {
    req.logout(() => {
      if (req.session) {
        req.session.destroy(() => {});
      }
      res.clearCookie("demo_session_id");
      res.redirect("/");
    });
  });

  app.post("/api/class-login", async (req: any, res) => {
    try {
      const { studentName, classCode } = req.body;
      if (!studentName || typeof studentName !== "string" || studentName.trim().length === 0) {
        return res.status(400).json({ message: "Your name is required" });
      }
      if (!classCode || typeof classCode !== "string" || classCode.trim().length === 0) {
        return res.status(400).json({ message: "Class code is required" });
      }

      const trimmedName = studentName.trim();
      const trimmedCode = classCode.trim().toUpperCase();

      const cls = await storage.getClassByJoinCode(trimmedCode);
      if (!cls) {
        return res.status(404).json({ message: "Invalid class code. Please check with your professor." });
      }

      const nameSlug = trimmedName.toLowerCase().replace(/\s+/g, "-");
      const localUserId = `local-class-${cls.id.slice(0, 8)}-${nameSlug}`;
      const localEmail = `${nameSlug}.class.${cls.id.slice(0, 8)}@local.voxexams`;

      await authStorage.upsertUser({
        id: localUserId,
        email: localEmail,
        firstName: trimmedName,
        lastName: "",
        profileImageUrl: null,
      });

      const { users } = await import("@shared/models/auth");
      await db.update(users).set({
        role: "student",
        authProvider: "local",
        studentId: trimmedName,
      }).where(eq(users.id, localUserId));

      const currentRoster = cls.roster || [];
      if (!currentRoster.some((n: string) => n.toLowerCase() === trimmedName.toLowerCase())) {
        await storage.updateClassRoster(cls.id, [...currentRoster, trimmedName]);
      }

      const existingEnrollments = await storage.getEnrollmentsByStudent(localUserId);
      const alreadyEnrolled = existingEnrollments.some(e => e.classId === cls.id);
      if (!alreadyEnrolled) {
        await storage.createEnrollment({ studentId: localUserId, classId: cls.id });
      }

      const sessionUser = {
        claims: {
          sub: localUserId,
          email: localEmail,
          first_name: trimmedName,
          last_name: "",
          exp: Math.floor(Date.now() / 1000) + 86400 * 7,
        },
        access_token: `local-token-${localUserId}`,
        refresh_token: null,
        expires_at: Math.floor(Date.now() / 1000) + 86400 * 7,
      };

      req.login(sessionUser, (err: any) => {
        if (err) {
          console.error("Class login error:", err);
          return res.status(500).json({ message: "Login failed" });
        }
        logUserEvent(localUserId, "login", { authProvider: "local", classCode: trimmedCode, classId: cls.id });
        return res.json({ success: true, classId: cls.id, className: cls.name });
      });
    } catch (error) {
      console.error("Class login error:", error);
      res.status(500).json({ message: "Class login failed" });
    }
  });

  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      if (user) {
        const { openaiApiKey, ...safeUser } = user;
        let universityHasApiKey = false;
        if (user.universityId) {
          const [uni] = await db.select().from(universities).where(eq(universities.id, user.universityId));
          if (uni?.openaiApiKey) universityHasApiKey = true;
        }
        res.json({ ...safeUser, universityHasApiKey });
      } else {
        res.json(null);
      }
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
