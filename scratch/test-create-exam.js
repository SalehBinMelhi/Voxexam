const http = require('http');

async function run() {
  // Login
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo.professor@voxexam.ae', password: 'demo' })
  });
  const cookie = loginRes.headers.get('set-cookie');
  console.log("Cookie:", cookie);

  // Create exam
  const res = await fetch('http://localhost:5000/api/exams', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Cookie': cookie
    },
    body: JSON.stringify({
      title: "Test Exam",
      questions: [{ text: "What is Chemistry?", type: "short", correctAnswer: "It is a science." }],
      startTime: null,
      endTime: null,
      classId: null,
      assignedStudentNames: []
    })
  });
  const data = await res.json();
  console.log("Status:", res.status);
  console.log("Response:", data);
}
run();
