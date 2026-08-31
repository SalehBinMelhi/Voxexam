import assert from "node:assert/strict";
import test from "node:test";
import type { User } from "@shared/models/auth";
import {
  hashPassword,
  isValidEmail,
  isValidProfessorEmail,
  normalizeEmail,
  normalizeFullName,
  splitFullName,
  toSafeUser,
  toSessionPrincipal,
  validateFullName,
  validatePasswordStrength,
  verifyPassword,
} from "./auth-utils.ts";

test("normalizes and validates sign-in email addresses", () => {
  assert.equal(normalizeEmail("  Student@Example.EDU "), "student@example.edu");
  assert.equal(isValidEmail("student@example.edu"), true);
  assert.equal(isValidEmail("student example.edu"), false);
  assert.equal(isValidProfessorEmail(" Faculty@VoxExam.AE "), true);
  assert.equal(isValidProfessorEmail("faculty@example.edu"), false);
});

test("normalizes and splits a student's full display name", () => {
  assert.equal(normalizeFullName("  Noor   Al Mansoori  "), "Noor Al Mansoori");
  assert.deepEqual(splitFullName("Noor Al Mansoori"), {
    firstName: "Noor",
    lastName: "Al Mansoori",
  });
  assert.equal(validateFullName("N"), "Full name must be at least 2 characters long.");
  assert.equal(validateFullName("Noor Al Mansoori"), null);
});

test("enforces password strength without storing plaintext", () => {
  assert.match(validatePasswordStrength("short") || "", /at least 8/i);
  assert.match(validatePasswordStrength("lowercase1") || "", /uppercase/i);
  assert.match(validatePasswordStrength("UPPERCASE1") || "", /lowercase/i);
  assert.match(validatePasswordStrength("NoDigitsHere") || "", /number/i);
  assert.equal(validatePasswordStrength("SecurePass2026"), null);

  const password = "SecurePass2026";
  const stored = hashPassword(password);
  assert.notEqual(stored, password);
  assert.equal(verifyPassword(password, stored), true);
  assert.equal(verifyPassword("WrongPass2026", stored), false);
  assert.equal(verifyPassword(password, "malformed"), false);
  assert.notEqual(hashPassword(password), stored, "each hash should use a unique salt");
});

test("allowlists account and session fields", () => {
  const user = {
    id: "student-test-001",
    email: "student@example.edu",
    firstName: "Test",
    lastName: "Student",
    profileImageUrl: null,
    role: "student",
    universityId: null,
    openaiApiKey: "must-not-leak",
    geminiApiKey: "must-not-leak",
    passwordHash: "must-not-leak",
    authProvider: "local",
    studentId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  } as User;

  const safeUser = toSafeUser(user);
  assert.equal("passwordHash" in safeUser, false);
  assert.equal("openaiApiKey" in safeUser, false);
  assert.equal("geminiApiKey" in safeUser, false);
  assert.equal(safeUser.email, "student@example.edu");

  const principal = toSessionPrincipal(user);
  assert.deepEqual(principal, {
    id: "student-test-001",
    role: "student",
    claims: {
      sub: "student-test-001",
      email: "student@example.edu",
      first_name: "Test",
      last_name: "Student",
    },
  });
  assert.equal("passwordHash" in principal, false);
});
