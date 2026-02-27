---
name: run-tests
description: Run all tests (frontend + backend) and report results
user-invocable: true
allowed-tools: Read, Bash, Grep, Glob
argument-hint: "[scope: all|frontend|backend|e2e]"
---

# Run Tests: $0

## Steps

1. Determine test scope from argument (default: all)
2. Run the appropriate tests:

### Frontend (Vitest)
```bash
npx vitest run --reporter=verbose 2>&1 | tail -50
```

### Backend (Rust)
```bash
cd src-tauri && cargo test 2>&1 | tail -50
```

### E2E (WebdriverIO)
```bash
npx wdio run tests/e2e/wdio.conf.ts 2>&1 | tail -50
```

3. Parse results and report:
   - Total tests: passed / failed / skipped
   - Failed test details with file:line
   - Performance test results if applicable
4. If tests fail, identify the root cause and suggest fixes
5. Report overall status: ALL PASS / FAILURES FOUND
