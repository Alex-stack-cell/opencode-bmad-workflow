# opencode-bmad-workflow

A [BMAD](https://github.com/bmad-dev/bmad-method) workflow plugin for [opencode](https://opencode.ai) that automates product and engineering workflows using specialized AI agents.

## What it does

Brings structured BMAD methodology into opencode through 5 automated workflows:

| Workflow | Agent chain | Output |
|----------|-------------|--------|
| `workflow_epics` | Analyst reads epics | Roadmap overview |
| `workflow_epic` | PM → PM (features) | Epic definition + feature list |
| `workflow_feature` | PM → Architect → PM | PRD + Architecture + Task breakdown |
| `workflow_sprint` | PM → PM (stories) | Sprint plan + User stories |
| `workflow_review` | Analyst → Reviewer | Analysis + Review report |

All generated docs are saved in `ai-artifacts/` at your project root.

Two modes are available:
- **Plugin tools** (`workflow_*`) — fully automated, no interruptions
- **Slash commands** (`/workflow-*`) — semi-interactive, agents may ask for clarification

> **Note on local models:** Local models like `qwen3-coder:30b` tend to skip checkpoints and generate directly. Always pass arguments explicitly to avoid hallucinations (see Usage below).

## Requirements

- [opencode](https://opencode.ai) 1.4.x or later
- [Bun](https://bun.sh) or Node.js (for dependency installation)
- Local models via [Ollama](https://ollama.ai) or any supported provider

### Recommended models

| Agent | Default model | Role |
|-------|--------------|------|
| `pm` | `qwen3-coder:30b` | PRD, user stories, sprint planning |
| `architect` | `gemma4:e4b` | System design, architecture |
| `analyst` | `gemma4:e4b` | Code analysis, investigation |
| `reviewer` | `qwen3-coder:30b` | Code review reports |
| `frontend` | `qwen3-coder:30b` | Frontend implementation |

Any capable model works — adjust `model:` in each agent file to match what you have available.

> **Important:** The model assigned to each agent must support tool calling. Models like `deepseek-r1` do not support tools and will fail in workflow sub-sessions.

## Installation

1. Copy the files into your opencode config directory (`~/.config/opencode/` on macOS/Linux):

```
agents/     → ~/.config/opencode/agents/
commands/   → ~/.config/opencode/commands/
plugins/    → ~/.config/opencode/plugins/
```

2. Install dependencies:

```bash
cd ~/.config/opencode
bun install
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
workflow_epics      → see your roadmap
workflow_epic       → define a new epic
workflow_feature    → implement a feature
workflow_sprint     → plan a sprint
workflow_review     → review code before merging
```

### Always pass arguments explicitly

To avoid hallucinations with local models, always provide arguments directly:

```
/workflow-epic WCAG Compliance - Ensure tabs and multi form steps are WCAG compliant
/workflow-feature Tab accessibility - Fix keyboard navigation and ARIA attributes
/workflow-sprint WCAG compliance sprint - Fix tabs and multi form steps, 2 weeks
/workflow-review src/components/tabs
```

Without arguments, local models may invent content instead of asking the user.

## Adapting agents to other providers

Each agent file in `agents/` has a `model:` field. Replace with any model supported by your opencode provider:

```yaml
model: anthropic/claude-sonnet-4-5   # Anthropic
model: openai/gpt-4o                  # OpenAI
model: google/gemini-2.5-flash        # Google
model: ollama/qwen3-coder:30b         # Ollama (default)
```

> **Important:** `deepseek-r1` does not support tool calling and will fail in workflows.

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
  workflow-feature.md # Interactive feature workflow
  workflow-sprint.md  # Interactive sprint planning
  workflow-review.md  # Interactive code review

plugins/
  index.ts            # Plugin entry point — registers all tools
  utils/
    types.ts          # Shared contracts: WorkflowCtx, WorkflowRunCtx
    session.ts        # Session resolution, withSession(), runAgentSession()
    files.ts          # writeDoc(), timestamp(), formatDoc()
  workflows/
    epic.ts           # Epic workflows (overview + create)
    feature.ts        # Feature workflow
    sprint.ts         # Sprint planning workflow
    review.ts         # Code review workflow
```

### Architecture

Each workflow file owns its full slice:
- **`meta`** — name, chain description, generated files (used by `workflow_init`)
- **`createXTool(ctx)`** — tool factory, colocated with its description and args schema
- **`runXWorkflow(runCtx)`** — private implementation, typed via `WorkflowRunCtx`

`index.ts` is a pure aggregator — adding a workflow means adding one file and one line in `index.ts`.

Key utilities:
- **`WorkflowCtx`** — `{ client, directory }` provided by OpenCode to each tool
- **`WorkflowRunCtx`** — `WorkflowCtx & { sessionId }` — resolved context passed to workflow functions
- **`withSession(ctx, fn)`** — resolves the sessionId then calls `fn(runCtx)`, eliminating boilerplate across all tools
- **`runAgentSession(runCtx, agent, prompt)`** — creates a child session, sends the prompt, waits for idle, returns the last assistant text

## License

MIT
