---
description: Automated sprint planning - PM creates sprint plan, waits for validation, then writes detailed user stories. Saves docs in .workflow/
agent: pm
---

Run the sprint planning workflow in 2 steps for: $ARGUMENTS

## Step 1 - PM: Sprint plan

Act as a senior PM using BMAD methodology. Create a sprint plan for: $ARGUMENTS

Include:
- Sprint goal statement
- Prioritized user stories (in scope) — reference existing epics if any exist in `.workflow/epics/`
- Stories out of scope (backlog)
- Definition of Done
- Risks and blockers

Save in `.workflow/sprint-[date]/SPRINT-PLAN.md`.

---

**CHECKPOINT — Stop here and show the sprint plan to the user.**

Ask:
1. Does the sprint plan look correct?
2. Any stories to add, remove, or reprioritize?
3. Any effort estimates to adjust?

Wait for explicit confirmation ("ok", "go", "continue") or adjustments before proceeding to Step 2.

---

## Step 2 - PM: Detailed user stories

Only run this step after the user has validated the sprint plan.

Write complete user stories for each story confirmed in the sprint plan.

For each story:
- Full user story (As a / I want / So that)
- Detailed acceptance criteria (Given/When/Then)
- Technical notes for developers
- Effort estimate (S/M/L)
- Link to parent epic if applicable

Save in `.workflow/sprint-[date]/STORIES.md`.

---

Summarize the planned stories and their total estimated effort.
