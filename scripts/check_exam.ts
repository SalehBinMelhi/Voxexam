import { storage } from "../server/storage.ts";
import { db } from "../server/db.ts";
import { exams, examVersions } from "../shared/schema.ts";
import { eq } from "drizzle-orm";

async function main() {
  const examId = "a9d409f7-da48-4f3b-b1b2-cbcb6fe13416";
  const exam = await storage.getExam(examId);
  console.log("storage.getExam output:", JSON.stringify(exam, null, 2));

  const [rawExam] = await db.select().from(exams).where(eq(exams.id, examId));
  console.log("Raw exam table output:", JSON.stringify(rawExam, null, 2));

  if (rawExam?.currentVersionId) {
    const [version] = await db.select().from(examVersions).where(eq(examVersions.id, rawExam.currentVersionId));
    console.log("Raw examVersion table output:", JSON.stringify(version, null, 2));
  }
  
  process.exit(0);
}

main();
