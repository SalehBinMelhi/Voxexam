import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { db } from "../../db";
import { universities } from "@shared/schema";
import { eq } from "drizzle-orm";

export function registerAuthRoutes(app: Express): void {
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
