# opencode-bmad-workflow

A [BMAD](https://github.com/bmad-code-org/BMAD-METHOD) workflow plugin for [opencode](https://opencode.ai) that brings structured product and engineering workflows into your AI coding sessions.

## What it does

Automates the full BMAD development cycle through slash commands and tool calls:

```
/workflow-epic        → define epics (scope, goal, priority)
/workflow-story       → create BMAD stories (user story + AC + tasks + dev notes)
/workflow-story-dev   → dev agent implements story tasks directly in your project
/workflow-story-update → advance story status (ready-for-dev → in-progress → review → done)
/workflow-sprint      → plan a sprint from your ready-for-dev backlog
/workflow-review      → adversarial code review before merging
/workflow-status      → see all epics and stories at a glance
```

### Story lifecycle

```
ready-for-dev → in-progress → review → done
                                     ↘ superseded / deferred
```

All tracked in a central `ai-artifacts/sprint-status.yaml` that evolves automatically throughout the project.

### Output structure

```
ai-artifacts/
  sprint-status.yaml                          ← central tracking file (living)
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
1. /workflow-setup      → set language (fr, en, es…)
2. /workflow-epic       → define your first epic
3. /workflow-story      → create stories for that epic (repeat)
4. /workflow-status     → verify stories are ready-for-dev
5. /workflow-sprint     → plan your sprint
6. /workflow-story-dev  → implement a story (repeat per story)
7. /workflow-story-update → mark as review, then done
8. /workflow-review     → run code review before closing
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
  workflow-init.md
  workflow-setup.md
  workflow-status.md
  workflow-epic.md
  workflow-story.md
  workflow-story-update.md
  workflow-story-dev.md
  workflow-sprint.md
  workflow-review.md

plugins/
  index.ts                    # Registers all tools
  types/
    workflow.ts               # WorkflowCtx, WorkflowRunCtx, WorkflowConfig
  utils/
    files.ts                  # readDoc, writeDoc, slugify
    config.ts                 # Per-project language config (.workflow-config.json)
    status.ts                 # sprint-status.yaml IO + story file helpers
    session.ts                # withSession, runAgentSession, runDevAgentSession
  workflows/
    epic.ts                   # workflow_status, workflow_epic_preview/save
    story.ts                  # workflow_story_preview/save
    story-update.ts           # workflow_story_update (pure IO, no LLM)
    story-dev.ts              # workflow_story_dev (dev agent with full tool access)
    sprint.ts                 # workflow_sprint_preview/save
    review.ts                 # workflow_review_preview/save
```

### Architecture principles

- **Orthogonal** — each file owns one responsibility. `status.ts` is the single owner of `sprint-status.yaml` and story files.
- **DRY** — `slugify`, `readDoc`, `withSession` are defined once, used everywhere.
- **KISS** — YAML manipulation is delegated to the LLM (no YAML parser dependency). ID extraction uses a JSON envelope `{id, yaml}` for reliability with a graceful fallback.
- **Preview/save** — no file is written to its final location without the user reviewing it first.

Two agent execution modes:
- **`runAgentSession`** — direct text output only, no tools. Used for PM/architect/analyst agents generating documents.
- **`runDevAgentSession`** — full tool access. Used only by `workflow_story_dev` so the dev agent can read and write project files.

---

## License

MIT
