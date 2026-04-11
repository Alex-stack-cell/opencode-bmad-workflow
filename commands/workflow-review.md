---
description: Code review interactively - preview before writing. Saves analysis and review report in ai-artifacts/
---

## Step 1 — Preview

Call `workflow_review_preview` with scope: $ARGUMENTS (use current git diff if empty).

Once the tool returns, tell the user:
- The preview files are at `ai-artifacts/.previews/review-[slug]/`
- They can open, read, and annotate the files freely

Then STOP and ask: "As-tu revu les fichiers ? Veux-tu ajuster quelque chose avant de sauvegarder ?"

Do NOT call `workflow_review_save` until the user explicitly confirms they are ready.

---

## Step 2 — Save

Only after explicit user confirmation: call `workflow_review_save` with the same arguments.

Display the verdict and list CRITICAL/HIGH issues to the user.
