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

Call `workflow_epic_preview` with the name, goal, and priority from: $ARGUMENTS

Tell the user the preview files are ready and where to find them (ai-artifacts/.previews/epic-[slug]/).
Ask them to open and review the files, and edit anything they want to change.

---

**CHECKPOINT — Stop here.**

Ask:
1. Have you reviewed the preview files?
2. Anything to edit before saving?

Wait for explicit confirmation before proceeding.

---

## Step 2 — Save

Call `workflow_epic_save` with the same arguments.

Confirm which files were written and suggest running `/workflow-feature` for each feature to implement.
