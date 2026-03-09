#!/usr/bin/env bash
#
# report-integrity.sh — Single source of truth for test/build reporting.
#
# Runs all verification steps in the correct order (svelte-check before vitest
# to ensure linter auto-fixes are applied before test counting) and prints a
# machine-readable + human-readable summary.
#
# Usage:  ./scripts/report-integrity.sh [phase-label]
# Example: ./scripts/report-integrity.sh "phase-28w"
#
# Output is both printed and saved to scripts/.last-report.txt

set -euo pipefail

PHASE_LABEL="${1:-}"
REPORT_FILE="scripts/.last-report.txt"

# ─── 1. Git state ────────────────────────────────────────────────
COMMIT=$(git rev-parse HEAD)
COMMIT_SHORT=$(git rev-parse --short HEAD)
BRANCH=$(git branch --show-current)
DIRTY=$(git status --porcelain | wc -l | tr -d ' ')

# ─── 2. svelte-check (FIRST — triggers linter auto-fixes) ───────
echo "Running svelte-check..."
SVELTE_OUTPUT=$(npx svelte-check --threshold error 2>&1 || true)
SVELTE_ERRORS=$(echo "$SVELTE_OUTPUT" | sed -n 's/.*\([0-9][0-9]*\) ERRORS.*/\1/p' | tail -1)
SVELTE_ERRORS="${SVELTE_ERRORS:-0}"
SVELTE_WARNINGS=$(echo "$SVELTE_OUTPUT" | sed -n 's/.*\([0-9][0-9]*\) WARNINGS.*/\1/p' | tail -1)
SVELTE_WARNINGS="${SVELTE_WARNINGS:-0}"
SVELTE_FILES=$(echo "$SVELTE_OUTPUT" | sed -n 's/.*COMPLETED \([0-9][0-9]*\) FILES.*/\1/p' | tail -1)
SVELTE_FILES="${SVELTE_FILES:-?}"

# ─── 3. vitest (AFTER svelte-check so linter fixes are applied) ──
echo "Running vitest..."
VITEST_OUTPUT=$(npx vitest run 2>&1 || true)

# Parse "Tests  928 passed (928)" or "Tests  1 failed | 927 passed (928)"
TESTS_TOTAL=$(echo "$VITEST_OUTPUT" | grep "Tests" | tail -1 | sed -n 's/.*(\([0-9][0-9]*\)).*/\1/p')
TESTS_TOTAL="${TESTS_TOTAL:-?}"
TESTS_PASSED=$(echo "$VITEST_OUTPUT" | grep "Tests" | tail -1 | sed -n 's/.*[^0-9]\([0-9][0-9]*\) passed.*/\1/p')
TESTS_PASSED="${TESTS_PASSED:-?}"
TESTS_FAILED=$(echo "$VITEST_OUTPUT" | grep "Tests" | tail -1 | sed -n 's/.*[^0-9]\([0-9][0-9]*\) failed.*/\1/p')
TESTS_FAILED="${TESTS_FAILED:-0}"

# Parse "Test Files  27 passed (27)"
TEST_FILES_PASSED=$(echo "$VITEST_OUTPUT" | grep "Test Files" | tail -1 | sed -n 's/.*[^0-9]\([0-9][0-9]*\) passed.*/\1/p')
TEST_FILES_PASSED="${TEST_FILES_PASSED:-?}"
TEST_FILES_TOTAL=$(echo "$VITEST_OUTPUT" | grep "Test Files" | tail -1 | sed -n 's/.*(\([0-9][0-9]*\)).*/\1/p')
TEST_FILES_TOTAL="${TEST_FILES_TOTAL:-$TEST_FILES_PASSED}"

# Parse "Duration  3.35s"
DURATION=$(echo "$VITEST_OUTPUT" | grep "Duration" | tail -1 | sed -n 's/.*Duration[[:space:]]*\([0-9.]*s\).*/\1/p')
DURATION="${DURATION:-?}"

# ─── 4. Golden tests (explicit separate run for visibility) ────
echo "Running golden tests..."
GOLDEN_OUTPUT=$(npx vitest run src/lib/recommendations/__tests__/golden.test.ts 2>&1 || true)
GOLDEN_PASSED=$(echo "$GOLDEN_OUTPUT" | grep "Tests" | tail -1 | sed -n 's/.*[^0-9]\([0-9][0-9]*\) passed.*/\1/p')
GOLDEN_PASSED="${GOLDEN_PASSED:-0}"
GOLDEN_FAILED=$(echo "$GOLDEN_OUTPUT" | grep "Tests" | tail -1 | sed -n 's/.*[^0-9]\([0-9][0-9]*\) failed.*/\1/p')
GOLDEN_FAILED="${GOLDEN_FAILED:-0}"

# ─── 5. Build ────────────────────────────────────────────────────
echo "Running build..."
BUILD_OUTPUT=$(npm run build 2>&1 || true)
if echo "$BUILD_OUTPUT" | grep -q "done"; then
  BUILD_STATUS="OK"
else
  BUILD_STATUS="FAILED"
fi

# ─── 6. Compose report ──────────────────────────────────────────
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

REPORT="
══════════════════════════════════════════════════════
  REPORT INTEGRITY — Single Source of Truth
══════════════════════════════════════════════════════
  Timestamp:     $TIMESTAMP
  Phase:         ${PHASE_LABEL:-"(not specified)"}
  Branch:        $BRANCH
  Commit:        $COMMIT_SHORT ($COMMIT)
  Dirty files:   $DIRTY
──────────────────────────────────────────────────────
  Tests:         $TESTS_PASSED passed, $TESTS_FAILED failed ($TESTS_TOTAL total)
  Test files:    $TEST_FILES_PASSED / $TEST_FILES_TOTAL
  Duration:      $DURATION
  Golden tests:  $GOLDEN_PASSED passed, $GOLDEN_FAILED failed
  svelte-check:  $SVELTE_ERRORS errors, $SVELTE_WARNINGS warnings ($SVELTE_FILES files)
  Build:         $BUILD_STATUS
══════════════════════════════════════════════════════
  Copyable line for progress.json:
  \"$TESTS_PASSED Tests pass ($TEST_FILES_PASSED files), svelte-check $SVELTE_ERRORS Errors $SVELTE_WARNINGS Warnings, Build $BUILD_STATUS [$COMMIT_SHORT]\"
══════════════════════════════════════════════════════
"

echo "$REPORT"
echo "$REPORT" > "$REPORT_FILE"
echo "Report saved to $REPORT_FILE"

# ─── 7. Machine-readable summary line ────────────────────────────
INTEGRITY_LINE="INTEGRITY_OK tests=$TESTS_PASSED golden=$GOLDEN_PASSED svelteErrors=$SVELTE_ERRORS build=$BUILD_STATUS"
if [ "$TESTS_FAILED" != "0" ] || [ "$GOLDEN_FAILED" != "0" ] || [ "$SVELTE_ERRORS" != "0" ] || [ "$BUILD_STATUS" != "OK" ]; then
  INTEGRITY_LINE="INTEGRITY_FAIL tests=$TESTS_PASSED golden=$GOLDEN_PASSED svelteErrors=$SVELTE_ERRORS build=$BUILD_STATUS testsFailed=$TESTS_FAILED goldenFailed=$GOLDEN_FAILED"
fi
echo "$INTEGRITY_LINE"
echo "$INTEGRITY_LINE" >> "$REPORT_FILE"

# ─── 8. Exit code reflects overall status ────────────────────────
if [ "$TESTS_FAILED" != "0" ] || [ "$GOLDEN_FAILED" != "0" ] || [ "$SVELTE_ERRORS" != "0" ] || [ "$BUILD_STATUS" != "OK" ]; then
  exit 1
fi
