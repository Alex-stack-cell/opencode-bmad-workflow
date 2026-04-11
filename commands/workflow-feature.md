---
description: Create a feature interactively - preview before writing. Saves PRD, architecture, tasks in ai-artifacts/ and updates docs/
---

If $ARGUMENTS is empty, ask the user:
- "Quel est le nom de la feature ?"
- "Quelle est la description de la feature ?"

Do NOT proceed until the user provides both. Do NOT call any tool yet.

---

## Step 1 — Preview

Call `workflow_feature_preview` with the name and description provided by the user.

Once the tool returns, tell the user:
- The preview files are at `ai-artifacts/.previews/feature-[slug]/`
- They can open, read, and edit the files freely (prd.md, architecture.md, tasks.md, global-architecture.md, feature-doc.md)

Then STOP and ask: "As-tu revu les fichiers ? Veux-tu modifier quelque chose avant de sauvegarder ?"

Do NOT call `workflow_feature_save` until the user explicitly confirms they are ready.

---

## Step 2 — Save

Only after explicit user confirmation: call `workflow_feature_save` with the same arguments.

Confirm which files were written and suggest which agent to use to start implementation.
