---
description: Automated feature workflow - PM writes PRD, Architect designs architecture, PM creates tasks. Saves docs in .workflow/
agent: pm
---

Run the feature creation workflow in 3 steps for: $ARGUMENTS

## Step 1 - PM: Write the PRD

Act as a senior PM using BMAD methodology. Write a complete PRD for: $ARGUMENTS

Check if a parent epic exists in `.workflow/epics/` that this feature belongs to — if so, reference it.

Include:
- Overview and goals
- Parent epic (if applicable)
- User stories (As a / I want / So that)
- Acceptance criteria (Given/When/Then)
- Out of scope
- Technical notes

Save in `.workflow/[feature-name]/PRD.md`.

---

**CHECKPOINT — Stop here and show the PRD to the user.**

Ask:
1. Does the PRD correctly capture the feature?
2. Any user stories to add, remove, or adjust?
3. Any acceptance criteria to refine?

Wait for explicit confirmation before proceeding to Step 2.

---

## Step 2 - Architect: Design the architecture

Only run after PRD is validated.

Act as a senior software architect. Design the technical architecture based on the validated PRD.

Include:
- Component overview
- Data flow
- Key technical decisions and tradeoffs
- File/module structure
- Risks and mitigations

Save in `.workflow/[feature-name]/ARCHITECTURE.md`.

---

**CHECKPOINT — Stop here and show the architecture to the user.**

Ask:
1. Does the architecture look correct?
2. Any technical concerns or alternative approaches to consider?

Wait for explicit confirmation before proceeding to Step 3.

---

## Step 3 - PM: Task breakdown

Only run after architecture is validated.

Act as a PM. Break the feature into concrete development tasks.

For each task:
- Title
- Description (2-3 lines)
- Effort estimate (S/M/L)
- Dependencies
- Best suited agent (frontend/architect/reviewer/analyst)
- Parent epic reference if applicable

Save in `.workflow/[feature-name]/TASKS.md`.

---

Confirm the 3 generated files and suggest which agent to use to start implementation.
