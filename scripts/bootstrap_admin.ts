import "dotenv/config";
import { db } from "../server/db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";
import { randomBytes, scryptSync } from "crypto";

const SALT_LENGTH = 32;
const KEY_LENGTH = 64;

function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

async function bootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL || "admin@foxexam.ae";
  const password = process.env.ADMIN_INITIAL_PASSWORD;

  if (!password) {
    console.error("Error: ADMIN_INITIAL_PASSWORD environment variable is required.");
    process.exit(1);
  }

  const hashed = hashPassword(password);
  const adminId = "admin-sys-01";

  // Check if admin already exists
  const existing = await db.select().from(users).where(eq(users.email, email));

  if (existing.length > 0) {
    console.log(`Updating existing admin account: ${email}`);
    await db.update(users).set({
      passwordHash: hashed,
      role: "admin",
      authProvider: "local",
      firstName: "System",
      lastName: "Administrator"
    }).where(eq(users.email, email));
  } else {
    console.log(`Creating new admin account: ${email}`);
    await db.insert(users).values({
      id: adminId,
      email,
      passwordHash: hashed,
      role: "admin",
      authProvider: "local",
      firstName: "System",
      lastName: "Administrator"
    });
  }

  console.log("Admin account bootstrapped successfully.");
  process.exit(0);
}

bootstrapAdmin().catch(err => {
  console.error("Failed to bootstrap admin:", err);
  process.exit(1);
});
