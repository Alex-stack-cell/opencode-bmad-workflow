import { tool } from "@opencode-ai/plugin"
import { runAgentSession, withSession } from "../utils/session.ts"
import { writeDoc, readDoc, timestamp, formatDoc } from "../utils/files.ts"
import { rm } from "node:fs/promises"
import { join } from "node:path"
import type { WorkflowCtx, WorkflowRunCtx } from "../types/workflow.ts"

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const meta = {
  name: "workflow_feature_save",
  summary: "New feature",
  chain: "PM (PRD) → Architect (architecture) → PM (tasks) → updates docs/",
  generates: "ai-artifacts/[feature]/PRD.md, ARCHITECTURE.md, TASKS.md + docs/",
}

// ─── Tool factories ───────────────────────────────────────────────────────────

export function createFeaturePreviewTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Feature workflow — Step 1/2: Generate PRD, architecture, and tasks, then write them to ai-artifacts/.previews/ for the user to review and edit. Always call this before workflow_feature_save. IMPORTANT: Never call this tool without explicit feature_name and feature_description provided by the user.",
    args: {
      feature_name: tool.schema.string().describe("Short feature name explicitly provided by the user. Never invent this."),
      feature_description: tool.schema.string().describe("Detailed description explicitly provided by the user. Never invent this."),
    },
    execute: (args) =>
      withSession(ctx, (runCtx) =>
        runFeaturePreview({ ...runCtx, featureName: args.feature_name, featureDescription: args.feature_description }),
      ),
  })
}

export function createFeatureSaveTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Feature workflow — Step 2/2: Save the feature docs to their final locations. Reads from ai-artifacts/.previews/ if a preview exists (preserving user edits), otherwise generates fresh. Call workflow_feature_preview first.",
    args: {
      feature_name: tool.schema.string().describe("Same feature name used in workflow_feature_preview."),
      feature_description: tool.schema.string().describe("Same feature description used in workflow_feature_preview."),
    },
    execute: (args) =>
      withSession(ctx, (runCtx) =>
        runFeatureSave({ ...runCtx, featureName: args.feature_name, featureDescription: args.feature_description }),
      ),
  })
}

// ─── Workflow implementation ──────────────────────────────────────────────────

type FeatureArgs = WorkflowRunCtx & { featureName: string; featureDescription: string }

async function generateFeatureContent(args: FeatureArgs) {
  const { featureName, featureDescription, directory, ...runCtx } = args

  const prd = await runAgentSession({ ...runCtx, directory }, "pm", `
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

  const arch = await runAgentSession({ ...runCtx, directory }, "architect", `
Based on this PRD, design the technical architecture.

${prd}

Produce:
- Component overview
- Data flow
- Key technical decisions & tradeoffs
- File/module structure suggestion
- Risks & mitigations
`.trim())

  const tasks = await runAgentSession({ ...runCtx, directory }, "pm", `
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
  const updatedArch = await runAgentSession({ ...runCtx, directory }, "architect", `
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

  const featureDoc = await runAgentSession({ ...runCtx, directory }, "pm", `
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

  return { prd, arch, tasks, updatedArch, featureDoc, existingArch }
}

async function runFeaturePreview(args: FeatureArgs): Promise<string> {
  const { featureName, directory } = args
  const slug = featureName.toLowerCase().replaceAll(/\s+/g, "-")
  const previewDir = `ai-artifacts/.previews/feature-${slug}`

  const { prd, arch, tasks, updatedArch, featureDoc, existingArch } = await generateFeatureContent(args)

  await writeDoc(directory, `${previewDir}/prd.md`, prd)
  await writeDoc(directory, `${previewDir}/architecture.md`, arch)
  await writeDoc(directory, `${previewDir}/tasks.md`, tasks)
  await writeDoc(directory, `${previewDir}/global-architecture.md`, updatedArch)
  await writeDoc(directory, `${previewDir}/feature-doc.md`, featureDoc)

  return [
    `# Preview ready — Feature: ${featureName}`,
    ``,
    `Open and edit these files freely before finalizing:`,
    `  - ${previewDir}/prd.md → ai-artifacts/[timestamp]-${slug}/PRD.md`,
    `  - ${previewDir}/architecture.md → ai-artifacts/[timestamp]-${slug}/ARCHITECTURE.md`,
    `  - ${previewDir}/tasks.md → ai-artifacts/[timestamp]-${slug}/TASKS.md`,
    `  - ${previewDir}/global-architecture.md → docs/ARCHITECTURE.md (will be ${existingArch ? "updated" : "created"})`,
    `  - ${previewDir}/feature-doc.md → docs/features/${slug}.md`,
    ``,
    `When ready, call \`workflow_feature_save\` with the same arguments to write to their final locations.`,
  ].join("\n")
}

async function runFeatureSave(args: FeatureArgs): Promise<string> {
  const { featureName, directory } = args
  const slug = featureName.toLowerCase().replaceAll(/\s+/g, "-")
  const previewDir = `ai-artifacts/.previews/feature-${slug}`
  const artifactsDir = `ai-artifacts/${timestamp()}-${slug}`

  const previewPrd = await readDoc(directory, `${previewDir}/prd.md`)
  const previewArch = await readDoc(directory, `${previewDir}/architecture.md`)
  const previewTasks = await readDoc(directory, `${previewDir}/tasks.md`)
  const previewGlobalArch = await readDoc(directory, `${previewDir}/global-architecture.md`)
  const previewFeatureDoc = await readDoc(directory, `${previewDir}/feature-doc.md`)
  const hasPreview = !!previewPrd && !!previewArch && !!previewTasks

  let prd: string
  let arch: string
  let tasks: string
  let updatedArch: string
  let featureDoc: string

  if (hasPreview) {
    prd = previewPrd
    arch = previewArch
    tasks = previewTasks
    updatedArch = previewGlobalArch || await readDoc(directory, "docs/ARCHITECTURE.md")
    featureDoc = previewFeatureDoc
  } else {
    const generated = await generateFeatureContent(args)
    prd = generated.prd
    arch = generated.arch
    tasks = generated.tasks
    updatedArch = generated.updatedArch
    featureDoc = generated.featureDoc
  }

  const lines: string[] = []
  lines.push(`# Workflow: ${featureName}`)
  lines.push(`> Started at ${new Date().toISOString()}\n`)
  if (hasPreview) lines.push(`> Loaded from preview (including any edits you made).\n`)

  const prdPath = await writeDoc(directory, `${artifactsDir}/PRD.md`, formatDoc("PRD", featureName, prd))
  lines.push(`   ✓ PRD written → ${prdPath}`)

  const archPath = await writeDoc(directory, `${artifactsDir}/ARCHITECTURE.md`, formatDoc("Architecture", featureName, arch))
  lines.push(`   ✓ Architecture written → ${archPath}`)

  const tasksPath = await writeDoc(directory, `${artifactsDir}/TASKS.md`, formatDoc("Task Breakdown", featureName, tasks))
  lines.push(`   ✓ Tasks written → ${tasksPath}`)

  const globalArchPath = await writeDoc(directory, "docs/ARCHITECTURE.md", updatedArch)
  lines.push(`   ✓ Architecture updated → ${globalArchPath}`)

  const featureDocPath = await writeDoc(directory, `docs/features/${slug}.md`, featureDoc)
  lines.push(`   ✓ Feature doc written → ${featureDocPath}`)

  if (hasPreview) {
    await rm(join(directory, previewDir), { recursive: true, force: true })
    lines.push(`   ✓ Preview cleaned up`)
  }

  lines.push(`\n## Done ✓`)
  lines.push(`Workflow artifacts in \`${artifactsDir}/\`:`)
  lines.push(`  - PRD.md`)
  lines.push(`  - ARCHITECTURE.md`)
  lines.push(`  - TASKS.md`)
  lines.push(`Project documentation updated:`)
  lines.push(`  - docs/ARCHITECTURE.md`)
  lines.push(`  - docs/features/${slug}.md`)
  lines.push(`\nYou can now continue manually or run \`workflow_review_preview\` after implementation.`)

  return lines.join("\n")
}
