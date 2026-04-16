import { tool } from "@opencode-ai/plugin"
import type { WorkflowCtx, WorkflowRunCtx } from "../types/workflow.ts"
import { withSession } from "../session/context.ts"
import { runAgentSession } from "../session/agent.ts"
import { readDoc, writeDoc } from "../storage/docs.ts"

const CONVENTIONS_PATH = "ai-artifacts/conventions.md"

// ─── Tool factory ─────────────────────────────────────────────────────────────

export function createConventionsTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Generate or regenerate ai-artifacts/conventions.md by analyzing the codebase. The file is then automatically injected into all implementation workflows (workflow_story_task, workflow_story_dev, workflow_task). Edit the file manually at any time to refine the conventions.",
    args: {},
    execute: () => withSession(ctx, runConventions),
  })
}

// ─── Workflow implementation ──────────────────────────────────────────────────

async function runConventions(runCtx: WorkflowRunCtx): Promise<string> {
  const { directory } = runCtx

  const existing = await readDoc(directory, CONVENTIONS_PATH)

  const conventions = await runAgentSession(runCtx, "architect", `
Analyze this codebase and extract the development conventions the team follows.

${existing ? `An existing conventions file is present — update and improve it rather than starting from scratch:\n\n${existing}\n\n---\n` : ""}

Produce a concise, actionable \`conventions.md\` file covering:

## Naming
- File, variable, function, class naming rules (e.g. kebab-case files, PascalCase components)

## Code style
- Patterns the team uses consistently (immutability, error handling, async patterns)
- What to avoid (anti-patterns visible in the codebase)

## Architecture
- How the codebase is structured (feature folders, layers, etc.)
- Where new files should go

## Testing
- Test framework and conventions
- What must be tested and how

## Framework-specific rules
- Any framework or library conventions enforced in this project

Keep each rule short and concrete. Skip sections that are not applicable.
Do NOT invent rules that are not observable in the codebase.
`.trim())

  const path = await writeDoc(directory, CONVENTIONS_PATH, conventions)

  return [
    `# Workflow: Conventions generated`,
    ``,
    `   ✓ Written → ${path}`,
    ``,
    `Open \`${CONVENTIONS_PATH}\` and edit freely — add, remove, or refine any rule.`,
    `This file will be automatically injected into all implementation workflows.`,
    ``,
    `Re-run \`workflow_conventions\` at any time to refresh from the codebase.`,
  ].join("\n")
}
