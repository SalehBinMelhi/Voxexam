import { randomUUID } from "crypto";
import type { User } from "@shared/models/auth";
import {
  hashPassword,
  isValidEmail,
  normalizeEmail,
  normalizeFullName,
  splitFullName,
  validateFullName,
  validatePasswordStrength,
  verifyPassword,
} from "./auth-utils.ts";

export interface StudentRegistrationInput {
  fullName?: unknown;
  email?: unknown;
  password?: unknown;
  confirmPassword?: unknown;
}

export interface StudentLoginInput {
  email?: unknown;
  password?: unknown;
}

export interface StudentAccountRepository {
  findByNormalizedEmail(email: string): Promise<User | undefined>;
  createStudent(values: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: "student";
    authProvider: "local";
    passwordHash: string;
  }): Promise<User>;
}

export class StudentAccountError extends Error {
  readonly status: number;
  readonly code:
    | "invalid_registration"
    | "duplicate_email"
    | "invalid_credentials";

  constructor(
    status: number,
    message: string,
    code:
      | "invalid_registration"
      | "duplicate_email"
      | "invalid_credentials",
  ) {
    super(message);
    this.name = "StudentAccountError";
    this.status = status;
    this.code = code;
  }
}

const DUMMY_PASSWORD_HASH = hashPassword("VoxExamTimingCheck2026");

export class StudentAccountService {
  private readonly repository: StudentAccountRepository;
  private readonly createId: () => string;

  constructor(
    repository: StudentAccountRepository,
    createId: () => string = () => `student-${randomUUID().slice(0, 12)}`,
  ) {
    this.repository = repository;
    this.createId = createId;
  }

  async register(input: StudentRegistrationInput): Promise<User> {
    const { fullName, email, password, confirmPassword } = input;
    if (
      typeof fullName !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof confirmPassword !== "string" ||
      !fullName.trim() ||
      !email.trim() ||
      !password ||
      !confirmPassword
    ) {
      throw new StudentAccountError(400, "All fields are required.", "invalid_registration");
    }

    const nameError = validateFullName(fullName);
    if (nameError) {
      throw new StudentAccountError(400, nameError, "invalid_registration");
    }

    const normalizedEmail = normalizeEmail(email);
    if (normalizedEmail.length > 320 || !isValidEmail(normalizedEmail)) {
      throw new StudentAccountError(400, "Enter a valid email address.", "invalid_registration");
    }
    if (password !== confirmPassword) {
      throw new StudentAccountError(400, "Passwords do not match.", "invalid_registration");
    }

    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      throw new StudentAccountError(400, passwordError, "invalid_registration");
    }

    if (await this.repository.findByNormalizedEmail(normalizedEmail)) {
      throw new StudentAccountError(
        409,
        "An account with this email already exists.",
        "duplicate_email",
      );
    }

    const { firstName, lastName } = splitFullName(normalizeFullName(fullName));
    return this.repository.createStudent({
      id: this.createId(),
      email: normalizedEmail,
      firstName,
      lastName,
      role: "student",
      authProvider: "local",
      passwordHash: hashPassword(password),
    });
  }

  async authenticate(input: StudentLoginInput): Promise<User> {
    const { email, password } = input;
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      throw new StudentAccountError(400, "Email and password are required.", "invalid_credentials");
    }

    const normalizedEmail = normalizeEmail(email);
    if (normalizedEmail.length > 320 || !isValidEmail(normalizedEmail) || password.length > 128) {
      throw new StudentAccountError(401, "Invalid email or password.", "invalid_credentials");
    }

    const user = await this.repository.findByNormalizedEmail(normalizedEmail);
    const matches = verifyPassword(password, user?.passwordHash || DUMMY_PASSWORD_HASH);
    if (!user || user.role !== "student" || !user.passwordHash || !matches) {
      throw new StudentAccountError(401, "Invalid email or password.", "invalid_credentials");
    }
    return user;
  }
}
