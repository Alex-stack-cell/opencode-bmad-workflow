# opencode-bmad-workflow

A [BMAD](https://github.com/bmad-dev/bmad-method) workflow plugin for [opencode](https://opencode.ai) that automates product and engineering workflows using specialized AI agents.

## What it does

Brings structured BMAD methodology into opencode through 5 automated workflows:

| Workflow | Chain | Output |
|----------|-------|--------|
| `workflow_epics` | Analyst reads epics | Roadmap overview |
| `workflow_epic` | PM → PM (features) | Epic definition + feature list |
| `workflow_feature` | PM → Architect → PM | PRD + Architecture + Task breakdown |
| `workflow_sprint` | PM → PM (stories) | Sprint plan + User stories |
| `workflow_review` | Analyst → Reviewer | Analysis + Review report |

All generated docs are saved in `.workflow/` at your project root.

Two modes are available:
- **Plugin tools** (`workflow_*`) — fully automated, no interruptions
- **Slash commands** (`/workflow-*`) — interactive, with checkpoints for validation at each step

## Requirements

- [opencode](https://opencode.ai) 1.4.x or later
- Local models via [Ollama](https://ollama.ai) (or adapt agents to any provider)

### Recommended models

| Agent | Default model | Role |
|-------|--------------|------|
| pm | `qwen3-coder:30b` | PRD, user stories, sprint planning |
| architect | `gemma4:e4b` | System design, architecture |
| analyst | `gemma4:e4b` | Code analysis, investigation |
| reviewer | `qwen3-coder:30b` | Code review reports |
| frontend | `qwen3-coder:30b` | Frontend implementation |

Any capable model works — adjust `model:` in each agent file to match what you have available.

> **Important:** The model assigned to each agent must support tool calling. Models like `deepseek-r1` do not support tools and will fail when used in workflow sub-sessions.

## Installation

1. Copy the files into your opencode config directory (`~/.config/opencode/` on macOS/Linux):

```
agents/          → ~/.config/opencode/agents/
commands/        → ~/.config/opencode/commands/
plugin/          → ~/.config/opencode/plugin/
plugins/         → ~/.config/opencode/plugins/
```

2. Install dependencies:

```bash
cd ~/.config/opencode
npm install
# or: bun install
```

3. Register the plugin in your `opencode.json`:

```json
{
  "plugin": ["./plugins"]
}
```

4. Restart opencode.

## Usage

### Start here

```
workflow_init
```

Shows all available workflows and recommends where to start.

### Recommended flow

```
workflow_epics          → see your roadmap
workflow_epic           → define a new epic
workflow_feature        → implement a feature (references epic)
workflow_sprint         → plan a sprint
workflow_review         → review your code before merging
```

### Interactive mode (slash commands)

The slash command versions pause at each step for your review:

```
/workflow-init
/workflow-epics
/workflow-epic User Authentication
/workflow-feature Login page (part of epic: User Authentication)
/workflow-sprint Implement authentication — week 1
/workflow-review src/auth
```

## Adapting agents to other providers

Each agent file in `agents/` has a `model:` field. Replace with any model supported by your opencode provider:

```yaml
# agents/pm.md
model: anthropic/claude-sonnet-4-5   # Anthropic
model: openai/gpt-4o                  # OpenAI
model: ollama/deepseek-r1:32b         # Ollama (default)
```

## Project structure

```
agents/
  analyst.md          # Code analysis agent
  architect.md        # Architecture design agent
  frontend.md         # Frontend implementation agent
  pm.md               # Product manager agent
  reviewer.md         # Code review agent
  python.md           # Python implementation agent
  php-laravel.md      # PHP/Laravel implementation agent

commands/
  workflow-init.md    # Interactive entry point
  workflow-epics.md   # Interactive roadmap overview
  workflow-epic.md    # Interactive epic workflow
  workflow-feature.md # Interactive feature workflow (with checkpoints)
  workflow-sprint.md  # Interactive sprint planning (with checkpoints)
  workflow-review.md  # Interactive code review (with checkpoints)

plugin/
  workflows/
    epic.ts           # Epic workflow logic
    feature.ts        # Feature workflow logic
    review.ts         # Review workflow logic
    sprint.ts         # Sprint workflow logic
  utils/
    session.ts        # Agent session runner
    files.ts          # Doc writer utility

plugins/
  workflow.ts         # Plugin entry point (registers all tools)
```

## License

MIT
