import { tool } from "@opencode-ai/plugin"
import { runAgentSession, withSession } from "../utils/session.ts"
import { writeDoc, readDoc, formatDoc } from "../utils/files.ts"
import { readdir, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import type { WorkflowCtx, WorkflowRunCtx } from "../types/workflow.ts"

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const meta = {
  name: "workflow_epic_save",
  summary: "New epic",
  chain: "PM (scope) → updates docs/ROADMAP.md",
  generates: "ai-artifacts/epics/[epic].md",
}

export const metaOverview = {
  name: "workflow_epics",
  summary: "Roadmap overview",
  chain: "Lists all existing epics with priority and inferred status",
  generates: "(read-only)",
}

// ─── Tool factories ───────────────────────────────────────────────────────────

export function createEpicsTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Show a roadmap overview: list all existing epics from ai-artifacts/epics/ with their priority, effort, and inferred status.",
    args: {},
    execute: () => withSession(ctx, runEpicsOverview),
  })
}

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
      "Epic workflow — Step 2/2: Save the epic to its final locations. Reads from ai-artifacts/.previews/ if a preview exists (preserving user edits), otherwise generates fresh. Call workflow_epic_preview first.",
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

async function runEpicsOverview(runCtx: WorkflowRunCtx): Promise<string> {
  const { directory } = runCtx
  const epicsDir = join(directory, "ai-artifacts/epics")
  const lines: string[] = []

  lines.push("# Epic Roadmap Overview")
  lines.push(`> Generated at ${new Date().toISOString()}\n`)

  let epicFiles: string[] = []
  try {
    const entries = await readdir(epicsDir)
    epicFiles = entries.filter((f) => f.endsWith(".md") && !f.includes("-features"))
  } catch {
    return [...lines, "No epics found yet in `ai-artifacts/epics/`.\n", "Use `workflow_epic_preview` to create your first epic."].join("\n")
  }

  if (epicFiles.length === 0) {
    return [...lines, "No epics found yet in `ai-artifacts/epics/`.\n", "Use `workflow_epic_preview` to create your first epic."].join("\n")
  }

  const epicContents: string[] = []
  for (const file of epicFiles) {
    const content = await readFile(join(epicsDir, file), "utf-8")
    epicContents.push(`### ${file}\n\n${content}`)
  }

  const overview = await runAgentSession(runCtx, "analyst", `
Produce a concise roadmap overview from these epic definitions.

${epicContents.join("\n\n---\n\n")}

For each epic:
- Name and one-line description
- Priority
- Rough effort
- Features listed
- Inferred status: TODO / IN PROGRESS / DONE (based on content clues)

Format as a prioritized table or list. End with a recommendation for which epic to tackle next.
`.trim())

  lines.push(overview)
  return lines.join("\n")
}

type EpicArgs = WorkflowRunCtx & { epicName: string; epicGoal: string; priority: "HIGH" | "MEDIUM" | "LOW" }

async function generateEpicContent(args: EpicArgs) {
  const { epicName, epicGoal, priority, directory, ...runCtx } = args
  const overviewPath = `docs/OVERVIEW.md`
  const roadmapPath = `docs/ROADMAP.md`

  const epicDef = await runAgentSession({ ...runCtx, directory }, "pm", `
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

  const existingOverview = await readDoc(directory, overviewPath)
  const overviewContent = existingOverview ? null : await runAgentSession({ ...runCtx, directory }, "pm", `
Create a concise project overview document based on the codebase context.

Include:
- One paragraph describing what this project is and its purpose
- Key technologies used
- Repository structure (main directories and their role)
- How to get started (brief)

Do NOT include epics, roadmap, or planning information — that belongs in ROADMAP.md.
Keep it stable: this document should rarely need to change.
`.trim())

  const existingRoadmap = await readDoc(directory, roadmapPath)
  const updatedRoadmap = await runAgentSession({ ...runCtx, directory }, "pm", `
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

async function runEpicPreview(args: EpicArgs): Promise<string> {
  const { epicName, directory } = args
  const slug = epicName.toLowerCase().replaceAll(/\s+/g, "-")
  const previewDir = `ai-artifacts/.previews/epic-${slug}`

  const { epicDef, overviewContent, updatedRoadmap, existingRoadmap } = await generateEpicContent(args)

  await writeDoc(directory, `${previewDir}/epic.md`, epicDef)
  if (overviewContent) await writeDoc(directory, `${previewDir}/overview.md`, overviewContent)
  await writeDoc(directory, `${previewDir}/roadmap.md`, updatedRoadmap)

  const files = [
    `  - ${previewDir}/epic.md → ai-artifacts/epics/${slug}.md`,
    overviewContent ? `  - ${previewDir}/overview.md → docs/OVERVIEW.md (will be created)` : null,
    `  - ${previewDir}/roadmap.md → docs/ROADMAP.md (will be ${existingRoadmap ? "updated" : "created"})`,
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

async function runEpicSave(args: EpicArgs): Promise<string> {
  const { epicName, directory } = args
  const slug = epicName.toLowerCase().replaceAll(/\s+/g, "-")
  const previewDir = `ai-artifacts/.previews/epic-${slug}`
  const overviewPath = `docs/OVERVIEW.md`
  const roadmapPath = `docs/ROADMAP.md`

  const previewEpic = await readDoc(directory, `${previewDir}/epic.md`)
  const previewRoadmap = await readDoc(directory, `${previewDir}/roadmap.md`)
  const previewOverview = await readDoc(directory, `${previewDir}/overview.md`)
  const hasPreview = !!previewEpic && !!previewRoadmap

  let epicDef: string
  let overviewContent: string | null
  let updatedRoadmap: string

  if (hasPreview) {
    epicDef = previewEpic
    overviewContent = previewOverview || null
    updatedRoadmap = previewRoadmap
  } else {
    const generated = await generateEpicContent(args)
    epicDef = generated.epicDef
    overviewContent = generated.overviewContent
    updatedRoadmap = generated.updatedRoadmap
  }

  const lines: string[] = []
  lines.push(`# Workflow: Epic — ${epicName}`)
  lines.push(`> Started at ${new Date().toISOString()}\n`)
  if (hasPreview) lines.push(`> Loaded from preview (including any edits you made).\n`)

  const epicFilePath = await writeDoc(directory, `ai-artifacts/epics/${slug}.md`, formatDoc("Epic", epicName, epicDef))
  lines.push(`   ✓ Epic written → ${epicFilePath}`)

  if (overviewContent) {
    const overviewFilePath = await writeDoc(directory, overviewPath, overviewContent)
    lines.push(`   ✓ Overview created → ${overviewFilePath}`)
  }

  const roadmapFilePath = await writeDoc(directory, roadmapPath, updatedRoadmap)
  lines.push(`   ✓ Roadmap updated → ${roadmapFilePath}`)

  if (hasPreview) {
    await rm(join(directory, previewDir), { recursive: true, force: true })
    lines.push(`   ✓ Preview cleaned up`)
  }

  lines.push(`\n## Done ✓`)
  lines.push(`  - ai-artifacts/epics/${slug}.md`)
  if (overviewContent) lines.push(`  - ${overviewPath} (created)`)
  lines.push(`  - ${roadmapPath}`)
  lines.push(`\nReview the epic, then use \`workflow_feature_preview\` for each feature you want to implement.`)

  return lines.join("\n")
}
