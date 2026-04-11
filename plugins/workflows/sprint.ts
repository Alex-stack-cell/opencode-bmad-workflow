import { tool } from "@opencode-ai/plugin"
import { runAgentSession, withSession } from "../utils/session.ts"
import { writeDoc, timestamp, formatDoc } from "../utils/files.ts"
import type { WorkflowCtx, WorkflowRunCtx } from "../types/workflow.ts"

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const meta = {
  name: "workflow_sprint",
  summary: "Sprint planning",
  chain: "PM (plan) → PM (stories)",
  generates: "ai-artifacts/sprint-[date]/SPRINT-PLAN.md, STORIES.md",
}

// ─── Tool factory ─────────────────────────────────────────────────────────────

export function createSprintTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Sprint planning workflow: PM creates the sprint plan → PM writes detailed user stories. Pass dry_run: true to preview generated content before writing. IMPORTANT: Never call this tool without explicit sprint_goal provided by the user.",
    args: {
      sprint_goal: tool.schema
        .string()
        .describe("Sprint goal explicitly provided by the user. Never invent this."),
      duration_weeks: tool.schema
        .number()
        .optional()
        .describe("Sprint duration in weeks (default: 2)"),
      dry_run: tool.schema
        .boolean()
        .optional()
        .describe("If true, generate and return a preview without writing any files. Default: false."),
    },
    execute: (args) =>
      withSession(ctx, (runCtx) =>
        runSprintWorkflow({
          ...runCtx,
          sprintGoal: args.sprint_goal,
          durationWeeks: args.duration_weeks,
          dryRun: args.dry_run ?? false,
        }),
      ),
  })
}

// ─── Workflow implementation ──────────────────────────────────────────────────

type SprintArgs = WorkflowRunCtx & { sprintGoal: string; durationWeeks?: number; dryRun: boolean }

async function runSprintWorkflow({ sprintGoal, durationWeeks = 2, dryRun, ...runCtx }: SprintArgs): Promise<string> {
  const { directory } = runCtx
  const docsDir = `ai-artifacts/sprint-${timestamp()}`

  // ── Generate all content ──────────────────────────────────────────────────────
  const plan = await runAgentSession(runCtx, "pm", `
Create a sprint plan using BMAD methodology.

Sprint goal: ${sprintGoal}
Duration: ${durationWeeks} week(s)

Include:
- Sprint goal statement
- Prioritized user stories for this sprint (in scope)
- Stories explicitly out of scope (backlog)
- Definition of Done
- Risks and blockers
`.trim())

  const stories = await runAgentSession(runCtx, "pm", `
For each story in this sprint plan, write the full BMAD user story with acceptance criteria.

Sprint plan:
${plan}

For each story:
- Full user story (As a / I want / So that)
- Detailed acceptance criteria (Given/When/Then)
- Technical notes for developers
- Effort estimate (S/M/L)
`.trim())

  // ── Dry run: return preview without writing ───────────────────────────────────
  if (dryRun) {
    const lines: string[] = []
    lines.push(`# Preview — Sprint: ${sprintGoal}`)
    lines.push(`> This is a dry run. No files have been written.\n`)

    lines.push(`## → ${docsDir}/SPRINT-PLAN.md\n`)
    lines.push(plan)
    lines.push(`\n---\n\n## → ${docsDir}/STORIES.md\n`)
    lines.push(stories)

    lines.push(`\n---\n\n> Call again with \`dry_run: false\` to write these files.`)
    return lines.join("\n")
  }

  // ── Write files ───────────────────────────────────────────────────────────────
  const lines: string[] = []
  lines.push(`# Workflow: Sprint Planning`)
  lines.push(`> Started at ${new Date().toISOString()}\n`)

  const planPath = await writeDoc(directory, `${docsDir}/SPRINT-PLAN.md`, formatDoc("Sprint Plan", sprintGoal, plan))
  lines.push(`   ✓ Sprint plan written → ${planPath}`)

  const storiesPath = await writeDoc(directory, `${docsDir}/STORIES.md`, formatDoc("User Stories", sprintGoal, stories))
  lines.push(`   ✓ Stories written → ${storiesPath}`)

  lines.push(`\n## Done ✓`)
  lines.push(`Generated docs in \`${docsDir}/\`:`)
  lines.push(`  - SPRINT-PLAN.md`)
  lines.push(`  - STORIES.md`)

  return lines.join("\n")
}
