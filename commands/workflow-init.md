---
description: Show available automated BMAD workflows and choose one to run
---

Call `workflow_init` to show available workflows and current config.

Then ask the user which workflow they want to run.

## Available commands

### /workflow-setup [language]
Configure the language for generated documents (fr, en, es...).
Run this first on a new project.

### /workflow-epics
Show all epics and roadmap overview.
Use this to get the big picture before starting.

### /workflow-epic [epic name and goal]
Create a new epic. Generates a preview to review before saving.
Chain: PM defines scope → user reviews → saves to ai-artifacts/epics/.

### /workflow-feature [feature name and description]
Full feature workflow. Generates a preview to review before saving.
Chain: PM (PRD) → Architect (architecture) → PM (tasks) → user reviews → saves.

### /workflow-sprint [sprint goal]
Sprint planning. Generates a preview to review before saving.
Chain: PM (sprint plan + stories) → user reviews → saves.

### /workflow-review [optional file path]
Code review. Generates a preview to annotate before saving.
Chain: Analyst (analysis) → Reviewer (report) → user reviews → saves.

---

Each workflow has two steps: `_preview` writes files for you to review and edit, `_save` writes to their final locations.

Suggest starting with `/workflow-setup fr` then `/workflow-epics` if no epics exist yet.
