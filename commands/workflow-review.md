---
description: Code review interactively - preview before writing. Saves analysis and review report in ai-artifacts/
agent: analyst
---

## Step 1 — Preview

Call `workflow_review` with `dry_run: true`.

Scope: $ARGUMENTS (use current git diff if empty)

Show the full preview returned by the tool.

---

**CHECKPOINT — Stop here.**

Ask:
1. Do the findings look accurate?
2. Any severity levels to adjust?
3. Anything to refine before saving?

Wait for explicit confirmation before proceeding.

---

## Step 2 — Save

Call `workflow_review` again with the same args but `dry_run: false`.

Display the verdict and list CRITICAL/HIGH issues to the user.
