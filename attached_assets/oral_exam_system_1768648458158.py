"""
Simple prototype for an oral exam management system.

This script demonstrates how a university could structure a basic exam
workflow that allows professors to create and schedule exams and students
to take those exams. It uses in-memory data structures and standard
Python libraries. Audio recording/transcription is represented with
placeholders because the environment does not provide external speech
libraries. For a production system, the `transcribe_audio` function
would call an ASR engine like Whisper or SpeechRecognition.

Usage:
    python oral_exam_system.py

The script will prompt the user to log in as either a professor or a
student and present appropriate menus.
"""

from __future__ import annotations

import datetime
import sys
from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class User:
    username: str
    role: str  # 'professor' or 'student'


@dataclass
class Question:
    text: str
    q_type: str  # 'mcq', 'short', 'audio'
    options: Optional[List[str]] = field(default_factory=list)
    correct_answer: Optional[str] = None

    def evaluate(self, response: str) -> float:
        """Return a score for the response.

        For multiple-choice questions, returns 1 for correct answer, 0 otherwise.
        For short and audio questions, a simple similarity check is used.
        A more sophisticated system would employ NLP techniques or rubric-based
        grading with a large language model.
        """
        if self.q_type == "mcq":
            return 1.0 if response.strip().lower() == (self.correct_answer or "").lower() else 0.0

        # For short and audio questions, check if all words in the correct answer
        # appear in the response. This is a naive implementation.
        if not self.correct_answer:
            return 0.0
        correct_words = set(self.correct_answer.lower().split())
        response_words = set(response.lower().split())
        common = correct_words & response_words
        return len(common) / len(correct_words) if correct_words else 0.0


@dataclass
class Exam:
    title: str
    professor: User
    questions: List[Question] = field(default_factory=list)
    start_time: Optional[datetime.datetime] = None
    end_time: Optional[datetime.datetime] = None
    assigned_students: List[User] = field(default_factory=list)

    def is_active(self) -> bool:
        now = datetime.datetime.now()
        if self.start_time and self.end_time:
            return self.start_time <= now <= self.end_time
        return False

    def administer_exam(self, student: User) -> Dict[str, float]:
        """
        Conduct the exam for the given student and return their scores.

        Each question is presented and the student is asked to provide an
        answer. For audio questions, the student is prompted to type a
        response because audio recording is not available in this environment.
        """
        if not self.is_active():
            raise RuntimeError("Exam is not currently active.")
        if student not in self.assigned_students:
            raise RuntimeError("Student is not assigned to this exam.")
        scores: Dict[str, float] = {}
        print(f"\nStarting exam: {self.title}\n")
        for idx, question in enumerate(self.questions, start=1):
            print(f"Question {idx}: {question.text}")
            if question.q_type == "mcq":
                for opt_idx, opt in enumerate(question.options, start=1):
                    print(f"  {opt_idx}. {opt}")
            if question.q_type == "audio":
                print("(Audio response expected. Please type your answer; in a real system you would speak.)")
            response = input("Your response: ")
            score = question.evaluate(response)
            scores[question.text] = score
            print(f"Score for this question: {score:.2f}\n")
        total_score = sum(scores.values()) / len(self.questions) if self.questions else 0.0
        print(f"Exam completed. Average score: {total_score:.2f}\n")
        return scores


class ExamSystem:
    def __init__(self):
        self.users: Dict[str, User] = {}
        self.exams: List[Exam] = []

    def register_user(self, username: str, role: str) -> User:
        if username in self.users:
            return self.users[username]
        user = User(username=username, role=role)
        self.users[username] = user
        return user

    def create_exam(self, professor: User) -> Exam:
        title = input("Enter exam title: ")
        exam = Exam(title=title, professor=professor)

        # Add questions
        while True:
            text = input("Enter question text (or 'done' to finish): ")
            if text.strip().lower() == "done":
                break
            q_type = input("Question type (mcq/short/audio): ").strip().lower()
            options: List[str] = []
            correct_answer: Optional[str] = None
            if q_type == "mcq":
                while True:
                    opt = input("  Enter option (or 'done' when finished options): ")
                    if opt.strip().lower() == "done":
                        break
                    options.append(opt)
                correct_answer = input("Enter the correct option exactly as entered: ")
            else:
                correct_answer = input("Enter the expected answer for evaluation: ")
            question = Question(text=text, q_type=q_type, options=options, correct_answer=correct_answer)
            exam.questions.append(question)

        # Schedule exam
        print("\nSchedule the exam (leave blank to skip scheduling for now).")
        start_str = input("Enter start time (YYYY-MM-DD HH:MM, 24h): ")
        end_str = input("Enter end time (YYYY-MM-DD HH:MM, 24h): ")
        if start_str and end_str:
            try:
                exam.start_time = datetime.datetime.strptime(start_str, "%Y-%m-%d %H:%M")
                exam.end_time = datetime.datetime.strptime(end_str, "%Y-%m-%d %H:%M")
            except ValueError:
                print("Invalid date format. Skipping scheduling.")

        # Assign students
        print("Assign students to this exam.")
        while True:
            stu_name = input("  Enter student username (or 'done' to finish): ")
            if stu_name.strip().lower() == "done":
                break
            student = self.register_user(stu_name, role="student")
            exam.assigned_students.append(student)

        self.exams.append(exam)
        print(f"Exam '{title}' created with {len(exam.questions)} questions.\n")
        return exam

    def take_exam(self, student: User):
        available_exams = [exam for exam in self.exams if student in exam.assigned_students and exam.is_active()]
        if not available_exams:
            print("No active exams assigned to you at this time.")
            return
        print("Available exams:")
        for idx, exam in enumerate(available_exams, start=1):
            end_time_str = exam.end_time.strftime("%Y-%m-%d %H:%M") if exam.end_time else "N/A"
            print(f"  {idx}. {exam.title} (ends at {end_time_str})")
        choice = input("Select exam number: ")
        try:
            idx = int(choice) - 1
            if idx < 0 or idx >= len(available_exams):
                raise ValueError
            exam = available_exams[idx]
            exam.administer_exam(student)
        except ValueError:
            print("Invalid selection.")


def main():
    system = ExamSystem()
    print("Welcome to the Oral Exam Management System prototype.")
    while True:
        username = input("\nEnter your username (or 'exit' to quit): ")
        if username.strip().lower() == "exit":
            break
        role = input("Are you logging in as a professor or student? ").strip().lower()
        if role not in {"professor", "student"}:
            print("Invalid role. Try again.")
            continue
        user = system.register_user(username, role)
        if role == "professor":
            while True:
                print("\nProfessor menu:")
                print("  1. Create a new exam")
                print("  2. View my exams")
                print("  3. Logout")
                choice = input("Select an option: ")
                if choice == "1":
                    system.create_exam(user)
                elif choice == "2":
                    my_exams = [exam for exam in system.exams if exam.professor == user]
                    if not my_exams:
                        print("No exams created yet.")
                    for ex in my_exams:
                        start_str = ex.start_time.strftime("%Y-%m-%d %H:%M") if ex.start_time else "N/A"
                        end_str = ex.end_time.strftime("%Y-%m-%d %H:%M") if ex.end_time else "N/A"
                        print(f"Exam: {ex.title}, Questions: {len(ex.questions)}, Scheduled: {start_str} to {end_str}")
                elif choice == "3":
                    break
                else:
                    print("Invalid option.")
        else:  # student
            while True:
                print("\nStudent menu:")
                print("  1. Take an exam")
                print("  2. Logout")
                choice = input("Select an option: ")
                if choice == "1":
                    system.take_exam(user)
                elif choice == "2":
                    break
                else:
                    print("Invalid option.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nExiting.")