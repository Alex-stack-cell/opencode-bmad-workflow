---
description: Quick task — implement a single fix or small feature directly, without epic/story ceremony
---

If $ARGUMENTS is empty, ask the user:
- "Décris la tâche à implémenter (ex: 'Corriger le padding du bouton dans src/components/Button.scss')"

Do NOT call any tool yet until the user provides the description.

---

Call `workflow_task` with the description provided by the user.

The tool will:
1. Evaluate complexity — if too complex, suggest `/workflow-story` instead
2. Gather context from the codebase
3. Implement directly without creating an epic or story
4. Log the task to `ai-artifacts/quick-tasks-log.yaml`

When done, display the summary and suggest:
- `/workflow-review` to run a code review if needed
- `/workflow-story` if the task turned out larger than expected
