---
description: Plan a sprint interactively - preview before writing. Saves sprint plan and stories in ai-artifacts/
agent: pm
---

**IMPORTANT: If $ARGUMENTS is empty, you MUST stop immediately and ask the user:**
- "What is the sprint goal or theme?"
- "What is the sprint duration (in weeks)?"
Do NOT proceed until the user provides both.

## Step 1 — Preview

Call `workflow_sprint` with `dry_run: true` using the goal and duration from: $ARGUMENTS

Show the full preview returned by the tool.

---

**CHECKPOINT — Stop here.**

Ask:
1. Does the sprint plan look correct?
2. Any stories to add, remove, or reprioritize?
3. Any user stories or acceptance criteria to refine?
4. Anything to adjust before saving?

Wait for explicit confirmation before proceeding.

---

## Step 2 — Save

Call `workflow_sprint` again with the same args but `dry_run: false`.

Summarize the planned stories and their total estimated effort.
