---
name: VoxPractice material extraction
description: Why the student practice flow needs its own file-extraction endpoint
---

The VoxPractice Foundation backend exposed `POST /api/practice/analyze-material`
which takes already-extracted raw **text**, but provided no endpoint to turn an
uploaded file (PDF/DOCX/PPTX/XLSX) into text. The only existing extraction lived
in the professor-only, class-scoped `POST /api/classes/:classId/materials` route.

**Decision:** added `POST /api/practice/extract-material` (auth + requireStudent,
multer single file, stores nothing) plus a module-level `extractTextFromUpload`
helper in `server/routes.ts` that mirrors the same pdf(unpdf→pdf-parse)/mammoth/
JSZip/XLSX logic.

**Why:** the student upload path is a hard requirement and cannot reuse the
professor route (wrong role, needs a classId, persists a Material row).

**How to apply:** if you touch student-side file upload, reuse
`extractTextFromUpload`; don't route students through the professor materials
endpoint. Backend generation caps practice questions at 10 regardless of the
requested `count`, so UI progress must use the returned question count.

## Upload fetch cross-browser gotcha
Student upload posts FormData to extract-material. Safari/WebKit throws the
cryptic DOMException "The string did not match the expected pattern" when
`res.json()` runs on a non-JSON response (e.g. a multer large-file rejection or
HTML error page) and when FormData.append omits an explicit filename.
**Rule:** for FormData uploads, never set Content-Type manually, pass an explicit
filename (`fd.append("file", file, file.name || "upload")`), and parse responses
defensively (read `res.text()` then `JSON.parse` in a try/catch) instead of
calling `res.json()` directly.
