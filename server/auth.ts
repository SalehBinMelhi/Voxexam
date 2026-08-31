import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler, Request, Response } from "express";
import connectPg from "connect-pg-simple";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  PROFESSOR_DOMAIN,
  hashPassword,
  isValidEmail,
  isValidProfessorEmail,
  normalizeEmail,
  normalizeFullName,
  toSafeUser,
  toSessionPrincipal,
  validatePasswordStrength,
  verifyPassword,
  type SessionPrincipal,
} from "./auth-utils";
import {
  StudentAccountError,
  StudentAccountService,
} from "./student-account-service";

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

  passport.serializeUser((user: any, cb) => {
    const userId = user?.id || user?.claims?.sub;
    if (!userId || typeof userId !== "string") {
      return cb(new Error("Cannot serialize an invalid authentication principal"));
    }
    return cb(null, userId);
  });

  passport.deserializeUser(async (serializedUser: unknown, cb) => {
    try {
      const legacyPrincipal = typeof serializedUser === "object" && serializedUser !== null
        ? serializedUser as { id?: unknown; claims?: { sub?: unknown } }
        : null;
      const userId = typeof serializedUser === "string"
        ? serializedUser
        : typeof legacyPrincipal?.id === "string"
          ? legacyPrincipal.id
          : typeof legacyPrincipal?.claims?.sub === "string"
            ? legacyPrincipal.claims.sub
            : null;

      if (!userId) return cb(null, false);

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return cb(null, false);
      return cb(null, toSessionPrincipal(user) as any);
    } catch (error) {
      return cb(error as Error);
    }
  });
}

function getDatabaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return getDatabaseErrorCode(error.cause);
  return undefined;
}

function isUniqueViolation(error: unknown): boolean {
  return getDatabaseErrorCode(error) === "23505";
}

function logAuthFailure(context: string, error: unknown): void {
  const errorName = error instanceof Error ? error.name : "UnknownError";
  const errorCode = getDatabaseErrorCode(error);
  console.error(`[AUTH] ${context}`, errorCode ? { errorName, errorCode } : { errorName });
}

function establishSession(req: Request, principal: SessionPrincipal): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((regenerateError) => {
      if (regenerateError) return reject(regenerateError);
      req.login(principal as any, (loginError) => {
        if (loginError) return reject(loginError);
        return resolve();
      });
    });
  });
}

const studentAccounts = new StudentAccountService({
  async findByNormalizedEmail(email) {
    const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`);
    return user;
  },
  async createStudent(values) {
    const [user] = await db.insert(users).values(values).returning();
    return user;
  },
});

function handleStudentAccountError(error: unknown, res: Response): boolean {
  if (!(error instanceof StudentAccountError)) return false;
  res.status(error.status).json({ error: error.message });
  return true;
}

export function registerAuthRoutes(app: Express): void {
  // Current user status endpoint
  app.get("/api/auth/user", async (req: Request, res: Response) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const sessionUser = req.user as any;
    const userId = sessionUser.id || sessionUser.claims?.sub;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const [dbUser] = await db.select().from(users).where(eq(users.id, userId));
      if (!dbUser) {
        req.logout(() => undefined);
        return res.status(401).json({ message: "Unauthorized" });
      }

      return res.json(toSafeUser(dbUser));
    } catch (error) {
      logAuthFailure("Failed to load the current user", error);
      return res.status(500).json({ message: "Unable to load the current account." });
    }
  });

  // =========================================================================
  // STUDENT REGISTRATION AND LOGIN
  // =========================================================================
  app.post("/api/student/register", async (req: Request, res: Response) => {
    try {
      const createdUser = await studentAccounts.register(req.body ?? {});

      await establishSession(req, toSessionPrincipal(createdUser));
      return res.status(201).json({ data: { user: toSafeUser(createdUser) } });
    } catch (error) {
      if (handleStudentAccountError(error, res)) return;
      if (isUniqueViolation(error)) {
        return res.status(409).json({ error: "An account with this email already exists." });
      }
      logAuthFailure("Student registration failed", error);
      return res.status(500).json({ error: "Registration failed. Please try again." });
    }
  });

  app.post("/api/student/login", async (req: Request, res: Response) => {
    try {
      const user = await studentAccounts.authenticate(req.body ?? {});

      await establishSession(req, toSessionPrincipal(user));
      return res.json({ data: { user: toSafeUser(user) } });
    } catch (error) {
      if (handleStudentAccountError(error, res)) return;
      logAuthFailure("Student login failed", error);
      return res.status(500).json({ error: "Login failed. Please try again." });
    }
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

      const cleanEmail = normalizeEmail(email);
      const trimmedName = normalizeFullName(fullName);

      // Validate email domain
      if (!isValidProfessorEmail(cleanEmail)) {
        return res.status(400).json({ message: `Email must end with ${PROFESSOR_DOMAIN}` });
      }

      // Validate email format
      if (!isValidEmail(cleanEmail)) {
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
      const [existing] = await db.select().from(users).where(sql`lower(${users.email}) = ${cleanEmail}`);
      if (existing) {
        return res.status(409).json({ message: "An account with this email already exists." });
      }

      // Hash password and create user
      const hashed = hashPassword(password);
      const userId = `prof-${randomUUID().slice(0, 12)}`;
      const nameParts = trimmedName.split(" ");
      const firstName = nameParts[0] || "Professor";
      const lastName = nameParts.slice(1).join(" ") || "";

      const [createdUser] = await db.insert(users).values({
        id: userId,
        email: cleanEmail,
        firstName,
        lastName,
        role: "professor",
        authProvider: "local",
        passwordHash: hashed,
      }).returning();

      await establishSession(req, toSessionPrincipal(createdUser));
      return res.json({ success: true, user: toSafeUser(createdUser) });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({ message: "An account with this email already exists." });
      }
      logAuthFailure("Professor registration failed", error);
      return res.status(500).json({ message: "Registration failed. Please try again." });
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
      const cleanEmail = normalizeEmail(email);

      // Validate domain
      if (!isValidProfessorEmail(cleanEmail)) {
        return res.status(400).json({ message: `Email must end with ${PROFESSOR_DOMAIN}` });
      }

      // Find user by email
      const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${cleanEmail}`);
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

      await establishSession(req, toSessionPrincipal(user));
      return res.json({ success: true, user: toSafeUser(user) });
    } catch (error: unknown) {
      logAuthFailure("Professor login failed", error);
      return res.status(500).json({ message: "Login failed. Please try again." });
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
      const cleanEmail = normalizeEmail(email);

      // Find user by email
      const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${cleanEmail}`);
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
    } catch (error: unknown) {
      logAuthFailure("Admin login failed", error);
      return res.status(500).json({ message: "Login failed. Please try again." });
    }
  });

  // Demo login endpoint for fast local testing
  if (process.env.NODE_ENV !== "production" && process.env.ENABLE_DEMO_LOGIN === "true") {
    app.post("/api/demo-login", async (req: Request, res: Response) => {
    try {
      const { role = "student" } = req.body;
      if (!["professor", "student"].includes(role)) {
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
          logAuthFailure("Demo login session failed", err);
          return res.status(500).json({ message: "Login failed" });
        }
        return res.json({ success: true, user: sessionUser });
      });
    } catch (error: unknown) {
      logAuthFailure("Demo login failed", error);
      return res.status(500).json({ message: "Demo login failed" });
    }
  });
  }

  // Logout & Demo Logout endpoints
  app.get(["/api/demo-logout", "/api/logout"], (req: Request, res: Response) => {
    req.logout((logoutError) => {
      if (logoutError) return res.status(500).json({ message: "Logout failed." });
      req.session.destroy((destroyError) => {
        if (destroyError) return res.status(500).json({ message: "Logout failed." });
        res.clearCookie("demo_session_id");
        res.clearCookie("connect.sid");
        return res.redirect("/");
      });
    });
  });

  app.post(["/api/demo-logout", "/api/logout"], (req: Request, res: Response) => {
    req.logout((logoutError) => {
      if (logoutError) return res.status(500).json({ message: "Logout failed." });
      req.session.destroy((destroyError) => {
        if (destroyError) return res.status(500).json({ message: "Logout failed." });
        res.clearCookie("demo_session_id");
        res.clearCookie("connect.sid");
        return res.json({ success: true });
      });
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
