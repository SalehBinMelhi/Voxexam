import { execSync } from "node:child_process";

try {
  console.log("[VoxExam] Building the application...");

  execSync("npm run build", {
    stdio: "inherit",
  });

  if (process.env.RUN_DB_MIGRATIONS === "true") {
    console.log("[VoxExam] Running database migrations...");

    execSync("npm run db:migrate", {
      stdio: "inherit",
    });
  }

  process.env.NODE_ENV = "production";

  // BOT-HOSTING supplies SERVER_PORT, while VoxExam expects PORT.
  process.env.PORT =
    process.env.SERVER_PORT ||
    process.env.PORT ||
    "5000";

  console.log(
    `[VoxExam] Starting application on port ${process.env.PORT}...`,
  );

  await import("./dist/index.cjs");
} catch (error) {
  console.error(
    "[VoxExam] Startup failed:",
    error instanceof Error ? error.message : error,
  );

  process.exit(1);
}