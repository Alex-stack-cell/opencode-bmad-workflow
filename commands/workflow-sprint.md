---
description: Plan a sprint interactively - preview before writing. Saves sprint plan and stories in ai-artifacts/
---

If $ARGUMENTS is empty, ask the user:
- "Quel est l'objectif du sprint ?"
- "Quelle est la durée (en semaines) ?"

Do NOT proceed until the user provides both. Do NOT call any tool yet.

---

## Step 1 — Preview

Call `workflow_sprint_preview` with the goal and duration provided by the user.

Once the tool returns, tell the user:
- The preview files are at `ai-artifacts/.previews/sprint-[slug]/`
- They can open, read, and edit the files freely

Then STOP and ask: "As-tu revu les fichiers ? Veux-tu modifier quelque chose avant de sauvegarder ?"

Do NOT call `workflow_sprint_save` until the user explicitly confirms they are ready.

---

## Step 2 — Save

Only after explicit user confirmation: call `workflow_sprint_save` with the same arguments.

Summarize the planned stories and their total estimated effort.
