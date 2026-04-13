---
description: Implement a story - dev agent reads the story file and implements all unchecked tasks
---

If $ARGUMENTS is empty, ask the user:
- "Quel est l'ID de la story à implémenter ?" (e.g. "1.1")

Suggest running `/workflow-status` if the user doesn't know the story ID.

Do NOT call any tool yet until the user provides the story ID.

---

Call `workflow_story_dev` with the story_id provided by the user.

Inform the user that:
- Each task is implemented one by one in a dedicated session
- They can track progress in real time by opening `ai-artifacts/.dev-progress.md`
- Checkboxes in the story file are updated after each completed task

The dev agent will:
1. Read the story file (tasks, AC, dev notes)
2. Implement each unchecked task in its own focused session
3. Mark completed tasks as [x] in the story file after each one
4. Update the Dev Agent Record section on the final task

When done, display the implementation summary and suggest:
- `/workflow-story-update` with status `review` if all tasks are done
- `/workflow-review` to run an automated code review
