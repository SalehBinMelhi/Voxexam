import type { Express } from "express";
import { randomUUID } from "crypto";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { db } from "../../db";
import { universities } from "@shared/schema";
import { eq } from "drizzle-orm";

export function registerAuthRoutes(app: Express): void {
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
        return res.json({ success: true, demoSessionId });
      });
    } catch (error) {
      console.error("Demo login error:", error);
      res.status(500).json({ message: "Demo login failed" });
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
