---
description: Code review interactively - preview before writing. Saves analysis and review report in ai-artifacts/
agent: analyst
---

## Step 1 — Preview

Call `workflow_review_preview` with scope: $ARGUMENTS (use current git diff if empty)

Tell the user the preview files are ready and where to find them (ai-artifacts/.previews/review-[slug]/).
Ask them to open, review, and annotate anything they want to adjust.

---

**CHECKPOINT — Stop here.**

Ask:
1. Have you reviewed the preview files?
2. Any severity levels or findings to adjust?

Wait for explicit confirmation before proceeding.

---

## Step 2 — Save

Call `workflow_review_save` with the same arguments.

Display the verdict and list CRITICAL/HIGH issues to the user.
