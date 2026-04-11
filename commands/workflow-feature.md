---
description: Create a feature interactively - preview before writing. Saves PRD, architecture, tasks in ai-artifacts/ and updates docs/
agent: pm
---

**IMPORTANT: If $ARGUMENTS is empty, you MUST stop immediately and ask the user:**
- "What is the name of the feature?"
- "What is the description of the feature?"
Do NOT proceed until the user provides both.

## Step 1 — Preview

Call `workflow_feature_preview` with the name and description from: $ARGUMENTS

Tell the user the preview files are ready and where to find them (ai-artifacts/.previews/feature-[slug]/).
Ask them to open and review the files, and edit anything they want to change.

---

**CHECKPOINT — Stop here.**

Ask:
1. Have you reviewed the preview files?
2. Anything to edit before saving?

Wait for explicit confirmation before proceeding.

---

## Step 2 — Save

Call `workflow_feature_save` with the same arguments.

Confirm which files were written and suggest which agent to use to start implementation.
