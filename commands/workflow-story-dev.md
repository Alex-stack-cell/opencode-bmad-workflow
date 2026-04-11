---
description: Implement a story - dev agent reads the story file and implements all unchecked tasks
---

If $ARGUMENTS is empty, ask the user:
- "Quel est l'ID de la story à implémenter ?" (e.g. "1.1")

Suggest running `/workflow-status` if the user doesn't know the story ID.

Do NOT call any tool yet until the user provides the story ID.

---

Call `workflow_story_dev` with the story_id provided by the user.

The dev agent will:
1. Read the story file (tasks, AC, dev notes)
2. Implement all unchecked tasks directly in the project
3. Mark completed tasks as [x] in the story file
4. Update the Dev Agent Record section

When done, display the implementation summary and suggest:
- `/workflow-story-update` with status `review` if all tasks are done
- `/workflow-review` to run an automated code review
