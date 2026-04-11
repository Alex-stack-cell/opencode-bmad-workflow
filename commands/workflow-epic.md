---
description: Create an epic interactively - preview before writing. Saves docs in ai-artifacts/epics/ and updates docs/
---

If $ARGUMENTS is empty, ask the user:
- "Quel est le nom de l'epic ?"
- "Quel est l'objectif business ?"
- "Quelle est la priorité ? (HIGH / MEDIUM / LOW)"

Do NOT proceed until the user provides all three. Do NOT call any tool yet.

---

## Step 1 — Preview

Call `workflow_epic_preview` with the name, goal, and priority provided by the user.

Once the tool returns, tell the user:
- The preview files are at `ai-artifacts/.previews/epic-[slug]/`
- They can open, read, and edit the files freely

Then STOP and ask: "As-tu revu les fichiers ? Veux-tu modifier quelque chose avant de sauvegarder ?"

Do NOT call `workflow_epic_save` until the user explicitly confirms they are ready.

---

## Step 2 — Save

Only after explicit user confirmation: call `workflow_epic_save` with the same arguments.

Confirm which files were written and suggest running `/workflow-feature` for each feature to implement.
