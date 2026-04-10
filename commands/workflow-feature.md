---
description: Create a feature interactively - preview before writing. Saves PRD, architecture, tasks in ai-artifacts/ and updates docs/
agent: pm
---

**IMPORTANT: If $ARGUMENTS is empty, you MUST stop immediately and ask the user:**
- "What is the name of the feature?"
- "What is the description of the feature?"
Do NOT proceed until the user provides both.

## Step 1 — Preview

Call `workflow_feature` with `dry_run: true` using the name and description from: $ARGUMENTS

Show the full preview returned by the tool.

---

**CHECKPOINT — Stop here.**

Ask:
1. Does the PRD correctly capture the feature?
2. Any user stories to add, remove, or adjust?
3. Does the architecture look correct?
4. Any tasks to add, split, or remove?
5. Anything to adjust before saving?

Wait for explicit confirmation before proceeding.

---

## Step 2 — Save

Call `workflow_feature` again with the same args but `dry_run: false`.

Confirm which files were written and suggest which agent to use to start implementation.
