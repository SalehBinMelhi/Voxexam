import { db } from "../server/db.ts";
import { exams, examVersions } from "../shared/schema.ts";
import { isNull } from "drizzle-orm";

async function main() {
  console.log("Cleaning up broken exams...");
  const result = await db.delete(exams).where(isNull(exams.currentVersionId));
  console.log(`Deleted ${result.rowCount} broken exams without a version.`);
  process.exit(0);
}

main();
