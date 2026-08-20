import "dotenv/config";
import { db } from "../server/db";
import { exams, submissions, examVersions, examQuestions, attemptAnswers } from "../shared/schema";
import { eq, isNull } from "drizzle-orm";

async function migrateData() {
  console.log("Starting data migration...");
  
  // 1. Migrate Exams -> Exam Versions & Questions
  const allExams = await db.select().from(exams);
  console.log(`Found ${allExams.length} exams to migrate.`);
  
  for (const exam of allExams) {
    if (!exam.currentVersionId) {
      // Create initial version
      const [version] = await db.insert(examVersions).values({
        examId: exam.id,
        versionNumber: 1,
        title: exam.title,
        description: exam.description,
        subjectName: exam.subjectName,
        durationMinutes: exam.durationMinutes || 30,
        maxQuestions: exam.maxQuestions || 10,
        passingScore: exam.passingScore || 60,
        adaptiveSettings: exam.blueprint,
        createdBy: exam.professorId,
        publishedAt: exam.status === "active" ? new Date() : null,
      }).returning();

      await db.update(exams)
        .set({ currentVersionId: version.id, publicExamCode: exam.accessCode })
        .where(eq(exams.id, exam.id));
        
      // Migrate questions
      if (Array.isArray(exam.questions)) {
        for (let i = 0; i < exam.questions.length; i++) {
          const q: any = exam.questions[i];
          await db.insert(examQuestions).values({
            examVersionId: version.id,
            questionOrder: i,
            questionText: q.text || "Untitled Question",
            questionType: q.type || "short",
            expectedAnswer: q.correctAnswer,
            maximumPoints: 100,
          });
        }
      }
      console.log(`Migrated exam ${exam.id} (Created Version 1)`);
    }
  }

  // 2. Migrate Submissions -> Attempt Answers
  const allSubmissions = await db.select().from(submissions);
  console.log(`Found ${allSubmissions.length} submissions to migrate.`);

  for (const sub of allSubmissions) {
    if (!sub.examVersionId) {
      const parentExam = allExams.find(e => e.id === sub.examId);
      let versionId = null;
      if (parentExam) {
        const [v] = await db.select().from(examVersions).where(eq(examVersions.examId, parentExam.id));
        if (v) versionId = v.id;
      }
      
      await db.update(submissions)
        .set({ 
          examVersionId: versionId,
          percentageScore: sub.totalScore ? sub.totalScore : 0,
        })
        .where(eq(submissions.id, sub.id));
        
      if (Array.isArray(sub.responses)) {
        for (const resp of sub.responses) {
          const r: any = resp;
          let transcript = r.transcript || r.response;
          let audioPath = r.audioData; 
          let autoScore = sub.scores?.[r.questionId];

          await db.insert(attemptAnswers).values({
            attemptId: sub.id,
            questionId: r.questionId || "unknown",
            answerText: transcript,
            transcript: transcript,
            audioStoragePath: audioPath,
            automaticScore: autoScore !== undefined ? autoScore : null,
          });
        }
      }
      console.log(`Migrated submission ${sub.id}`);
    }
  }

  console.log("Migration complete!");
}

migrateData().catch(console.error).finally(() => process.exit(0));
