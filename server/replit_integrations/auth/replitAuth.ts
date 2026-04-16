import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";
import { logUserEvent } from "../../storage";

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

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.warn("[AUTH] GOOGLE_CLIENT_ID and/or GOOGLE_CLIENT_SECRET not set. Google OAuth sign-in will be unavailable.");
  }

  const callbackURL = process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}/api/auth/google/callback`
    : "http://localhost:5000/api/auth/google/callback";

  console.log(`[AUTH] Google OAuth callback URL: ${callbackURL}`);
  console.log("[AUTH] Add this URL to your Google Cloud Console > Credentials > OAuth 2.0 Client > Authorized redirect URIs");

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {

    const strategyOptions = {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL,
      state: true,
    };

    passport.use(
      new GoogleStrategy(
        strategyOptions as GoogleStrategy.StrategyOptions,
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value || "";
            const firstName = profile.name?.givenName || "";
            const lastName = profile.name?.familyName || "";
            const profileImageUrl = profile.photos?.[0]?.value || null;
            const googleId = profile.id;
            const newGoogleUserId = `google-${googleId}`;

            const { users } = await import("@shared/models/auth");
            const { db } = await import("../../db");
            const { eq } = await import("drizzle-orm");

            let userId = newGoogleUserId;

            const existingByEmail = email ? await authStorage.getUserByEmail(email) : undefined;

            if (existingByEmail && existingByEmail.id !== newGoogleUserId) {
              userId = existingByEmail.id;
              await db.update(users).set({
                authProvider: "google",
                firstName: firstName || existingByEmail.firstName,
                lastName: lastName || existingByEmail.lastName,
                profileImageUrl: profileImageUrl || existingByEmail.profileImageUrl,
                updatedAt: new Date(),
              }).where(eq(users.id, existingByEmail.id));
            } else {
              await authStorage.upsertUser({
                id: newGoogleUserId,
                email,
                firstName,
                lastName,
                profileImageUrl,
              });
              await db.update(users).set({ authProvider: "google" }).where(eq(users.id, newGoogleUserId));
            }

            logUserEvent(userId, "login", { authProvider: "google", email });

            const sessionUser = {
              claims: {
                sub: userId,
                email,
                first_name: firstName,
                last_name: lastName,
                profile_image_url: profileImageUrl,
              },
              access_token: `google-token-${googleId}`,
              refresh_token: null,
              expires_at: Math.floor(Date.now() / 1000) + 86400 * 7,
            };

            return done(null, sessionUser);
          } catch (error) {
            return done(error as Error);
          }
        }
      )
    );
  }

  app.get("/api/auth/google/callback-url", (_req, res) => {
    res.json({ callbackURL });
  });

  app.get("/api/auth/google", (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(503).json({ message: "Google OAuth is not configured" });
    }
    passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
  });

  app.get("/api/auth/google/callback", (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(503).json({ message: "Google OAuth is not configured" });
    }
    passport.authenticate("google", (err: any, user: any) => {
      if (err || !user) {
        if (err) console.error("[AUTH] Google OAuth error:", err.message);
        return res.redirect("/?error=auth_failed");
      }
      req.login(user, (loginErr: any) => {
        if (loginErr) {
          return res.redirect("/?error=login_failed");
        }
        res.redirect("/");
      });
    })(req, res, next);
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;
  if (req.isAuthenticated() && user?.claims?.sub) {
    const isLocalOrDemo = user.access_token?.startsWith("local-token-") || user.access_token?.startsWith("demo-token-");
    const isGoogle = user.access_token?.startsWith("google-token-");
    const now = Math.floor(Date.now() / 1000);

    if (now <= user.expires_at || isLocalOrDemo || isGoogle) {
      if (isLocalOrDemo || isGoogle) {
        user.expires_at = Math.floor(Date.now() / 1000) + 86400 * 7;
      }
      (req as any).userId = user.claims.sub;
      return next();
    }
  }

  return res.status(401).json({ message: "Unauthorized" });
};
