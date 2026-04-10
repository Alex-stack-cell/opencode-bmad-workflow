import { tool } from "@opencode-ai/plugin"
import { runAgentSession, withSession } from "../utils/session.ts"
import { writeDoc, readDoc, formatDoc } from "../utils/files.ts"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import type { WorkflowCtx, WorkflowRunCtx } from "../utils/types.ts"

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const meta = {
  name: "workflow_epic",
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

export function createEpicTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Epic workflow: PM defines scope and goals. Updates docs/OVERVIEW.md and docs/ROADMAP.md. Pass dry_run: true to preview generated content before writing. IMPORTANT: Never call this tool without explicit epic_name, epic_goal, and priority provided by the user.",
    args: {
      epic_name: tool.schema
        .string()
        .describe("Short epic name explicitly provided by the user. Never invent this."),
      epic_goal: tool.schema
        .string()
        .describe("Business goal explicitly provided by the user. Never invent this."),
      priority: tool.schema
        .enum(["HIGH", "MEDIUM", "LOW"])
        .describe("Priority explicitly provided by the user. Never invent this."),
      dry_run: tool.schema
        .boolean()
        .optional()
        .describe("If true, generate and return a preview without writing any files. Default: false."),
    },
    execute: (args) =>
      withSession(ctx, (runCtx) =>
        runEpicWorkflow({
          ...runCtx,
          epicName: args.epic_name,
          epicGoal: args.epic_goal,
          priority: args.priority,
          dryRun: args.dry_run ?? false,
        }),
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
    return [...lines, "No epics found yet in `ai-artifacts/epics/`.\n", "Use `workflow_epic` to create your first epic."].join("\n")
  }

  if (epicFiles.length === 0) {
    return [...lines, "No epics found yet in `ai-artifacts/epics/`.\n", "Use `workflow_epic` to create your first epic."].join("\n")
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

type EpicArgs = WorkflowRunCtx & { epicName: string; epicGoal: string; priority: "HIGH" | "MEDIUM" | "LOW"; dryRun: boolean }

async function runEpicWorkflow({ epicName, epicGoal, priority, dryRun, ...runCtx }: EpicArgs): Promise<string> {
  const { directory } = runCtx
  const slug = epicName.toLowerCase().replace(/\s+/g, "-")
  const epicsDir = `ai-artifacts/epics`
  const overviewPath = `docs/OVERVIEW.md`
  const roadmapPath = `docs/ROADMAP.md`

  // ── Generate epic definition ──────────────────────────────────────────────────
  const epicDef = await runAgentSession(runCtx, "pm", `
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

  // ── Generate OVERVIEW.md content if needed ────────────────────────────────────
  const existingOverview = await readDoc(directory, overviewPath)
  let overviewContent: string | null = null
  if (!existingOverview) {
    overviewContent = await runAgentSession(runCtx, "pm", `
Create a concise project overview document based on the codebase context.

Include:
- One paragraph describing what this project is and its purpose
- Key technologies used
- Repository structure (main directories and their role)
- How to get started (brief)

Do NOT include epics, roadmap, or planning information — that belongs in ROADMAP.md.
Keep it stable: this document should rarely need to change.
`.trim())
  }

  // ── Generate ROADMAP.md ───────────────────────────────────────────────────────
  const existingRoadmap = await readDoc(directory, roadmapPath)
  const updatedRoadmap = await runAgentSession(runCtx, "pm", `
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

  // ── Dry run: return preview without writing ───────────────────────────────────
  if (dryRun) {
    const lines: string[] = []
    lines.push(`# Preview — Epic: ${epicName}`)
    lines.push(`> This is a dry run. No files have been written.\n`)

    lines.push(`## → ai-artifacts/epics/${slug}.md\n`)
    lines.push(epicDef)

    if (overviewContent) {
      lines.push(`\n---\n\n## → docs/OVERVIEW.md (will be created)\n`)
      lines.push(overviewContent)
    }

    lines.push(`\n---\n\n## → docs/ROADMAP.md (will be ${existingRoadmap ? "updated" : "created"})\n`)
    lines.push(updatedRoadmap)

    lines.push(`\n---\n\n> Call again with \`dry_run: false\` to write these files.`)
    return lines.join("\n")
  }

  // ── Write files ───────────────────────────────────────────────────────────────
  const lines: string[] = []
  lines.push(`# Workflow: Epic — ${epicName}`)
  lines.push(`> Started at ${new Date().toISOString()}\n`)

  const epicFilePath = await writeDoc(directory, `${epicsDir}/${slug}.md`, formatDoc("Epic", epicName, epicDef))
  lines.push(`   ✓ Epic written → ${epicFilePath}`)

  if (overviewContent) {
    const overviewFilePath = await writeDoc(directory, overviewPath, overviewContent)
    lines.push(`   ✓ Overview created → ${overviewFilePath}`)
  }

  const roadmapFilePath = await writeDoc(directory, roadmapPath, updatedRoadmap)
  lines.push(`   ✓ Roadmap updated → ${roadmapFilePath}`)

  lines.push(`\n## Done ✓`)
  lines.push(`Generated:`)
  lines.push(`  - ${epicsDir}/${slug}.md`)
  if (overviewContent) lines.push(`  - ${overviewPath} (created)`)
  lines.push(`  - ${roadmapPath}`)
  lines.push(`\nReview the epic, then use \`workflow_feature\` for each feature you want to implement.`)

  return lines.join("\n")
}
