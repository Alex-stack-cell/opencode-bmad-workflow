---
description: Show available automated BMAD workflows and choose one to run
---

Show the user the available automated workflows and ask which one to launch.

## /workflow-epics
Show all epics and roadmap overview.
Use this first to get the big picture.

## /workflow-epic [epic name and goal]
Create or define a new epic and break it into features.
Chain: PM defines scope → validates with user → suggests features.

## /workflow-feature [feature name and description]
Full feature workflow with validation at each step.
Chain: PM (PRD) → validate → Architect (architecture) → validate → PM (tasks).
References parent epic if one exists in `.workflow/epics/`.

## /workflow-sprint [sprint goal]
Sprint planning with validation before story writing.
Chain: PM (sprint plan) → validate → PM (detailed stories).

## /workflow-review [optional file path]
Code review with analysis validation before report.
Chain: Analyst (analysis) → validate → Reviewer (report).

---

Ask the user which workflow they want to run, or if they prefer to continue manually.
Suggest starting with `/workflow-epics` if they haven't defined any epics yet.
