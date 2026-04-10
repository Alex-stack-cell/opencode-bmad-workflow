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
  chain: "PM (scope) → updates docs/OVERVIEW.md",
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
      "Automated epic workflow: PM defines scope and goals. Updates docs/OVERVIEW.md. IMPORTANT: Never call this tool without explicit epic_name and epic_goal provided by the user. If either is missing, ask the user before calling.",
    args: {
      epic_name: tool.schema
        .string()
        .describe("Short epic name explicitly provided by the user (e.g. 'User Authentication'). Never invent this."),
      epic_goal: tool.schema
        .string()
        .describe("Business goal explicitly provided by the user. Never invent this."),
    },
    execute: (args) =>
      withSession(ctx, (runCtx) =>
        runEpicWorkflow({ ...runCtx, epicName: args.epic_name, epicGoal: args.epic_goal }),
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

type EpicArgs = WorkflowRunCtx & { epicName: string; epicGoal: string }

async function runEpicWorkflow({ epicName, epicGoal, ...runCtx }: EpicArgs): Promise<string> {
  const { directory } = runCtx
  const slug = epicName.toLowerCase().replace(/\s+/g, "-")
  const epicsDir = `ai-artifacts/epics`
  const overviewPath = `docs/OVERVIEW.md`
  const lines: string[] = []

  lines.push(`# Workflow: Epic — ${epicName}`)
  lines.push(`> Started at ${new Date().toISOString()}\n`)

  // ── Step 1: PM defines the epic ──────────────────────────────────────────────
  lines.push("## PM: Defining epic scope...")
  const epicDef = await runAgentSession(runCtx, "pm", `
Define a high-level epic using BMAD methodology.

Epic name: ${epicName}
Goal: ${epicGoal}

Include:
- Epic title and one-line description
- Business value and strategic goal
- High-level list of potential features (not detailed, not exhaustive)
- Success metrics (how do we know the epic is done?)
- Dependencies on other epics
- Rough effort estimate (weeks/sprints)
- Priority (HIGH / MEDIUM / LOW)
`.trim())
  const epicFilePath = await writeDoc(directory, `${epicsDir}/${slug}.md`, formatDoc("Epic", epicName, epicDef))
  lines.push(`   ✓ Epic written → ${epicFilePath}`)

  // ── Step 2: Update docs/OVERVIEW.md ─────────────────────────
  lines.push("## Updating project documentation...")
  const existingOverview = await readDoc(directory, overviewPath)
  const updatedOverview = await runAgentSession(runCtx, "pm", `
Update the project overview document to include this new epic.

${existingOverview
  ? `Existing OVERVIEW.md:\n${existingOverview}\n\n---\n\nAdd or update the section for this epic. Keep all existing content intact.`
  : `No overview exists yet. Create a project overview document from scratch.`}

New epic:
${epicDef}

The document should:
- Start with a brief project overview (what this project is, its purpose)
- List all epics with their status, priority, and one-line description
- Be concise and useful for a new developer joining the project
`.trim())
  const overviewFilePath = await writeDoc(directory, overviewPath, updatedOverview)
  lines.push(`   ✓ Overview updated → ${overviewFilePath}`)

  lines.push(`\n## Done ✓`)
  lines.push(`Generated:`)
  lines.push(`  - ${epicsDir}/${slug}.md`)
  lines.push(`  - ${overviewPath}`)
  lines.push(`\nReview the epic, then use \`workflow_feature\` for each feature you want to implement.`)

  return lines.join("\n")
}
