---
description: Create or manage an epic - PM defines scope and breaks it into features. Saves docs in .workflow/epics/
agent: pm
---

**IMPORTANT: If $ARGUMENTS is empty, you MUST stop immediately and ask the user:**
- "What is the name of the epic?"
- "What is the goal of the epic?"
Do NOT proceed or invent an epic until the user provides both.

Run the epic definition workflow for: $ARGUMENTS

## Step 1 - PM: Define the epic

Act as a senior PM using BMAD methodology. Define a high-level epic for: $ARGUMENTS

An epic groups related features that together deliver a major business value.

Include:
- Epic title and one-line description
- Business value and strategic goal
- List of features/stories that belong to this epic (high level, not detailed)
- Success metrics (how do we know the epic is done?)
- Dependencies on other epics
- Rough effort estimate (weeks/sprints)
- Priority (HIGH / MEDIUM / LOW)

Save in `.workflow/epics/[epic-name].md`.

---

**CHECKPOINT — Stop here and show the epic definition to the user.**

Ask:
1. Does the epic scope look correct?
2. Any features to add or remove?
3. Any success metrics to adjust?
4. Should we break this epic into features now?

If the user wants to break it into features: for each feature listed, suggest running `/workflow-feature [feature name] (part of epic: [epic name])`.

Wait for explicit confirmation before closing the epic workflow.

---

List all existing epics found in `.workflow/epics/` so the user has a full picture of the roadmap.
