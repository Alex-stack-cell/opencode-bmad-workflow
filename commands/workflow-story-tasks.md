---
description: List all tasks in a story with their index and status (✅ done / ⬜ pending)
---

If $ARGUMENTS is empty, ask the user:
- "Quel est l'ID de la story ?" (e.g. "1.2")

Suggest running `/workflow-status` if the user doesn't know the story ID.

Do NOT call any tool yet until the user provides the story ID.

---

Call `workflow_story_tasks` with the story_id provided by the user.

Display the task list with indices and statuses.

Suggest next steps:
- Run `/workflow-story-task` to implement the next pending task
- Pass a `task_index` to `/workflow-story-task` to pick a specific task
