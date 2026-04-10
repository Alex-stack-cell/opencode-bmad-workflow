import { tool } from "@opencode-ai/plugin"
import { runAgentSession, withSession } from "../utils/session.ts"
import { writeDoc, timestamp, formatDoc } from "../utils/files.ts"
import type { WorkflowCtx, WorkflowRunCtx } from "../utils/types.ts"

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const meta = {
  name: "workflow_sprint",
  summary: "Sprint planning",
  chain: "PM (plan) → PM (stories)",
  generates: ".workflow/sprint-[date]/SPRINT-PLAN.md, STORIES.md",
}

// ─── Tool factory ─────────────────────────────────────────────────────────────

export function createSprintTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Automated sprint planning workflow: PM creates the sprint plan → PM writes detailed user stories. Docs saved in .workflow/. IMPORTANT: Never call this tool without explicit sprint_goal provided by the user. If missing, ask the user before calling.",
    args: {
      sprint_goal: tool.schema
        .string()
        .describe("Sprint goal explicitly provided by the user. Never invent this."),
      duration_weeks: tool.schema
        .number()
        .optional()
        .describe("Sprint duration in weeks (default: 2)"),
    },
    execute: (args) =>
      withSession(ctx, (runCtx) =>
        runSprintWorkflow({ ...runCtx, sprintGoal: args.sprint_goal, durationWeeks: args.duration_weeks }),
      ),
  })
}

// ─── Workflow implementation ──────────────────────────────────────────────────

type SprintArgs = WorkflowRunCtx & { sprintGoal: string; durationWeeks?: number }

async function runSprintWorkflow({ sprintGoal, durationWeeks = 2, ...runCtx }: SprintArgs): Promise<string> {
  const { directory } = runCtx
  const docsDir = `.workflow/sprint-${timestamp()}`
  const lines: string[] = []

  lines.push(`# Workflow: Sprint Planning`)
  lines.push(`> Started at ${new Date().toISOString()}\n`)

  lines.push("## Step 1/2 — PM: Planning sprint...")
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
  const planPath = await writeDoc(directory, `${docsDir}/SPRINT-PLAN.md`, formatDoc("Sprint Plan", sprintGoal, plan))
  lines.push(`   ✓ Sprint plan written → ${planPath}`)

  lines.push("## Step 2/2 — PM: Writing detailed stories...")
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
  const storiesPath = await writeDoc(directory, `${docsDir}/STORIES.md`, formatDoc("User Stories", sprintGoal, stories))
  lines.push(`   ✓ Stories written → ${storiesPath}`)

  lines.push(`\n## Done ✓`)
  lines.push(`Generated docs in \`${docsDir}/\`:`)
  lines.push(`  - SPRINT-PLAN.md`)
  lines.push(`  - STORIES.md`)

  return lines.join("\n")
}
