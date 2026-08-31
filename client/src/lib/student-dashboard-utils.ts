export const STUDENT_EXAM_VISIBLE_LIMIT = 4;

export function shouldScrollStudentExamFrame(examCount: number): boolean {
  return examCount > STUDENT_EXAM_VISIBLE_LIMIT;
}

export function studentClassLeaveLabel(className: unknown): string {
  const normalizedName = typeof className === "string" ? className.trim() : "";
  return normalizedName ? `Leave ${normalizedName}` : "Leave this class";
}

/**
 * Keep every exam in the scroll frame. Scrolling is a presentation policy,
 * not pagination or truncation.
 */
export function studentExamFrameItems<T>(items: readonly T[]): T[] {
  return [...items];
}
