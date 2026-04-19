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

### Running on local models (Qwen, DeepSeek-Coder, Llama, …)

Small-context local models often loop infinitely on dev tasks: they exhaust their context window reading files and trigger a session compaction that erases their tool-call state. Enable **local-mode** to prevent this:

```
/workflow-setup local_model=true
```

What it does:

- **Shrinks the story** before prompting — keeps only the targeted task, the ACs relevant to it, and the Dev Notes paragraphs sharing keywords with the task. Other tasks, unrelated ACs, and the Dev Agent Record (except on the last task) are dropped.
- **Shrinks conventions** to ~500 tokens (first paragraph of each section).
- **Disables file-read tools** (`read`, `glob`, `grep`, `webfetch`) in dev sessions — the agent must work from the context inlined in the prompt.
- **Gates the prompt size** at 60% of `context_budget` (default 32000). If the prompt is too large even after aggressive shrinking, the workflow aborts with an actionable message instead of letting the model loop.

Tune per model:

```
/workflow-setup local_model=true context_budget=32000 shrink_mode=balanced
```

- `context_budget`: your model's usable context window in tokens (Qwen2.5-Coder-14B at 32k, Qwen2.5-Coder-32B at 128k…).
- `shrink_mode`: `aggressive` | `balanced` (default) | `conservative`. Aggressive prunes more ACs and Dev Notes paragraphs.

Frontier models (Claude, GPT, Gemini) should leave `local_model` off — the default preserves the previous behavior exactly.

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
    agent.ts                  # runAgentSession, runDevAgentSession, FILE_TOOLS_DISABLED
    prompts.ts                # buildDevTaskPrompt, buildQuickTaskPrompt — mode-aware (local|frontier)
    polling.ts                # waitForIdle
  storage/
    config.ts                 # loadConfig, saveConfig (accepts Partial<WorkflowConfig>)
    docs.ts                   # readDoc, writeDoc
    sprint.ts                 # readSprintStatus, writeSprintStatus
    stories.ts                # findStoryFile, readStoryFile, writeStoryFile
    progress.ts               # writeProgressFile, clearProgressFile
  parsers/                    # pure functions only, zero I/O, fully unit-tested
    slugify.ts                # slugify
    sections.ts               # splitSectionsByH2, findSection, renderSection
    tokens.ts                 # estimateTokens, checkPromptBudget
    shrink.ts                 # shrinkStoryForTask, shrinkConventions (local-mode)
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
- **DRY** — `slugify`, `readDoc`, `withSession`, `buildDevTaskPrompt` are defined once, used everywhere.
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

### v0.4.1
- **Fix:** `commands/workflow-setup.md` updated to document the new `local_model`, `context_budget`, and `shrink_mode` args and to pass through inline arguments without asking interactive questions. Without this fix, local models saw only the language prompt and ignored the other args in the user's command.

### v0.4.0
- **New:** Local-model mode (`local_model: true`) — shrinks stories and conventions before prompting, disables file-read tools in dev sessions, and enforces a soft prompt-size cap. Eliminates the infinite-loop failure mode where small-context models exhaust their window reading files and trigger compaction. Configure via `/workflow-setup` or edit `ai-artifacts/.workflow-config.json` directly (`localModel`, `contextBudget`, `shrinkMode`).
- **New:** `plugins/parsers/shrink.ts` — pure `shrinkStoryForTask` and `shrinkConventions`, deterministic heuristics, 15 unit tests.
- **New:** `plugins/parsers/tokens.ts` — dependency-free token estimator and budget gate, 9 unit tests.
- **New:** `plugins/parsers/sections.ts` — reusable Markdown H2 section splitter, 7 unit tests.
- **New:** `plugins/session/prompts.ts` exports `buildDevTaskPrompt` and `buildQuickTaskPrompt` with explicit `local` vs `frontier` modes. Shared by `workflow_story_task`, `workflow_story_dev`, and `workflow_task` (DRY).
- **New:** `buildDevPlan` in `tools/story-task.ts` — shared shrink → render → budget → aggressive-retry pipeline reused by `workflow_story_dev`.
- **Change:** `saveConfig` accepts `Partial<WorkflowConfig>` and merges with the existing config on disk — existing config files pick up the new fields (`localModel`, `contextBudget`, `shrinkMode`) with safe defaults.
- **Change:** `/workflow-setup` now accepts optional `local_model`, `context_budget`, `shrink_mode` args; calling it with no args prints the current config.
- **Change:** `runAgentSession` and `runDevAgentSession` accept an optional `{ disableFileTools }` flag. Used automatically when `localModel` is true.
- **Fix:** `meta/index.ts` now exports `allMeta` (referenced by `tools/setup.ts`, which is now wired into `index.ts`).
- **Chore:** `bun test plugins/parsers` runs the pure-function test suite; wired into `prepublishOnly`.

### v0.3.6
- **Fix:** `workflow-story-task` and `workflow-story-tasks` commands now call their tool immediately when arguments are provided — fixes local models (Devstral Small) displaying the command file instead of executing.

### v0.3.5
- **Fix:** Dev agent now performs mandatory codebase discovery before writing code — reads existing models, enums, services, and jobs referenced in the task before implementing. Prevents hallucinated constants, wrong type comparisons, and unused imports.
- **Refactor:** `session/prompts.ts` — `buildDevTaskPrompt` extracted as a shared builder used by both `workflow_story_task` and `workflow_story_dev`. Single source of truth for dev task prompts.

### v0.3.4

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
