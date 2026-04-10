---
description: Show all epics and their status - roadmap overview from ai-artifacts/epics/
agent: analyst
---

## Epic Roadmap Overview

Read all epic files from `ai-artifacts/epics/` and produce a roadmap summary.

For each epic found:
- Epic name and description
- Priority
- Rough effort estimate
- Features/stories listed under it
- Status (infer from existing `ai-artifacts/` folders: DONE if folder exists, IN PROGRESS if partial, TODO if no folder)

Format as a clear table or list ordered by priority.

---

Ask the user:
1. Which epic to work on next?
2. Should we create a new epic? → suggest `/workflow-epic [epic name]`
3. Should we plan a sprint from the epic backlog? → suggest `/workflow-sprint [goal based on epic]`
