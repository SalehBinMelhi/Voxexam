import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler, Request, Response } from "express";
import connectPg from "connect-pg-simple";
import { db } from "./db";
import { users, type User } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from "crypto";
import { storage } from "./storage";

// ---------------------------------------------------------------------------
// Password hashing utilities (Node.js built-in scrypt — no extra dependency)
// ---------------------------------------------------------------------------
const SALT_LENGTH = 32;
const KEY_LENGTH = 64;

function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, "hex");
  const derivedBuffer = scryptSync(password, salt, KEY_LENGTH);
  return timingSafeEqual(hashBuffer, derivedBuffer);
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
const PROFESSOR_DOMAIN = "@voxexam.ae";

function isValidProfessorEmail(email: string): boolean {
  return email.toLowerCase().trim().endsWith(PROFESSOR_DOMAIN);
}

function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters long.";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
  return null;
}

// ---------------------------------------------------------------------------
// Session middleware
// ---------------------------------------------------------------------------
let sessionMiddleware: RequestHandler | null = null;

export function getSessionMiddleware(): RequestHandler {
  if (sessionMiddleware) return sessionMiddleware;
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week

  let store: session.Store;
  if (process.env.DATABASE_URL) {
    const pgStore = connectPg(session);
    store = new pgStore({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
      ttl: sessionTtl,
      tableName: "sessions",
    });
  } else {
    store = new session.MemoryStore();
  }

  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set in production");
  } else if (!process.env.SESSION_SECRET) {
    console.warn("WARNING: SESSION_SECRET is not set, using default fallback. Do not use this in production.");
  }

  sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || "voxexam-default-local-secret",
    store,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
      sameSite: "lax",
    },
  });

  return sessionMiddleware;
}

export async function setupAuth(app: Express): Promise<void> {
  app.set("trust proxy", 1);
  const sm = getSessionMiddleware();
  app.use(sm);
  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: any, cb) => cb(null, user));
  passport.deserializeUser((user: any, cb) => cb(null, user));
}

export function registerAuthRoutes(app: Express): void {
  // Current user status endpoint
  app.get("/api/auth/user", async (req: Request, res: Response) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const sessUser = req.user as any;
    const userId = sessUser.claims?.sub || sessUser.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const [dbUser] = await db.select().from(users).where(eq(users.id, userId));
    if (!dbUser) {
      return res.json({
        id: userId,
        email: sessUser.claims?.email || "demo@voxexam.local",
        firstName: sessUser.claims?.first_name || "Demo",
        lastName: sessUser.claims?.last_name || "User",
        role: sessUser.role || "student",
      });
    }

    // Never expose passwordHash to the client
    const { passwordHash: _ph, ...safeUser } = dbUser;
    return res.json(safeUser);
  });

  // =========================================================================
  // PROFESSOR REGISTRATION (email/password with @voxexam.ae)
  // =========================================================================
  app.post("/api/professor/register", async (req: Request, res: Response) => {
    try {
      const { fullName, email, password, confirmPassword } = req.body;

      // Validate required fields
      if (!fullName || !email || !password || !confirmPassword) {
        return res.status(400).json({ message: "All fields are required." });
      }

      const cleanEmail = email.trim().toLowerCase();
      const trimmedName = fullName.trim();

      // Validate email domain
      if (!isValidProfessorEmail(cleanEmail)) {
        return res.status(400).json({ message: `Email must end with ${PROFESSOR_DOMAIN}` });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({ message: "Invalid email format." });
      }

      // Validate password match
      if (password !== confirmPassword) {
        return res.status(400).json({ message: "Passwords do not match." });
      }

      // Validate password strength
      const strengthError = validatePasswordStrength(password);
      if (strengthError) {
        return res.status(400).json({ message: strengthError });
      }

      // Check for duplicate email
      const [existing] = await db.select().from(users).where(eq(users.email, cleanEmail));
      if (existing) {
        return res.status(409).json({ message: "An account with this email already exists." });
      }

      // Hash password and create user
      const hashed = hashPassword(password);
      const userId = `prof-${randomUUID().slice(0, 12)}`;
      const nameParts = trimmedName.split(" ");
      const firstName = nameParts[0] || "Professor";
      const lastName = nameParts.slice(1).join(" ") || "";

      await db.insert(users).values({
        id: userId,
        email: cleanEmail,
        firstName,
        lastName,
        role: "professor",
        authProvider: "local",
        passwordHash: hashed,
      });

      // Auto-login after registration
      const sessionUser = {
        id: userId,
        role: "professor",
        claims: {
          sub: userId,
          email: cleanEmail,
          first_name: firstName,
          last_name: lastName,
        },
      };

      req.login(sessionUser, (err) => {
        if (err) {
          console.error("Professor registration login error:", err);
          return res.status(500).json({ message: "Account created but login failed. Please sign in." });
        }
        return res.json({ success: true, user: sessionUser });
      });
    } catch (error: any) {
      console.error("Professor registration error:", error);
      res.status(500).json({ message: "Registration failed. Please try again." });
    }
  });

  // =========================================================================
  // PROFESSOR LOGIN (email/password with @voxexam.ae)
  // =========================================================================
  app.post("/api/doctor-login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required." });
      }
      const cleanEmail = email.trim().toLowerCase();

      // Validate domain
      if (!isValidProfessorEmail(cleanEmail)) {
        return res.status(400).json({ message: `Email must end with ${PROFESSOR_DOMAIN}` });
      }

      // Find user by email
      const [user] = await db.select().from(users).where(eq(users.email, cleanEmail));
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid email or password." });
      }

      // Verify password
      if (!verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ message: "Invalid email or password." });
      }

      if (user.role !== "professor") {
        return res.status(403).json({ message: "This account is not a professor account." });
      }

      const sessionUser = {
        id: user.id,
        role: "professor",
        claims: {
          sub: user.id,
          email: user.email || cleanEmail,
          first_name: user.firstName || "Professor",
          last_name: user.lastName || "",
        },
      };

      req.login(sessionUser, (err) => {
        if (err) return res.status(500).json({ message: "Login failed." });
        return res.json({ success: true, user: sessionUser });
      });
    } catch (error: any) {
      console.error("Professor login error:", error);
      res.status(500).json({ message: "Login failed. Please try again." });
    }
  });

  // =========================================================================
  // ADMIN LOGIN (email/password)
  // =========================================================================
  app.post("/api/admin/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required." });
      }
      const cleanEmail = email.trim().toLowerCase();

      // Find user by email
      const [user] = await db.select().from(users).where(eq(users.email, cleanEmail));
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid email or password." });
      }

      // Verify password
      if (!verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ message: "Invalid email or password." });
      }

      if (user.role !== "admin") {
        return res.status(403).json({ message: "This account is not an admin account." });
      }

      const sessionUser = {
        id: user.id,
        role: "admin",
        claims: {
          sub: user.id,
          email: user.email || cleanEmail,
          first_name: user.firstName || "Admin",
          last_name: user.lastName || "",
        },
      };

      // Security measure: Regenerate session on login for admin
      req.session.regenerate((err) => {
        if (err) return res.status(500).json({ message: "Session generation failed." });
        
        req.login(sessionUser, (loginErr) => {
          if (loginErr) return res.status(500).json({ message: "Login failed." });
          return res.json({ success: true, user: sessionUser });
        });
      });
    } catch (error: any) {
      console.error("Admin login error:", error);
      res.status(500).json({ message: "Login failed. Please try again." });
    }
  });

  // Demo login endpoint for fast local testing
  if (process.env.NODE_ENV !== "production" || process.env.ENABLE_DEMO_LOGIN === "true") {
    app.post("/api/demo-login", async (req: Request, res: Response) => {
    try {
      const { role = "student" } = req.body;
      if (!["professor", "student", "admin"].includes(role)) {
        return res.status(400).json({ message: "Invalid role specified" });
      }

      let demoSessionId = req.cookies?.demo_session_id;
      if (!demoSessionId) {
        demoSessionId = randomUUID().slice(0, 8);
        res.cookie("demo_session_id", demoSessionId, {
          httpOnly: true,
          maxAge: 7 * 24 * 60 * 60 * 1000,
          sameSite: "lax",
        });
      }

      const demoId = `demo-${role}-${demoSessionId}`;
      const demoEmail = `demo.${role}.${demoSessionId}@voxexam.local`;
      const firstName = "Demo";
      const lastName = role === "professor" ? "Professor" : "Student";

      const [existingUser] = await db.select().from(users).where(eq(users.id, demoId));
      if (!existingUser) {
        await db.insert(users).values({
          id: demoId,
          email: demoEmail,
          firstName,
          lastName,
          role,
          authProvider: "demo",
        });
      } else if (existingUser.role !== role) {
        await db.update(users).set({ role }).where(eq(users.id, demoId));
      }

      const sessionUser = {
        id: demoId,
        role,
        claims: {
          sub: demoId,
          email: demoEmail,
          first_name: firstName,
          last_name: lastName,
        },
      };

      req.login(sessionUser, (err) => {
        if (err) {
          console.error("Demo login error:", err);
          return res.status(500).json({ message: "Login failed" });
        }
        return res.json({ success: true, user: sessionUser });
      });
    } catch (error: any) {
      console.error("Demo login endpoint failure:", error);
      res.status(500).json({ message: "Demo login failed" });
    }
  });
  }

  // Student exam code join sign-in
  app.post("/api/student-login", async (req: Request, res: Response) => {
    try {
      const { studentName, studentId, examCode } = req.body;
      const name = (studentName || studentId || "Student").trim();
      const slug = name.toLowerCase().replace(/\s+/g, "-");
      const localUserId = `student-${slug}-${randomUUID().slice(0, 6)}`;

      await db.insert(users).values({
        id: localUserId,
        email: `${slug}@local.voxexam`,
        firstName: name,
        lastName: "",
        role: "student",
        authProvider: "local",
        studentId: name,
      });

      const sessionUser = {
        id: localUserId,
        role: "student",
        claims: {
          sub: localUserId,
          email: `${slug}@local.voxexam`,
          first_name: name,
          last_name: "",
        },
      };

      req.login(sessionUser, (err) => {
        if (err) return res.status(500).json({ message: "Student login failed" });
        return res.json({ success: true, userId: localUserId });
      });
    } catch (error: any) {
      res.status(500).json({ message: "Student login error" });
    }
  });

  app.post("/api/class-login", async (req: Request, res: Response) => {
    try {
      const { studentName, classCode } = req.body;
      if (!studentName?.trim() || !classCode?.trim()) {
        return res.status(400).json({ message: "Student name and class code are required" });
      }

      const cls = await storage.getClassByClassCode(classCode.trim());
      if (!cls) {
        return res.status(404).json({ message: "Invalid class code" });
      }

      const name = studentName.trim();
      const slug = name.toLowerCase().replace(/\s+/g, "-");
      const localUserId = `student-${slug}-${randomUUID().slice(0, 6)}`;

      await db.insert(users).values({
        id: localUserId,
        email: `${slug}@local.voxexam`,
        firstName: name,
        lastName: "",
        role: "student",
        authProvider: "local",
        studentId: name,
      });

      // Enroll student in the class
      await storage.enrollStudentInClass(localUserId, cls.id, name);

      const sessionUser = {
        id: localUserId,
        role: "student",
        claims: {
          sub: localUserId,
          email: `${slug}@local.voxexam`,
          first_name: name,
          last_name: "",
        },
      };

      req.login(sessionUser, (err) => {
        if (err) return res.status(500).json({ message: "Student login failed" });
        return res.json({ success: true, userId: localUserId, classId: cls.id });
      });
    } catch (error: any) {
      res.status(500).json({ message: "Class login error" });
    }
  });

  // Logout & Demo Logout endpoints
  app.get(["/api/demo-logout", "/api/logout"], (req: Request, res: Response) => {
    req.logout(() => {
      if (req.session) {
        req.session.destroy(() => {});
      }
      res.clearCookie("demo_session_id");
      res.clearCookie("connect.sid");
      res.redirect("/");
    });
  });

  app.post(["/api/demo-logout", "/api/logout"], (req: Request, res: Response) => {
    req.logout(() => {
      if (req.session) {
        req.session.destroy(() => {});
      }
      res.clearCookie("demo_session_id");
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });
}

// ---------------------------------------------------------------------------
// Authorization middleware
// ---------------------------------------------------------------------------

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated() && req.user) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};

/** Require authenticated professor role */
export const isProfessor: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const sessUser = req.user as any;
  const role = sessUser.role || sessUser.claims?.role;
  if (role !== "professor") {
    return res.status(403).json({ message: "Professor access required." });
  }
  return next();
};

/** Require authenticated student role */
export const isStudent: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const sessUser = req.user as any;
  const role = sessUser.role || sessUser.claims?.role;
  if (role !== "student") {
    return res.status(403).json({ message: "Student access required." });
  }
  return next();
};
