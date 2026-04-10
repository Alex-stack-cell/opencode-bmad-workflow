# opencode-bmad-workflow

A [BMAD](https://github.com/bmad-dev/bmad-method) workflow plugin for [opencode](https://opencode.ai) that automates product and engineering workflows using specialized AI agents.

## What it does

Brings structured BMAD methodology into opencode through 5 automated workflows:

| Workflow | Agent chain | Artifacts | Living docs |
|----------|-------------|-----------|-------------|
| `workflow_epics` | Analyst | _(read-only)_ | — |
| `workflow_epic` | PM | `ai-artifacts/epics/[epic].md` | `docs/OVERVIEW.md` |
| `workflow_feature` | PM → Architect → PM | `ai-artifacts/[feature]/` | `docs/ARCHITECTURE.md`, `docs/features/[feature].md` |
| `workflow_sprint` | PM → PM | `ai-artifacts/sprint-[date]/` | — |
| `workflow_review` | Analyst → Reviewer | `ai-artifacts/review-[date]/` | — |

Two output types:
- **`ai-artifacts/`** — workflow artifacts (temporary, can be gitignored)
- **`docs/`** — living project documentation, updated automatically, meant to be versioned with the code

Two invocation modes:
- **Plugin tools** (`workflow_*`) — fully automated, no interruptions
- **Slash commands** (`/workflow-*`) — semi-interactive, agents may ask for clarification

> **Note on local models:** Local models tend to skip checkpoints and generate directly. Always pass arguments explicitly to avoid hallucinations (see Usage below).

## Requirements

- [opencode](https://opencode.ai) 1.4.x or later
- [Bun](https://bun.sh) or Node.js (for dependency installation)
- Any model provider supported by opencode (Ollama, Anthropic, OpenAI, Google…)

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
workflow_epic       → define a new epic (updates docs/OVERVIEW.md)
workflow_feature    → implement a feature (updates docs/ARCHITECTURE.md + docs/features/)
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

## Configuring models

Agents do not ship with a hardcoded model — they use the default model configured in your `opencode.json`. To assign a specific model per agent, add a `model:` field in the agent's frontmatter:

```yaml
---
description: ...
mode: subagent
model: anthropic/claude-sonnet-4-5   # Anthropic
# model: openai/gpt-4o               # OpenAI
# model: google/gemini-2.5-flash     # Google
# model: ollama/qwen3-coder:30b      # Ollama
---
```

This keeps the plugin model-agnostic by default while allowing per-agent overrides.

## Project structure

```
agents/
  analyst.md          # Code analysis agent (read-only)
  architect.md        # Architecture design agent (read-only)
  frontend.md         # Frontend implementation agent
  pm.md               # Product manager agent (read-only)
  reviewer.md         # Code review agent (read-only)
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
    files.ts          # writeDoc(), readDoc(), timestamp(), formatDoc()
  workflows/
    epic.ts           # Epic workflows (overview + create)
    feature.ts        # Feature workflow
    sprint.ts         # Sprint planning workflow
    review.ts         # Code review workflow
```

### Architecture

Each workflow file owns its full slice:
- **`meta`** — name, chain description, generated files (drives `workflow_init` output automatically)
- **`createXTool(ctx)`** — tool factory, description and args schema colocated with the implementation
- **`runXWorkflow(runCtx)`** — private implementation, typed via `WorkflowRunCtx`

`index.ts` is a pure aggregator — adding a workflow = one new file + one line in `index.ts`.

Key utilities:
- **`WorkflowCtx`** — `{ client, directory }` provided by OpenCode to each tool
- **`WorkflowRunCtx`** — `WorkflowCtx & { sessionId }` — resolved context passed to internal functions
- **`withSession(ctx, fn)`** — resolves the sessionId then calls `fn(runCtx)`, eliminating boilerplate across all tools
- **`runAgentSession(runCtx, agent, prompt)`** — creates a child session, disables workflow tools to prevent recursion, waits for idle, returns the last assistant text
- **`readDoc(dir, path)`** — reads an existing doc or returns `""` — used for upsert patterns in living docs

## License

MIT
