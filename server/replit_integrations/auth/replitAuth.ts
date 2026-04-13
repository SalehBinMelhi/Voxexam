import { clerkMiddleware, getAuth, clerkClient } from "@clerk/express";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";

let sessionMiddleware: RequestHandler | null = null;

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
    },
  });
}

export function getSessionMiddleware(): RequestHandler | null {
  return sessionMiddleware;
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);

  sessionMiddleware = getSession();
  app.use(sessionMiddleware);
  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.use("/api", clerkMiddleware());
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const clerkAuth = getAuth(req);
  if (clerkAuth && clerkAuth.userId) {
    try {
      const client = clerkClient();
      const clerkUser = await client.users.getUser(clerkAuth.userId);

      const email = clerkUser.emailAddresses?.[0]?.emailAddress || "";
      const firstName = clerkUser.firstName || "";
      const lastName = clerkUser.lastName || "";
      const profileImageUrl = clerkUser.imageUrl || null;

      await authStorage.upsertUser({
        id: clerkAuth.userId,
        email,
        firstName,
        lastName,
        profileImageUrl,
      });

      (req as any).userId = clerkAuth.userId;
      return next();
    } catch (error) {
      console.error("Clerk auth error:", error);
    }
  }

  const user = req.user as any;
  if (req.isAuthenticated() && user?.claims?.sub) {
    const isLocalOrDemo = user.access_token?.startsWith("local-token-") || user.access_token?.startsWith("demo-token-");
    const now = Math.floor(Date.now() / 1000);

    if (now <= user.expires_at || isLocalOrDemo) {
      if (isLocalOrDemo) {
        user.expires_at = Math.floor(Date.now() / 1000) + 86400 * 7;
      }
      (req as any).userId = user.claims.sub;
      return next();
    }
  }

  return res.status(401).json({ message: "Unauthorized" });
};
