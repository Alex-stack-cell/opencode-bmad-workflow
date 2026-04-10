---
description: Create an epic interactively - preview before writing. Saves docs in ai-artifacts/epics/ and updates docs/
agent: pm
---

**IMPORTANT: If $ARGUMENTS is empty, you MUST stop immediately and ask the user:**
- "What is the name of the epic?"
- "What is the goal of the epic?"
- "What is the priority? (HIGH / MEDIUM / LOW)"
Do NOT proceed until the user provides all three.

## Step 1 — Preview

Call `workflow_epic` with `dry_run: true` using the name, goal, and priority from: $ARGUMENTS

Show the full preview returned by the tool.

---

**CHECKPOINT — Stop here.**

Ask:
1. Does the epic scope look correct?
2. Any features to add or remove?
3. Does the effort estimate reasoning make sense?
4. Anything to adjust before saving?

Wait for explicit confirmation before proceeding.

---

## Step 2 — Save

Call `workflow_epic` again with the same args but `dry_run: false`.

Confirm which files were written and suggest running `/workflow-feature [feature name]` for each feature to implement.
