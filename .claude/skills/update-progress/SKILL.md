---
name: update-progress
description: Update the project progress tracking file
user-invocable: true
allowed-tools: Read, Write, Edit
argument-hint: "[phase] [status] [notes]"
---

# Update Progress

Update `docs/plans/progress.json` with the latest progress.

## Arguments
- Phase: $0
- Status: $1 (pending, in_progress, completed, blocked)
- Notes: $2

## Steps

1. Read current `docs/plans/progress.json`
2. Update the specified phase with new status
3. Add timestamp and notes
4. Write back the updated file
5. Confirm the update
