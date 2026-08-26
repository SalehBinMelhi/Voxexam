import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar, real } from "drizzle-orm/pg-core";

// Session storage table.
// (IMPORTANT) This table is mandatory for authentication, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table.
// (IMPORTANT) This table is mandatory for authentication, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role"),
  universityId: varchar("university_id"),
  openaiApiKey: varchar("openai_api_key"),
  geminiApiKey: varchar("gemini_api_key"),
  passwordHash: varchar("password_hash"),
  authProvider: varchar("auth_provider").default("local"),
  studentId: varchar("student_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
