---
description: Create a story interactively - preview before writing. Saves BMAD story in ai-artifacts/implementation-artifacts/stories/ and updates sprint-status.yaml
---

If $ARGUMENTS is empty, ask the user:
- "Quel est l'ID de l'epic parent ?" (suggest running `/workflow-status` if they don't know)
- "Quel est le titre de la story ?"
- "Quelle est la description (ce que l'utilisateur veut accomplir) ?"

Do NOT proceed until the user provides all three. Do NOT call any tool yet.

---

## Step 1 — Preview

Call `workflow_story_preview` with the epic_id, story_title, and story_description provided by the user.

Once the tool returns, tell the user:
- The preview file is at `ai-artifacts/.previews/story-[epicId]-[slug]/story.md`
- They can open, read, and edit the file freely (user story, AC, tasks, dev notes)

Then STOP and ask: "As-tu revu le fichier ? Veux-tu modifier quelque chose avant de sauvegarder ?"

Do NOT call `workflow_story_save` until the user explicitly confirms they are ready.

---

## Step 2 — Save

Only after explicit user confirmation: call `workflow_story_save` with the same arguments.

Confirm the story ID, file path, and that sprint-status.yaml was updated.
