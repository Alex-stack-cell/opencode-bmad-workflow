---
description: Plan a sprint interactively - preview before writing. Saves sprint plan and stories in ai-artifacts/
agent: pm
---

**IMPORTANT: If $ARGUMENTS is empty, you MUST stop immediately and ask the user:**
- "What is the sprint goal or theme?"
- "What is the sprint duration (in weeks)?"
Do NOT proceed until the user provides both.

## Step 1 — Preview

Call `workflow_sprint_preview` with the goal and duration from: $ARGUMENTS

Tell the user the preview files are ready and where to find them (ai-artifacts/.previews/sprint-[slug]/).
Ask them to open and review the files, and edit anything they want to change.

---

**CHECKPOINT — Stop here.**

Ask:
1. Have you reviewed the preview files?
2. Anything to edit before saving?

Wait for explicit confirmation before proceeding.

---

## Step 2 — Save

Call `workflow_sprint_save` with the same arguments.

Summarize the planned stories and their total estimated effort.
