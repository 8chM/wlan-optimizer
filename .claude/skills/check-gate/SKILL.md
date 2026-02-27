---
name: check-gate
description: Check the quality gate for a specific phase
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash
argument-hint: "[phase-number]"
---

# Quality Gate Check for Phase $0

## Steps

1. Read `docs/plans/progress.json` for current phase status
2. Read `.claude/rules/phasenmodell.md` for gate conditions of phase $0
3. Verify each gate condition:
   - Check if deliverables exist and are not empty
   - Check if required documentation is complete
   - Check if tests pass (if applicable in this phase)
   - Check if dependencies from previous phases are met
4. Report status for each condition with file paths
5. Give overall verdict: PASSED or NOT PASSED with specific reasons
6. If PASSED: suggest updating progress.json via `/update-progress`
