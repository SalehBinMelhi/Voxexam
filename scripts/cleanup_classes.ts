import { db } from "../server/db";
import { classes, classMaterials, enrollments } from "../shared/schema";
import { inArray, desc } from "drizzle-orm";

async function main() {
  const allClasses = await db.query.classes.findMany({
    orderBy: [desc(classes.createdAt)],
  });

  if (allClasses.length <= 1) {
    console.log("Only one class or no classes found. Exiting.");
    process.exit(0);
  }

  const latestClass = allClasses[0];
  const classesToDelete = allClasses.slice(1);
  const classIdsToDelete = classesToDelete.map((c: { id: string }) => c.id);

  console.log(`Keeping class: ${latestClass.subjectName} (${latestClass.id})`);
  console.log(`Deleting ${classIdsToDelete.length} classes...`);

  if (classIdsToDelete.length > 0) {
    await db.delete(classMaterials).where(inArray(classMaterials.classId, classIdsToDelete));
    await db.delete(enrollments).where(inArray(enrollments.classId, classIdsToDelete));
    await db.delete(classes).where(inArray(classes.id, classIdsToDelete));
  }
  
  console.log("Deleted.");
  process.exit(0);
}

main().catch(console.error);
