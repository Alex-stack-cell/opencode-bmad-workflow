# opencode-bmad-workflow

A [BMAD](https://github.com/bmad-code-org/BMAD-METHOD) workflow plugin for [opencode](https://opencode.ai) that brings structured product and engineering workflows into your AI coding sessions.

## What it does

Automates the full BMAD development cycle through slash commands and tool calls:

```
/workflow-conventions   → generate project conventions (injected into all dev prompts)
/workflow-epic          → define epics (scope, goal, priority)
/workflow-story         → create BMAD stories (user story + AC + tasks + dev notes)
/workflow-story-tasks   → list all tasks in a story with index and status
/workflow-story-task    → implement one task at a time (safer, interruptible)
/workflow-story-dev     → implement all story tasks in one shot (legacy)
/workflow-story-update  → advance story status (ready-for-dev → in-progress → review → done)
/workflow-sprint        → plan a sprint from your ready-for-dev backlog
/workflow-review        → adversarial code review before merging
/workflow-status        → see all epics and stories at a glance
```

### Story lifecycle

```
ready-for-dev → in-progress → review → done
                                     ↘ superseded / deferred
```

All tracked in a central `ai-artifacts/sprint-status.yaml` that evolves automatically throughout the project.

### Project conventions

Run `/workflow-conventions` once per project to generate `ai-artifacts/conventions.md`. The architect agent analyzes the codebase and extracts naming rules, patterns, architecture decisions, and testing conventions.

This file is automatically injected into the prompt of every implementation workflow (`workflow_story_task`, `workflow_story_dev`, `workflow_task`). Edit it freely — re-run at any time to refresh it from the codebase.

### Output structure

```
ai-artifacts/
  sprint-status.yaml                          ← central tracking file (living)
  conventions.md                              ← project conventions (injected into dev prompts)
  planning-artifacts/
    epic-1-[slug].md                          ← epic definition
    sprint-[slug].md                          ← sprint plan
    review-[slug]/ANALYSIS.md, REVIEW.md      ← code review
  implementation-artifacts/
    stories/1-1-[slug].md                     ← BMAD story (status + AC + tasks + dev notes)

docs/
  OVERVIEW.md                                 ← project overview (auto-created once)
  ROADMAP.md                                  ← epic roadmap (auto-updated)
```

### Preview / save pattern

Every workflow that generates documents uses a two-step pattern:

1. `_preview` — generates files into `ai-artifacts/.previews/` for you to read and edit freely
2. `_save` — reads your (possibly edited) preview and writes to final locations

This means you always review and can modify AI output before anything is committed.

---

## Requirements

- [opencode](https://opencode.ai) 1.4.x or later
- [Bun](https://bun.sh) (recommended) or Node.js
- Any model supported by opencode (Anthropic, OpenAI, Google, Ollama…)

> **Model requirement:** Agents run in child sessions and require a model that supports tool calling. Models like `deepseek-r1` do not support tools and will fail silently.

---

## Installation

### 1. Run the installer

```bash
npx opencode-bmad-workflow
```

> **Why `npx` and not `npm i`?**
> OpenCode resolves plugins from its own package cache (`~/.cache/opencode/packages/`), not from `node_modules`. Using `npx` runs the installer script which copies the required files into `~/.config/opencode/` and patches `opencode.json`. After that, opencode loads the plugin automatically on startup.

The installer:
- Copies `agents/`, `commands/`, `plugins/` to `~/.config/opencode/`
- Installs dependencies
- Patches `opencode.json` to register the plugin
- Warns about any missing agent files

Already installed? Run with `--force` to reinstall:

```bash
npx opencode-bmad-workflow --force
```

To install into a custom opencode config directory:

```bash
OPENCODE_CONFIG_DIR=/path/to/your/opencode/config npx opencode-bmad-workflow
```

### 2. Restart opencode

---

## Usage

### Recommended cycle

Follow this order to avoid hallucinations and respect the BMAD workflow:

```
1. /workflow-setup         → set language (fr, en, es…)                    [once per project]
   /workflow-conventions  → generate ai-artifacts/conventions.md           [once per project, edit freely]
2. /workflow-epic          → define your first epic
3. /workflow-story         → create stories for that epic (repeat)
4. /workflow-status        → verify stories are ready-for-dev
5. /workflow-sprint        → plan your sprint
6. /workflow-story-tasks   → list tasks in a story with index and status
   /workflow-story-task    → implement one task at a time (recommended)
   /workflow-story-dev     → implement all tasks in one shot (legacy, less control)
7. /workflow-story-update  → mark as review, then done
8. /workflow-review        → run code review before closing
```

> `/workflow-sprint` will warn you if no `ready-for-dev` stories exist yet.

### Start here

```
/workflow-init
```

Lists all available workflows with their agent chains and output paths.

### Passing arguments directly

To avoid hallucinations with local models, pass arguments inline:

```
/workflow-epic Design System — Build a reusable component library
/workflow-story Button component — As a developer, I want a Button component with variants
/workflow-sprint Sprint 1 — Ship the Button and Input components, 1 week
/workflow-review src/components/Button
```

Without arguments, the slash command will ask interactively.

---

## Configuring models

Agents inherit the default model from `opencode.json`. To assign a model per agent, add a `model:` field in the agent's frontmatter:

```yaml
---
description: Product manager agent
mode: subagent
model: anthropic/claude-sonnet-4-6
# model: openai/gpt-4o
# model: google/gemini-2.5-flash
# model: ollama/qwen3-coder:30b
---
```

---

## Project structure

```
agents/
  analyst.md          # Read-only analysis
  architect.md        # Architecture and tasks
  dev.md              # Implementation (has full tool access)
  pm.md               # Product manager — stories, epics, roadmap
  reviewer.md         # Adversarial code review

commands/
  workflow-conventions.md
  workflow-init.md
  workflow-setup.md
  workflow-status.md
  workflow-epic.md
  workflow-story.md
  workflow-story-tasks.md
  workflow-story-task.md
  workflow-story-update.md
  workflow-story-dev.md
  workflow-sprint.md
  workflow-review.md
  workflow-task.md

plugins/
  index.ts                    # Declarative tool registry + plugin entry point
  agents/
    roles.ts                  # AgentRole constants (PM, ARCHITECT, DEV, ANALYST, REVIEWER)
  constants/
    paths.ts                  # All artifact/doc paths in one place (static + dynamic)
  workflows/
    preview-save.ts           # loadPreview, saveFiles, cleanPreview — shared preview/save utilities
  types/
    workflow.ts               # PluginCtx, WorkflowCtx, WorkflowRunCtx, WorkflowConfig, ToolFactory
    task.ts                   # Task
    story.ts                  # StoryStatus
  meta/
    index.ts                  # Tool descriptors (name, summary, chain, generates) + allMeta
  session/
    context.ts                # getCurrentSessionId, withSession
    agent.ts                  # runAgentSession, runDevAgentSession
    polling.ts                # waitForIdle
  storage/
    config.ts                 # Per-project language config
    docs.ts                   # readDoc, writeDoc
    sprint.ts                 # readSprintStatus, writeSprintStatus
    stories.ts                # findStoryFile, readStoryFile, writeStoryFile
    progress.ts               # writeProgressFile, clearProgressFile
    quick-tasks.ts            # readQuickTasksLog, appendQuickTask, generateTaskId
  parsers/
    slugify.ts                # slugify
    sprint.ts                 # patchStoryStatusInYaml, computeNextStoryNum, appendStoryToYaml, …
    stories.ts                # patchStoryFileStatus
    tasks.ts                  # parseTopLevelTasks, allTasksDone, markTaskDone, …
  tools/
    setup.ts                  # workflow_init, workflow_setup
    status.ts                 # workflow_status
    epic.ts                   # workflow_epic_preview/save
    story.ts                  # workflow_story_preview/save
    story-update.ts           # workflow_story_update (pure IO, no LLM)
    story-dev.ts              # workflow_story_dev (all tasks in one shot)
    story-task.ts             # workflow_story_tasks (list) + workflow_story_task (one at a time)
    sprint.ts                 # workflow_sprint_preview/save
    review.ts                 # workflow_review_preview/save
    task.ts                   # workflow_task (quick fix)
    conventions.ts            # workflow_conventions
```

### Architecture principles

- **Layered** — `session/` owns OpenCode API calls, `storage/` owns file I/O, `parsers/` owns pure transformations, `tools/` owns orchestration. No layer reaches into another's responsibility.
- **Single source of truth** — all artifact paths live in `constants/paths.ts`; all agent role names live in `agents/roles.ts`. No magic strings scattered across the codebase.
- **Shared preview/save pattern** — `workflows/preview-save.ts` centralizes the load-from-preview-or-generate logic used by all document-generating tools (epic, story, sprint, review).
- **DRY** — `slugify`, `readDoc`, `withSession` are defined once, used everywhere.
- **KISS** — YAML manipulation is delegated to the LLM (no YAML parser dependency). ID extraction uses a JSON envelope `{id, yaml}` for reliability with a graceful fallback.
- **Preview/save** — no file is written to its final location without the user reviewing it first.
- **Deterministic checkboxes** — task checkboxes `[x]` are marked programmatically after each dev session, never delegated to the agent.

Two agent execution modes:
- **`runAgentSession`** — direct text output only, no tools. Used for PM/architect/analyst agents generating documents.
- **`runDevAgentSession`** — full tool access. Used by `workflow_story_dev` and `workflow_story_task` so the dev agent can read and write project files.

### workflow_story_task vs workflow_story_dev

`workflow_story_task` is the recommended way to implement stories. It runs one task per invocation — you validate the result before continuing. `workflow_story_dev` runs all tasks in sequence in child sessions, which is harder to interrupt and less transparent.

---

## Changelog

### v0.3.2
- **Refactor:** `constants/paths.ts` — all artifact and doc paths centralized, no more scattered hardcoded strings.
- **Refactor:** `agents/roles.ts` — agent role names (`pm`, `architect`, `dev`, `analyst`, `reviewer`) are now typed constants, no magic strings in tool code.
- **Refactor:** `workflows/preview-save.ts` — `loadPreview`, `saveFiles`, `cleanPreview` extracted from the four document-generating tools (epic, story, sprint, review) into a shared module.
- **Refactor:** `storage/quick-tasks.ts` — quick task log I/O extracted from `tools/task.ts`.
- **Refactor:** `tools/setup.ts` — `workflow_init` and `workflow_setup` extracted from `index.ts`; `index.ts` is now a pure declarative tool registry.
- **Refactor:** `tools/status.ts` — `workflow_status` extracted from `tools/epic.ts`.
- **Fix:** Output strings in `workflow_task` were hardcoded in French — now in English, consistent with all other tools.
- **Fix:** `workflow_init` tool description now instructs the model to return output verbatim, preventing local models from hallucinating non-existent commands.
- **Types:** All internal workflow argument types renamed to `*WorkflowArgs` for consistency.

### v0.3.1
- **Fix:** Robust task/subtask checkbox marking and auto-advance story + epic status.

### v0.3.0
- **New:** `workflow_conventions` — generates `ai-artifacts/conventions.md` by analyzing the codebase. Injected automatically into all implementation prompts.
- **Fix:** Task checkboxes `[ ]` are now marked `[x]` programmatically after each dev session (previously relied on the agent, which was unreliable). Subtasks are also checked.
- **Refactor:** Plugin internals restructured into `session/`, `storage/`, `parsers/`, `tools/`, and `meta/` layers for maintainability.

### v0.2.0
- Added `workflow_story_task` and `workflow_story_tasks` for task-by-task implementation.

### v0.1.0
- Initial release.

---

## License

MIT
