import { tool } from "@opencode-ai/plugin"
import { runAgentSession, withSession } from "../utils/session.ts"
import { writeDoc, readDoc } from "../utils/files.ts"
import { readSprintStatus, writeSprintStatus } from "../utils/status.ts"
import { rm } from "node:fs/promises"
import { join } from "node:path"
import type { WorkflowCtx, WorkflowRunCtx } from "../types/workflow.ts"

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const meta = {
  name: "workflow_sprint_save",
  summary: "Sprint planning",
  chain: "PM (plan from backlog) → updates sprint-status.yaml story statuses",
  generates: "ai-artifacts/planning-artifacts/sprint-[slug].md",
}

// ─── Tool factories ───────────────────────────────────────────────────────────

export function createSprintPreviewTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Sprint planning workflow — Step 1/2: Generate a sprint plan from backlog stories in sprint-status.yaml, then write it to ai-artifacts/.previews/ for the user to review and edit. Always call this before workflow_sprint_save. IMPORTANT: Never call this tool without explicit sprint_goal provided by the user.",
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
      "Sprint planning workflow — Step 2/2: Save the sprint plan and update story statuses in sprint-status.yaml. Reads from ai-artifacts/.previews/ if a preview exists. Call workflow_sprint_preview first.",
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

  const currentStatus = await readSprintStatus(directory)
  const backlogContext = currentStatus
    ? `Current sprint-status.yaml:\n\`\`\`yaml\n${currentStatus}\n\`\`\`\n\nSelect stories with status "backlog" that fit this sprint.`
    : `No sprint-status.yaml found. List the stories that should be planned based on the sprint goal.`

  const plan = await runAgentSession({ ...runCtx, directory }, "pm", `
Create a sprint plan using BMAD methodology.

Sprint goal: ${sprintGoal}
Duration: ${durationWeeks} week(s)

${backlogContext}

Include:
- Sprint goal statement
- Selected stories for this sprint (reference by story ID and title from sprint-status.yaml)
- Stories explicitly out of scope (kept in backlog)
- Definition of Done
- Risks and blockers
`.trim())

  return { plan, currentStatus }
}

async function runSprintPreview(args: SprintArgs): Promise<string> {
  const { sprintGoal, directory } = args
  const slug = sprintGoal.toLowerCase().replaceAll(/\s+/g, "-").replaceAll(/[^a-z0-9-]/g, "")
  const previewDir = `ai-artifacts/.previews/sprint-${slug}`

  const { plan } = await generateSprintContent(args)

  await writeDoc(directory, `${previewDir}/sprint-plan.md`, plan)

  return [
    `# Preview ready — Sprint: ${sprintGoal}`,
    ``,
    `Open and edit this file freely before finalizing:`,
    `  - ${previewDir}/sprint-plan.md → ai-artifacts/planning-artifacts/sprint-${slug}.md`,
    `  - (sprint-status.yaml will be updated on save — stories moved to "in-progress")`,
    ``,
    `When ready, call \`workflow_sprint_save\` with the same arguments to write to its final location.`,
  ].join("\n")
}

async function runSprintSave(args: SprintArgs): Promise<string> {
  const { sprintGoal, directory, ...runCtx } = args
  const slug = sprintGoal.toLowerCase().replaceAll(/\s+/g, "-").replaceAll(/[^a-z0-9-]/g, "")
  const previewDir = `ai-artifacts/.previews/sprint-${slug}`

  const previewPlan = await readDoc(directory, `${previewDir}/sprint-plan.md`)
  const hasPreview = !!previewPlan

  let plan: string
  let currentStatus: string

  if (hasPreview) {
    plan = previewPlan
    currentStatus = await readSprintStatus(directory)
  } else {
    const generated = await generateSprintContent(args)
    plan = generated.plan
    currentStatus = generated.currentStatus
  }

  // Update sprint-status.yaml — mark selected stories as in-progress
  const updatedStatus = currentStatus
    ? await runAgentSession({ ...runCtx, directory }, "pm", `
Update sprint-status.yaml to mark the stories selected for this sprint as "in-progress".

Sprint plan (lists which stories are selected):
${plan}

Current sprint-status.yaml:
\`\`\`yaml
${currentStatus}
\`\`\`

For each story mentioned in the sprint plan as "in scope" or "selected", change its status from "backlog" to "in-progress".
Leave all other stories unchanged.

Output ONLY the raw YAML content, no markdown fences, no explanation.
`.trim())
    : currentStatus

  const lines: string[] = []
  lines.push(`# Workflow: Sprint Planning — ${sprintGoal}`)
  if (hasPreview) lines.push(`> Loaded from preview (including any edits you made).\n`)

  const planPath = await writeDoc(directory, `ai-artifacts/planning-artifacts/sprint-${slug}.md`, plan)
  lines.push(`   ✓ Sprint plan written → ${planPath}`)

  if (updatedStatus) {
    const statusPath = await writeSprintStatus(directory, updatedStatus)
    lines.push(`   ✓ Sprint status updated → ${statusPath}`)
  }

  if (hasPreview) {
    await rm(join(directory, previewDir), { recursive: true, force: true })
    lines.push(`   ✓ Preview cleaned up`)
  }

  lines.push(`\n## Done ✓`)
  lines.push(`  - ai-artifacts/planning-artifacts/sprint-${slug}.md`)
  if (updatedStatus) lines.push(`  - ai-artifacts/sprint-status.yaml (stories updated to in-progress)`)

  return lines.join("\n")
}
