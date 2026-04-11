import { tool } from "@opencode-ai/plugin"
import { runAgentSession, withSession } from "../utils/session.ts"
import { writeDoc, readDoc, timestamp, formatDoc } from "../utils/files.ts"
import { rm } from "node:fs/promises"
import { join } from "node:path"
import type { WorkflowCtx, WorkflowRunCtx } from "../types/workflow.ts"

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const meta = {
  name: "workflow_sprint_save",
  summary: "Sprint planning",
  chain: "PM (plan) → PM (stories)",
  generates: "ai-artifacts/sprint-[date]/SPRINT-PLAN.md, STORIES.md",
}

// ─── Tool factories ───────────────────────────────────────────────────────────

export function createSprintPreviewTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Sprint planning workflow — Step 1/2: Generate sprint plan and user stories, then write them to ai-artifacts/.previews/ for the user to review and edit. Always call this before workflow_sprint_save. IMPORTANT: Never call this tool without explicit sprint_goal provided by the user.",
    args: {
      sprint_goal: tool.schema.string().describe("Sprint goal explicitly provided by the user. Never invent this."),
      duration_weeks: tool.schema.number().optional().describe("Sprint duration in weeks (default: 2)."),
    },
    execute: (args) =>
      withSession(ctx, (runCtx) =>
        runSprintPreview({ ...runCtx, sprintGoal: args.sprint_goal, durationWeeks: args.duration_weeks }),
      ),
  })
}

export function createSprintSaveTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Sprint planning workflow — Step 2/2: Save the sprint docs to their final locations. Reads from ai-artifacts/.previews/ if a preview exists (preserving user edits), otherwise generates fresh. Call workflow_sprint_preview first.",
    args: {
      sprint_goal: tool.schema.string().describe("Same sprint goal used in workflow_sprint_preview."),
      duration_weeks: tool.schema.number().optional().describe("Sprint duration in weeks (default: 2)."),
    },
    execute: (args) =>
      withSession(ctx, (runCtx) =>
        runSprintSave({ ...runCtx, sprintGoal: args.sprint_goal, durationWeeks: args.duration_weeks }),
      ),
  })
}

// ─── Workflow implementation ──────────────────────────────────────────────────

type SprintArgs = WorkflowRunCtx & { sprintGoal: string; durationWeeks?: number }

async function generateSprintContent(args: SprintArgs) {
  const { sprintGoal, durationWeeks = 2, directory, ...runCtx } = args

  const plan = await runAgentSession({ ...runCtx, directory }, "pm", `
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

  const stories = await runAgentSession({ ...runCtx, directory }, "pm", `
For each story in this sprint plan, write the full BMAD user story with acceptance criteria.

Sprint plan:
${plan}

For each story:
- Full user story (As a / I want / So that)
- Detailed acceptance criteria (Given/When/Then)
- Technical notes for developers
- Effort estimate (S/M/L)
`.trim())

  return { plan, stories }
}

async function runSprintPreview(args: SprintArgs): Promise<string> {
  const { sprintGoal, directory } = args
  const slug = sprintGoal.toLowerCase().replaceAll(/\s+/g, "-").replaceAll(/[^a-z0-9-]/g, "")
  const previewDir = `ai-artifacts/.previews/sprint-${slug}`

  const { plan, stories } = await generateSprintContent(args)

  await writeDoc(directory, `${previewDir}/sprint-plan.md`, plan)
  await writeDoc(directory, `${previewDir}/stories.md`, stories)

  return [
    `# Preview ready — Sprint: ${sprintGoal}`,
    ``,
    `Open and edit these files freely before finalizing:`,
    `  - ${previewDir}/sprint-plan.md → ai-artifacts/sprint-[date]/SPRINT-PLAN.md`,
    `  - ${previewDir}/stories.md → ai-artifacts/sprint-[date]/STORIES.md`,
    ``,
    `When ready, call \`workflow_sprint_save\` with the same arguments to write to their final locations.`,
  ].join("\n")
}

async function runSprintSave(args: SprintArgs): Promise<string> {
  const { sprintGoal, directory } = args
  const slug = sprintGoal.toLowerCase().replaceAll(/\s+/g, "-").replaceAll(/[^a-z0-9-]/g, "")
  const previewDir = `ai-artifacts/.previews/sprint-${slug}`
  const docsDir = `ai-artifacts/sprint-${timestamp()}`

  const previewPlan = await readDoc(directory, `${previewDir}/sprint-plan.md`)
  const previewStories = await readDoc(directory, `${previewDir}/stories.md`)
  const hasPreview = !!previewPlan && !!previewStories

  let plan: string
  let stories: string

  if (hasPreview) {
    plan = previewPlan
    stories = previewStories
  } else {
    const generated = await generateSprintContent(args)
    plan = generated.plan
    stories = generated.stories
  }

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
