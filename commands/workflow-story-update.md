---
description: Update a story's status (ready-for-dev / in-progress / review / done / superseded / deferred)
---

If $ARGUMENTS is empty, ask the user:
- "Quel est l'ID de la story à mettre à jour ?" (e.g. "1.1")
- "Quel est le nouveau statut ?" (ready-for-dev / in-progress / review / done / superseded / deferred)
- "Un commentaire à ajouter ? (optionnel — ex: date, raison)"

Do NOT proceed until the user provides at least the story ID and status. Do NOT call any tool yet.

---

Call `workflow_story_update` with the story_id, status, and optional note.

Confirm the update and suggest next steps based on the new status:
- `review` → suggest `/workflow-review`
- `done` → suggest `/workflow-status` to see updated overview
