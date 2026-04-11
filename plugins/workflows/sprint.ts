import { tool } from "@opencode-ai/plugin"
import { runAgentSession, withSession } from "../utils/session.ts"
import { writeDoc, readDoc, timestamp, formatDoc } from "../utils/files.ts"
import { rm } from "node:fs/promises"
import { join } from "node:path"
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
      "Sprint planning workflow: PM creates the sprint plan → PM writes detailed user stories. Pass dry_run: true to write a preview to ai-artifacts/.previews/ for review before committing. IMPORTANT: Never call this tool without explicit sprint_goal provided by the user.",
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
        .describe("If true, write a preview to ai-artifacts/.previews/ without touching real files. The user can edit the preview, then call again with dry_run: false to finalize. Default: false."),
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
  const slug = sprintGoal.toLowerCase().replaceAll(/\s+/g, "-").replaceAll(/[^a-z0-9-]/g, "")
  const previewDir = `ai-artifacts/.previews/sprint-${slug}`

  // ── Check for existing preview (user may have edited it) ──────────────────────
  const previewPlan = await readDoc(directory, `${previewDir}/sprint-plan.md`)
  const previewStories = await readDoc(directory, `${previewDir}/stories.md`)
  const hasPreview = !!previewPlan && !!previewStories

  // ── Generate or reuse content ─────────────────────────────────────────────────
  let plan: string
  let stories: string

  if (!dryRun && hasPreview) {
    plan = previewPlan
    stories = previewStories
  } else {
    plan = await runAgentSession(runCtx, "pm", `
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

    stories = await runAgentSession(runCtx, "pm", `
For each story in this sprint plan, write the full BMAD user story with acceptance criteria.

Sprint plan:
${plan}

For each story:
- Full user story (As a / I want / So that)
- Detailed acceptance criteria (Given/When/Then)
- Technical notes for developers
- Effort estimate (S/M/L)
`.trim())
  }

  // ── Dry run: write preview files ──────────────────────────────────────────────
  if (dryRun) {
    const docsDir = `ai-artifacts/sprint-[date]`
    await writeDoc(directory, `${previewDir}/sprint-plan.md`, plan)
    await writeDoc(directory, `${previewDir}/stories.md`, stories)

    return [
      `# Preview ready — Sprint: ${sprintGoal}`,
      ``,
      `Open and edit these files freely before finalizing:`,
      `  - ${previewDir}/sprint-plan.md → ${docsDir}/SPRINT-PLAN.md`,
      `  - ${previewDir}/stories.md → ${docsDir}/STORIES.md`,
      ``,
      `When ready, call \`workflow_sprint\` again with the same arguments and \`dry_run: false\` to save to their final locations.`,
    ].join("\n")
  }

  // ── Write real files ──────────────────────────────────────────────────────────
  const docsDir = `ai-artifacts/sprint-${timestamp()}`
  const lines: string[] = []
  lines.push(`# Workflow: Sprint Planning`)
  lines.push(`> Started at ${new Date().toISOString()}\n`)

  if (hasPreview) lines.push(`> Loaded from preview (including any edits you made).\n`)

  const planPath = await writeDoc(directory, `${docsDir}/SPRINT-PLAN.md`, formatDoc("Sprint Plan", sprintGoal, plan))
  lines.push(`   ✓ Sprint plan written → ${planPath}`)

  const storiesPath = await writeDoc(directory, `${docsDir}/STORIES.md`, formatDoc("User Stories", sprintGoal, stories))
  lines.push(`   ✓ Stories written → ${storiesPath}`)

  if (hasPreview) {
    await rm(join(directory, previewDir), { recursive: true, force: true })
    lines.push(`   ✓ Preview cleaned up`)
  }

  lines.push(`\n## Done ✓`)
  lines.push(`Generated docs in \`${docsDir}/\`:`)
  lines.push(`  - SPRINT-PLAN.md`)
  lines.push(`  - STORIES.md`)

  return lines.join("\n")
}