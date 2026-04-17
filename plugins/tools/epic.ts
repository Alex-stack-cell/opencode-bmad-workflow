import { tool } from "@opencode-ai/plugin"
import type { WorkflowCtx, WorkflowRunCtx } from "../types/workflow.ts"
import { withSession } from "../session/context.ts"
import { runAgentSession } from "../session/agent.ts"
import { readDoc } from "../storage/docs.ts"
import { readSprintStatus, writeSprintStatus } from "../storage/sprint.ts"
import { slugify } from "../parsers/slugify.ts"
import { Paths } from "../constants/paths.ts"
import { AgentRole } from "../agents/roles.ts"
import { loadPreview, saveFiles, cleanPreview } from "../workflows/preview-save.ts"

// ─── Tool factories ───────────────────────────────────────────────────────────

export function createEpicPreviewTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Epic workflow — Step 1/2: Generate a preview of the epic and write it to ai-artifacts/.previews/ for the user to review and edit. Always call this before workflow_epic_save. IMPORTANT: Never call this tool without explicit epic_name, epic_goal, and priority provided by the user.",
    args: {
      epic_name: tool.schema.string().describe("Short epic name explicitly provided by the user. Never invent this."),
      epic_goal: tool.schema.string().describe("Business goal explicitly provided by the user. Never invent this."),
      priority: tool.schema.enum(["HIGH", "MEDIUM", "LOW"]).describe("Priority explicitly provided by the user. Never invent this."),
    },
    execute: (args) =>
      withSession(ctx, (runCtx) =>
        runEpicPreview({ ...runCtx, epicName: args.epic_name, epicGoal: args.epic_goal, priority: args.priority }),
      ),
  })
}

export function createEpicSaveTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Epic workflow — Step 2/2: Save the epic to its final locations and update sprint-status.yaml. Reads from ai-artifacts/.previews/ if a preview exists (preserving user edits). Call workflow_epic_preview first.",
    args: {
      epic_name: tool.schema.string().describe("Same epic name used in workflow_epic_preview."),
      epic_goal: tool.schema.string().describe("Same epic goal used in workflow_epic_preview."),
      priority: tool.schema.enum(["HIGH", "MEDIUM", "LOW"]).describe("Same priority used in workflow_epic_preview."),
    },
    execute: (args) =>
      withSession(ctx, (runCtx) =>
        runEpicSave({ ...runCtx, epicName: args.epic_name, epicGoal: args.epic_goal, priority: args.priority }),
      ),
  })
}

// ─── Workflow implementations ─────────────────────────────────────────────────

type EpicWorkflowArgs = WorkflowRunCtx & { epicName: string; epicGoal: string; priority: "HIGH" | "MEDIUM" | "LOW" }

async function generateEpicContent(args: EpicWorkflowArgs) {
  const { epicName, epicGoal, priority, directory, ...runCtx } = args

  const epicDef = await runAgentSession({ ...runCtx, directory }, AgentRole.PM, `
Define a high-level epic using BMAD methodology.

Epic name: ${epicName}
Goal: ${epicGoal}

Include:
- Epic title and one-line description
- Business value and strategic goal
- High-level list of potential features (not detailed, not exhaustive)
- Success metrics (how do we know the epic is done?)
- Dependencies on other epics (only list epics that are explicitly known — write "None identified" if unsure, do NOT invent epics)
- Effort estimate: provide a rough duration WITH a justification explaining why based on the described scope. Clearly mark it as an estimate to be validated by the team.
- Priority: ${priority} (set by the user — do not change this)
`.trim())

  const existingOverview = await readDoc(directory, Paths.OVERVIEW)
  const overviewContent = existingOverview ? null : await runAgentSession({ ...runCtx, directory }, AgentRole.PM, `
Create a concise project overview document based on the codebase context.

Include:
- One paragraph describing what this project is and its purpose
- Key technologies used
- Repository structure (main directories and their role)
- How to get started (brief)

Do NOT include epics, roadmap, or planning information — that belongs in ROADMAP.md.
Keep it stable: this document should rarely need to change.
`.trim())

  const existingRoadmap = await readDoc(directory, Paths.ROADMAP)
  const updatedRoadmap = await runAgentSession({ ...runCtx, directory }, AgentRole.PM, `
Update the project roadmap to include this new epic.

${existingRoadmap
    ? `Existing ROADMAP.md:\n${existingRoadmap}\n\n---\n\nAdd or update the entry for this epic. Keep all existing epics intact. Do NOT invent new ones.`
    : `No roadmap exists yet. Create one from scratch with only this epic.`}

Epic to add:
${epicDef}

Format:
- One section per epic with: status (TODO / IN PROGRESS / DONE), priority, one-line description, effort estimate
- Keep it concise — this is a planning reference, not detailed documentation
`.trim())

  return { epicDef, overviewContent, updatedRoadmap, existingRoadmap }
}

async function runEpicPreview(args: EpicWorkflowArgs): Promise<string> {
  const { epicName, directory } = args
  const slug = slugify(epicName)
  const previewDir = Paths.epicPreviewDir(slug)

  const { epicDef, overviewContent, updatedRoadmap, existingRoadmap } = await generateEpicContent(args)

  const filesToSave: Record<string, string> = {
    [`${previewDir}/epic.md`]: epicDef,
    [`${previewDir}/roadmap.md`]: updatedRoadmap,
  }
  if (overviewContent) filesToSave[`${previewDir}/overview.md`] = overviewContent
  await saveFiles(directory, filesToSave)

  const files = [
    `  - ${previewDir}/epic.md → ai-artifacts/planning-artifacts/epic-[n]-${slug}.md`,
    overviewContent ? `  - ${previewDir}/overview.md → docs/OVERVIEW.md (will be created)` : null,
    `  - ${previewDir}/roadmap.md → docs/ROADMAP.md (will be ${existingRoadmap ? "updated" : "created"})`,
    `  - (sprint-status.yaml will be updated on save)`,
  ].filter(Boolean)

  return [
    `# Preview ready — Epic: ${epicName}`,
    ``,
    `Open and edit these files freely before finalizing:`,
    ...files,
    ``,
    `When ready, call \`workflow_epic_save\` with the same arguments to write to their final locations.`,
  ].join("\n")
}

async function runEpicSave(args: EpicWorkflowArgs): Promise<string> {
  const { epicName, epicGoal, priority, directory, ...runCtx } = args
  const slug = slugify(epicName)
  const previewDir = Paths.epicPreviewDir(slug)

  const preview = await loadPreview(directory, {
    epicDef: `${previewDir}/epic.md`,
    updatedRoadmap: `${previewDir}/roadmap.md`,
  })
  const hasPreview = preview !== null
  const optionalOverview = hasPreview ? await readDoc(directory, `${previewDir}/overview.md`) || null : null

  let epicDef: string
  let overviewContent: string | null
  let updatedRoadmap: string

  if (hasPreview) {
    epicDef = preview.epicDef
    overviewContent = optionalOverview
    updatedRoadmap = preview.updatedRoadmap
  } else {
    const generated = await generateEpicContent({ ...runCtx, directory, epicName, epicGoal, priority })
    epicDef = generated.epicDef
    overviewContent = generated.overviewContent
    updatedRoadmap = generated.updatedRoadmap
  }

  const existingStatus = await readSprintStatus(directory)
  const raw = await runAgentSession({ ...runCtx, directory }, AgentRole.PM, `
Update this sprint-status.yaml to add a new epic entry, then return the result as JSON.

${existingStatus
    ? `Existing sprint-status.yaml:\n\`\`\`yaml\n${existingStatus}\n\`\`\`\n\nAdd the new epic below. Use the next available integer ID. Keep all existing entries intact.`
    : `No sprint-status.yaml exists yet. Create one from scratch with only this epic.`}

New epic to add:
- name: "${epicName}"
- goal: "${epicGoal}"
- priority: ${priority}
- status: planned
- stories: []

Respond with ONLY this JSON (no markdown, no explanation):
{"id": <assigned integer id>, "yaml": "<full updated yaml as a single escaped string>"}

YAML format to follow:
epics:
  - id: 1
    name: "Epic name"
    status: planned
    priority: HIGH
    stories: []
`.trim())

  let epicId = "n"
  let updatedStatus: string
  try {
    const parsed = JSON.parse(raw) as { id: number; yaml: string }
    epicId = String(parsed.id)
    updatedStatus = parsed.yaml
  } catch {
    updatedStatus = raw
  }

  const lines: string[] = []
  lines.push(`# Workflow: Epic — ${epicName}`)
  if (hasPreview) lines.push(`> Loaded from preview (including any edits you made).\n`)

  const [epicFilePath] = await saveFiles(directory, { [Paths.epicFile(epicId, slug)]: epicDef })
  lines.push(`   ✓ Epic written → ${epicFilePath}`)

  if (overviewContent) {
    const [overviewFilePath] = await saveFiles(directory, { [Paths.OVERVIEW]: overviewContent })
    lines.push(`   ✓ Overview created → ${overviewFilePath}`)
  }

  const [roadmapFilePath] = await saveFiles(directory, { [Paths.ROADMAP]: updatedRoadmap })
  lines.push(`   ✓ Roadmap updated → ${roadmapFilePath}`)

  const statusPath = await writeSprintStatus(directory, updatedStatus)
  lines.push(`   ✓ Sprint status updated → ${statusPath}`)

  if (hasPreview) {
    await cleanPreview(directory, previewDir)
    lines.push(`   ✓ Preview cleaned up`)
  }

  lines.push(`\n## Done ✓`)
  lines.push(`  - ai-artifacts/planning-artifacts/epic-${epicId}-${slug}.md`)
  if (overviewContent) lines.push(`  - docs/OVERVIEW.md (created)`)
  lines.push(`  - docs/ROADMAP.md`)
  lines.push(`  - ai-artifacts/sprint-status.yaml`)
  lines.push(`\nRun \`workflow_story_preview\` for each story you want to implement in this epic.`)

  return lines.join("\n")
}
