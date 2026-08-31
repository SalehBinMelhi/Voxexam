import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { User } from "@shared/models/auth";

const SALT_LENGTH = 32;
const KEY_LENGTH = 64;

export const PROFESSOR_DOMAIN = "@voxexam.ae";

export type SafeUser = Pick<
  User,
  | "id"
  | "email"
  | "firstName"
  | "lastName"
  | "profileImageUrl"
  | "role"
  | "universityId"
  | "authProvider"
  | "studentId"
  | "createdAt"
  | "updatedAt"
>;

export interface SessionPrincipal {
  id: string;
  role: string | null;
  claims: {
    sub: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    profile_image_url?: string;
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidProfessorEmail(email: string): boolean {
  return normalizeEmail(email).endsWith(PROFESSOR_DOMAIN);
}

export function normalizeFullName(fullName: string): string {
  return fullName.trim().replace(/\s+/g, " ");
}

export function validateFullName(fullName: string): string | null {
  const normalized = normalizeFullName(fullName);
  if (normalized.length < 2) return "Full name must be at least 2 characters long.";
  if (normalized.length > 120) return "Full name must be 120 characters or fewer.";
  return null;
}

export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const normalized = normalizeFullName(fullName);
  const [firstName = "", ...lastNameParts] = normalized.split(" ");
  return { firstName, lastName: lastNameParts.join(" ") };
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters long.";
  if (password.length > 128) return "Password must be 128 characters or fewer.";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
  return null;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split(":");
    if (parts.length !== 2) return false;

    const [salt, hash] = parts;
    if (!new RegExp(`^[0-9a-f]{${SALT_LENGTH * 2}}$`, "i").test(salt)) return false;
    if (!new RegExp(`^[0-9a-f]{${KEY_LENGTH * 2}}$`, "i").test(hash)) return false;

    const hashBuffer = Buffer.from(hash, "hex");
    const derivedBuffer = scryptSync(password, salt, KEY_LENGTH);
    if (hashBuffer.length !== derivedBuffer.length) return false;
    return timingSafeEqual(hashBuffer, derivedBuffer);
  } catch {
    return false;
  }
}

export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    profileImageUrl: user.profileImageUrl,
    role: user.role,
    universityId: user.universityId,
    authProvider: user.authProvider,
    studentId: user.studentId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function toSessionPrincipal(user: User): SessionPrincipal {
  return {
    id: user.id,
    role: user.role,
    claims: {
      sub: user.id,
      ...(user.email ? { email: user.email } : {}),
      ...(user.firstName ? { first_name: user.firstName } : {}),
      ...(user.lastName ? { last_name: user.lastName } : {}),
      ...(user.profileImageUrl ? { profile_image_url: user.profileImageUrl } : {}),
    },
  };
}
