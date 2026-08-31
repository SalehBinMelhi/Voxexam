import assert from "node:assert/strict";
import test from "node:test";
import type { User } from "@shared/models/auth";
import {
  StudentAccountError,
  StudentAccountService,
  type StudentAccountRepository,
} from "./student-account-service.ts";

class MemoryStudentAccounts implements StudentAccountRepository {
  readonly users = new Map<string, User>();

  async findByNormalizedEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.email?.toLowerCase() === email);
  }

  async createStudent(values: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: "student";
    authProvider: "local";
    passwordHash: string;
  }): Promise<User> {
    const now = new Date("2026-08-30T00:00:00.000Z");
    const user: User = {
      ...values,
      profileImageUrl: null,
      universityId: null,
      openaiApiKey: null,
      geminiApiKey: null,
      studentId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    return user;
  }
}

async function expectAccountError(
  action: () => Promise<unknown>,
  expected: { status: number; code: StudentAccountError["code"]; message?: RegExp },
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof StudentAccountError);
    assert.equal(error.status, expected.status);
    assert.equal(error.code, expected.code);
    if (expected.message) assert.match(error.message, expected.message);
    return true;
  });
}

const validRegistration = {
  fullName: "Aisha Al Mansouri",
  email: "Aisha@University.ac.ae",
  password: "SecurePass2026",
  confirmPassword: "SecurePass2026",
};

test("creates a persistent student account with a normalized unique email and password hash", async () => {
  const repository = new MemoryStudentAccounts();
  const accounts = new StudentAccountService(repository, () => "student-stable-1");
  const user = await accounts.register(validRegistration);

  assert.equal(user.id, "student-stable-1");
  assert.equal(user.email, "aisha@university.ac.ae");
  assert.equal(user.firstName, "Aisha");
  assert.equal(user.lastName, "Al Mansouri");
  assert.equal(user.role, "student");
  assert.notEqual(user.passwordHash, validRegistration.password);
  assert.equal(repository.users.size, 1);
});

test("rejects duplicate student emails case-insensitively", async () => {
  const repository = new MemoryStudentAccounts();
  const accounts = new StudentAccountService(repository, () => `student-${repository.users.size + 1}`);
  await accounts.register(validRegistration);

  await expectAccountError(
    () => accounts.register({ ...validRegistration, email: "  AISHA@UNIVERSITY.AC.AE  " }),
    { status: 409, code: "duplicate_email", message: /already exists/i },
  );
  assert.equal(repository.users.size, 1);
});

test("rejects invalid student registration data", async () => {
  const accounts = new StudentAccountService(new MemoryStudentAccounts());
  await expectAccountError(
    () => accounts.register({ ...validRegistration, fullName: "A" }),
    { status: 400, code: "invalid_registration", message: /full name/i },
  );
  await expectAccountError(
    () => accounts.register({ ...validRegistration, email: "not-an-email" }),
    { status: 400, code: "invalid_registration", message: /valid email/i },
  );
  await expectAccountError(
    () => accounts.register({ ...validRegistration, confirmPassword: "DifferentPass2026" }),
    { status: 400, code: "invalid_registration", message: /do not match/i },
  );
});

test("signs in an existing student and rejects incorrect credentials", async () => {
  const repository = new MemoryStudentAccounts();
  const accounts = new StudentAccountService(repository, () => "student-stable-1");
  const created = await accounts.register(validRegistration);

  const signedIn = await accounts.authenticate({
    email: "  AISHA@UNIVERSITY.AC.AE ",
    password: validRegistration.password,
  });
  assert.equal(signedIn.id, created.id);

  await expectAccountError(
    () => accounts.authenticate({ email: created.email, password: "WrongPass2026" }),
    { status: 401, code: "invalid_credentials", message: /invalid email or password/i },
  );
});

test("never accepts a client-supplied role during student registration", async () => {
  const repository = new MemoryStudentAccounts();
  const accounts = new StudentAccountService(repository, () => "student-no-escalation");
  const maliciousPayload = { ...validRegistration, role: "professor" };
  const user = await accounts.register(maliciousPayload);

  assert.equal(user.role, "student");
  assert.equal(repository.users.get(user.id)?.role, "student");
});

test("the same account remains usable across a later service/session lifecycle", async () => {
  const repository = new MemoryStudentAccounts();
  const registrationLifecycle = new StudentAccountService(repository, () => "student-stable-1");
  const created = await registrationLifecycle.register(validRegistration);

  const laterSignInLifecycle = new StudentAccountService(repository);
  const returning = await laterSignInLifecycle.authenticate({
    email: validRegistration.email,
    password: validRegistration.password,
  });
  assert.equal(returning.id, created.id);
});
