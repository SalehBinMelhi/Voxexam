#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$ROOT"

echo "== VoxExam preflight check =="
echo ""

# Check AGENTS.md exists
if [ ! -f "AGENTS.md" ]; then
  echo "ERROR: AGENTS.md not found in repo root. This is required."
  exit 1
fi
echo "OK: AGENTS.md found"

# Check package.json exists
if [ ! -f "package.json" ]; then
  echo "ERROR: package.json not found in repo root."
  exit 1
fi
echo "OK: package.json found"

# Check shared/schema.ts exists
if [ ! -f "shared/schema.ts" ]; then
  echo "WARN: shared/schema.ts not found — schema may be in a different location."
else
  echo "OK: shared/schema.ts found"
fi

# Check server/storage.ts exists
if [ ! -f "server/storage.ts" ]; then
  echo "WARN: server/storage.ts not found — storage file may be in a different location."
else
  echo "OK: server/storage.ts found"
fi

echo ""
echo "== Available npm scripts =="
node - <<'NODE'
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const scripts = pkg.scripts || {};
const preferred = ["check", "lint", "test", "build", "dev", "db:generate"];
for (const name of preferred) {
  if (scripts[name]) {
    console.log(`  ${name}: npm run ${name}`);
  }
}
// Check for forbidden scripts
const forbidden = ["db:push"];
for (const name of forbidden) {
  if (scripts[name]) {
    console.log(`  WARNING — forbidden script present: ${name} (never run automatically)`);
  }
}
NODE

echo ""
echo "== Checking for hardcoded secrets in tracked files =="
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  matches="$(git grep -I -l -E 'sk-[A-Za-z0-9_-]{20,}' -- . \
    ':!package-lock.json' ':!pnpm-lock.yaml' ':!yarn.lock' \
    ':!*.md' ':!*.txt' || true)"
  if [ -n "$matches" ]; then
    echo "ERROR: Possible hardcoded OpenAI-style key found in:"
    echo "$matches"
    exit 2
  fi
  echo "OK: No obvious hardcoded API key pattern found in tracked files"
else
  echo "WARN: Not inside a git work tree — skipped secret check"
fi

echo ""
echo "== Checking post-merge.sh is deleted =="
if [ -f "scripts/post-merge.sh" ]; then
  echo "ERROR: scripts/post-merge.sh still exists — this file runs db:push automatically and must be deleted."
  exit 3
fi
echo "OK: scripts/post-merge.sh not present"

echo ""
echo "== Preflight complete. Safe to proceed. =="
