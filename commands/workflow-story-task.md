---
description: Implement a single task from a story — safer than workflow-story-dev, run one task at a time
---

If $ARGUMENTS is empty, ask the user:
- "Quel est l'ID de la story ?" (e.g. "1.2")
- "Quel numéro de tâche veux-tu implémenter ? (laisser vide pour la prochaine tâche non cochée)"

Suggest running `/workflow-story-tasks` first if the user doesn't know which task to pick.

Do NOT call any tool yet until the user provides the story ID.

---

Call `workflow_story_task` with the story_id and optionally task_index provided by the user.

Inform the user that:
- Only this single task will be implemented in a dedicated session
- The checkbox `- [ ]` will be updated to `- [x]` in the story file once done
- They can validate the result before running the next task

When done, display the summary and suggest:
- `/workflow-story-tasks` to see remaining tasks
- `/workflow-story-task` again to implement the next one
- `/workflow-story-update` with status `review` if all tasks are done
