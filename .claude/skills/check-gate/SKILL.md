---
name: check-gate
description: Check the quality gate for a specific phase
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash
argument-hint: "[phase-number]"
---

# Quality Gate Check for Phase $0

Read `docs/plans/progress.json` and `CLAUDE.md` to determine the gate conditions for phase $0.

## Steps

1. Read the current progress from `docs/plans/progress.json`
2. Read the gate conditions from `CLAUDE.md` for phase $0
3. Verify each condition:
   - Check if deliverables exist and are not empty
   - Check if tests pass (if applicable)
   - Check if documentation is complete
4. Report status for each condition
5. Give overall verdict: PASSED or NOT PASSED with reasons
