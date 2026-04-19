import { tool } from "@opencode-ai/plugin"
import { rm } from "node:fs/promises"
import { join } from "node:path"
import type { WorkflowCtx, WorkflowRunCtx } from "../types/workflow.ts"
import { withSession } from "../session/context.ts"
import { runAgentSession } from "../session/agent.ts"
import { readDoc, writeDoc } from "../storage/docs.ts"
import { readSprintStatus, writeSprintStatus } from "../storage/sprint.ts"
import { slugify } from "../parsers/slugify.ts"

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
    ? `Current sprint-status.yaml:\n\`\`\`yaml\n${currentStatus}\n\`\`\`\n\nSelect stories with status "ready-for-dev" that fit this sprint. Do NOT invent stories that are not in this file.`
    : `No sprint-status.yaml found. Do NOT invent stories — return an empty plan and ask the user to create stories first.`

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
  const slug = slugify(sprintGoal)
  const previewDir = `ai-artifacts/.previews/sprint-${slug}`

  const yaml = await readSprintStatus(directory)
  if (!yaml) {
    return [
      `# Sprint planning not ready`,
      ``,
      `No \`sprint-status.yaml\` found — no epics or stories have been created yet.`,
      ``,
      `Suggested workflow:`,
      `  1. \`/workflow-epic\` — define your first epic`,
      `  2. \`/workflow-story\` — create stories for that epic`,
      `  3. \`/workflow-status\` — confirm stories are in \`ready-for-dev\``,
      `  4. \`/workflow-sprint\` — plan your sprint`,
    ].join("\n")
  }

  const hasReadyStories = yaml.includes("ready-for-dev")
  if (!hasReadyStories) {
    return [
      `# Sprint planning not ready`,
      ``,
      `No stories with status \`ready-for-dev\` found in \`sprint-status.yaml\`.`,
      `A sprint should select from stories that are already defined and ready.`,
      ``,
      `Suggested workflow:`,
      `  1. \`/workflow-story\` — create stories for your epics`,
      `  2. \`/workflow-status\` — confirm stories appear as \`ready-for-dev\``,
      `  3. \`/workflow-sprint\` — come back here to plan the sprint`,
    ].join("\n")
  }

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
  const slug = slugify(sprintGoal)
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

  lines.push(`\n## Next steps`)
  lines.push(`  1. \`/workflow-story-dev\` — dev agent implements a story (pass the story ID, e.g. "1.1")`)
  lines.push(`  2. \`/workflow-story-update\` — move a story to review, then done`)
  lines.push(`  3. \`/workflow-review\` — adversarial code review before closing`)

  return lines.join("\n")
}
