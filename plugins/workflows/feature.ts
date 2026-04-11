import { tool } from "@opencode-ai/plugin"
import { runAgentSession, withSession } from "../utils/session.ts"
import { writeDoc, readDoc, timestamp, formatDoc } from "../utils/files.ts"
import type { WorkflowCtx, WorkflowRunCtx } from "../types/workflow.ts"

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const meta = {
  name: "workflow_feature",
  summary: "New feature",
  chain: "PM (PRD) → Architect (architecture) → PM (tasks) → updates docs/",
  generates: "ai-artifacts/[feature]/PRD.md, ARCHITECTURE.md, TASKS.md + docs/",
}

// ─── Tool factory ─────────────────────────────────────────────────────────────

export function createFeatureTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Feature workflow: PM writes PRD → Architect designs architecture → PM breaks down tasks. Updates docs/. Pass dry_run: true to preview generated content before writing. IMPORTANT: Never call this tool without explicit feature_name and feature_description provided by the user.",
    args: {
      feature_name: tool.schema
        .string()
        .describe("Short feature name explicitly provided by the user. Never invent this."),
      feature_description: tool.schema
        .string()
        .describe("Detailed description explicitly provided by the user. Never invent this."),
      dry_run: tool.schema
        .boolean()
        .optional()
        .describe("If true, generate and return a preview without writing any files. Default: false."),
    },
    execute: (args) =>
      withSession(ctx, (runCtx) =>
        runFeatureWorkflow({
          ...runCtx,
          featureName: args.feature_name,
          featureDescription: args.feature_description,
          dryRun: args.dry_run ?? false,
        }),
      ),
  })
}

// ─── Workflow implementation ──────────────────────────────────────────────────

type FeatureArgs = WorkflowRunCtx & { featureName: string; featureDescription: string; dryRun: boolean }

async function runFeatureWorkflow({ featureName, featureDescription, dryRun, ...runCtx }: FeatureArgs): Promise<string> {
  const { directory } = runCtx
  const slug = featureName.toLowerCase().replace(/\s+/g, "-")
  const docsDir = `ai-artifacts/${timestamp()}-${slug}`

  // ── Generate all content ──────────────────────────────────────────────────────
  const prd = await runAgentSession(runCtx, "pm", `
Write a complete PRD for the following feature using BMAD methodology.

Feature: ${featureName}
Description: ${featureDescription}

Include:
- Overview & goals
- User stories (As a / I want / So that)
- Acceptance criteria (Given/When/Then)
- Out of scope
- Technical notes
`.trim())

  const arch = await runAgentSession(runCtx, "architect", `
Based on this PRD, design the technical architecture.

${prd}

Produce:
- Component overview
- Data flow
- Key technical decisions & tradeoffs
- File/module structure suggestion
- Risks & mitigations
`.trim())

  const tasks = await runAgentSession(runCtx, "pm", `
Based on this PRD and architecture, create a detailed task breakdown.

PRD:
${prd}

Architecture:
${arch}

Format as a numbered task list with:
- Task title
- Description (2-3 lines)
- Estimated effort (S/M/L)
- Dependencies (if any)
- Best suited agent (frontend / architect / reviewer / analyst)
`.trim())

  const existingArch = await readDoc(directory, "docs/ARCHITECTURE.md")
  const updatedArch = await runAgentSession(runCtx, "architect", `
Update the global architecture document to include decisions made for this feature.

${existingArch
  ? `Existing ARCHITECTURE.md:\n${existingArch}\n\n---\n\nAdd a section for this feature. Keep all existing content intact.`
  : `No architecture document exists yet. Create one from scratch.`}

Feature architecture:
${arch}

The document should:
- Give a global view of the system architecture
- Have one section per feature with key decisions and tradeoffs
- Be useful for a new developer understanding the codebase
`.trim())

  const featureDoc = await runAgentSession(runCtx, "pm", `
Write a concise feature documentation page for a developer reference guide.

Feature: ${featureName}
PRD:
${prd}

Architecture:
${arch}

Include:
- One-paragraph description of what this feature does and why
- Key user stories (condensed)
- Technical summary (how it works, key components)
- Acceptance criteria (condensed)
`.trim())

  // ── Dry run: return preview without writing ───────────────────────────────────
  if (dryRun) {
    const lines: string[] = []
    lines.push(`# Preview — Feature: ${featureName}`)
    lines.push(`> This is a dry run. No files have been written.\n`)

    lines.push(`## → ${docsDir}/PRD.md\n`)
    lines.push(prd)
    lines.push(`\n---\n\n## → ${docsDir}/ARCHITECTURE.md\n`)
    lines.push(arch)
    lines.push(`\n---\n\n## → ${docsDir}/TASKS.md\n`)
    lines.push(tasks)
    lines.push(`\n---\n\n## → docs/ARCHITECTURE.md (will be ${existingArch ? "updated" : "created"})\n`)
    lines.push(updatedArch)
    lines.push(`\n---\n\n## → docs/features/${slug}.md\n`)
    lines.push(featureDoc)

    lines.push(`\n---\n\n> Call again with \`dry_run: false\` to write these files.`)
    return lines.join("\n")
  }

  // ── Write files ───────────────────────────────────────────────────────────────
  const lines: string[] = []
  lines.push(`# Workflow: ${featureName}`)
  lines.push(`> Started at ${new Date().toISOString()}\n`)

  const prdPath = await writeDoc(directory, `${docsDir}/PRD.md`, formatDoc("PRD", featureName, prd))
  lines.push(`   ✓ PRD written → ${prdPath}`)

  const archPath = await writeDoc(directory, `${docsDir}/ARCHITECTURE.md`, formatDoc("Architecture", featureName, arch))
  lines.push(`   ✓ Architecture written → ${archPath}`)

  const tasksPath = await writeDoc(directory, `${docsDir}/TASKS.md`, formatDoc("Task Breakdown", featureName, tasks))
  lines.push(`   ✓ Tasks written → ${tasksPath}`)

  const globalArchPath = await writeDoc(directory, "docs/ARCHITECTURE.md", updatedArch)
  lines.push(`   ✓ Architecture updated → ${globalArchPath}`)

  const featureDocPath = await writeDoc(directory, `docs/features/${slug}.md`, featureDoc)
  lines.push(`   ✓ Feature doc written → ${featureDocPath}`)

  lines.push(`\n## Done ✓`)
  lines.push(`Workflow artifacts in \`${docsDir}/\`:`)
  lines.push(`  - PRD.md`)
  lines.push(`  - ARCHITECTURE.md`)
  lines.push(`  - TASKS.md`)
  lines.push(`Project documentation updated:`)
  lines.push(`  - docs/ARCHITECTURE.md`)
  lines.push(`  - docs/features/${slug}.md`)
  lines.push(`\nYou can now continue manually or run \`workflow_review\` after implementation.`)

  return lines.join("\n")
}
