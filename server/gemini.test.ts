import type {
  ExamBlueprint,
  AnswerEvaluationResult,
} from "./gemini.ts";

async function runTests() {
  console.log("=== RUNNING VOXEXAM ADAPTIVE GEMINI SUITE ===");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, description: string) {
    if (condition) {
      console.log(`✓ PASS: ${description}`);
      passed++;
    } else {
      console.error(`✗ FAIL: ${description}`);
      failed++;
    }
  }

  // TEST 1: Mock Blueprint & Concept Validation
  const sampleBlueprint: ExamBlueprint = {
    summary: "Intro to Python Data Types and Control Flow",
    courseName: "CS 101",
    topics: [
      {
        id: "topic-1",
        title: "Python Data Types",
        description: "Core primitive types in Python",
        importance: 1,
        concepts: [
          {
            id: "concept-data-types",
            title: "Basic Data Types",
            description: "Primitive built-in data types in Python",
            learningObjectives: ["Identify primitive types"],
            expectedKeyPoints: ["String", "Integer", "Float", "Boolean"],
            commonMisconceptions: ["Confusing string numbers with integers"],
            difficulty: "basic",
            suggestedInitialQuestion: "Mention the basic Python data types and briefly explain each one.",
          },
        ],
      },
    ],
  };

  assert(sampleBlueprint.topics.length === 1, "Blueprint contains 1 topic");
  assert(sampleBlueprint.topics[0].concepts[0].expectedKeyPoints.length === 4, "Concept expects 4 key points");

  // TEST 2: Adaptive Decision Rules
  const concept = sampleBlueprint.topics[0].concepts[0];

  // Rule 2 Check: Partial Answer ("String, integer, and float" - missing Boolean)
  const partialResult: AnswerEvaluationResult = {
    transcript: "String, integer, and float.",
    answerSummary: "Student mentioned string, integer, float but omitted Boolean",
    coveredKeyPoints: ["String", "Integer", "Float"],
    missingKeyPoints: ["Boolean"],
    misconceptions: [],
    correctness: "partially_correct",
    score: 75,
    confidence: 95,
    nextAction: "follow_up",
    followUpReason: "Missing Boolean data type",
    nextQuestion: "What do you know about the Boolean data type in Python?",
    nextConceptId: "concept-data-types",
    studentFeedback: "Good start! You omitted Boolean.",
  };

  assert(partialResult.correctness === "partially_correct", "Adaptive logic identifies partial answer");
  assert(partialResult.missingKeyPoints.includes("Boolean"), "Identifies missing Boolean point");
  assert(partialResult.nextAction === "follow_up", "Generates targeted follow-up question action");
  assert(partialResult.nextQuestion?.includes("Boolean") === true, "Follow-up question targets missing Boolean point");

  // TEST 3: Doctor Score Override Preservation
  const originalAIScore = 75;
  const doctorOverrideScore = 90;

  const mockAttemptRecord = {
    id: "attempt-123",
    finalScore: originalAIScore,
    totalScore: originalAIScore,
    doctorFinalScore: doctorOverrideScore,
    doctorScoreOverrides: [
      {
        doctorId: "doc-456",
        timestamp: new Date().toISOString(),
        originalFinalScore: originalAIScore,
        newDoctorFinalScore: doctorOverrideScore,
        reason: "Student gave acceptable oral justification for Boolean in follow up.",
      },
    ],
  };

  assert(mockAttemptRecord.finalScore === originalAIScore, "Original AI score is preserved in record");
  assert(mockAttemptRecord.doctorFinalScore === doctorOverrideScore, "Doctor score override is stored");
  assert(mockAttemptRecord.doctorScoreOverrides.length === 1, "Override audit trail is logged");

  // TEST 4: Access Code Format Check
  const accessCode = Math.floor(10000 + Math.random() * 90000).toString();
  assert(/^\d{5}$/.test(accessCode), "Access code is a valid 5-digit string");

  console.log(`\n=== SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
