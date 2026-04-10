import { tool } from "@opencode-ai/plugin"
import { runAgentSession, withSession } from "../utils/session.ts"
import { writeDoc, timestamp, formatDoc } from "../utils/files.ts"
import type { WorkflowCtx, WorkflowRunCtx } from "../utils/types.ts"

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const meta = {
  name: "workflow_feature",
  summary: "New feature",
  chain: "PM (PRD) → Architect (architecture) → PM (tasks)",
  generates: ".workflow/[feature]/PRD.md, ARCHITECTURE.md, TASKS.md",
}

// ─── Tool factory ─────────────────────────────────────────────────────────────

export function createFeatureTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Automated feature workflow: PM writes PRD → Architect designs architecture → PM breaks down tasks. Docs saved in .workflow/. IMPORTANT: Never call this tool without explicit feature_name and feature_description provided by the user. If either is missing, ask the user before calling.",
    args: {
      feature_name: tool.schema
        .string()
        .describe("Short feature name explicitly provided by the user. Never invent this."),
      feature_description: tool.schema
        .string()
        .describe("Detailed description explicitly provided by the user. Never invent this."),
    },
    execute: (args) =>
      withSession(ctx, (runCtx) =>
        runFeatureWorkflow({ ...runCtx, featureName: args.feature_name, featureDescription: args.feature_description }),
      ),
  })
}

// ─── Workflow implementation ──────────────────────────────────────────────────

type FeatureArgs = WorkflowRunCtx & { featureName: string; featureDescription: string }

async function runFeatureWorkflow({ featureName, featureDescription, ...runCtx }: FeatureArgs): Promise<string> {
  const { directory } = runCtx
  const docsDir = `.workflow/${timestamp()}-${featureName.toLowerCase().replace(/\s+/g, "-")}`
  const lines: string[] = []

  lines.push(`# Workflow: ${featureName}`)
  lines.push(`> Started at ${new Date().toISOString()}\n`)

  lines.push("## Step 1/3 — PM: Writing PRD...")
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
  const prdPath = await writeDoc(directory, `${docsDir}/PRD.md`, formatDoc("PRD", featureName, prd))
  lines.push(`   ✓ PRD written → ${prdPath}`)

  lines.push("## Step 2/3 — Architect: Designing architecture...")
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
  const archPath = await writeDoc(directory, `${docsDir}/ARCHITECTURE.md`, formatDoc("Architecture", featureName, arch))
  lines.push(`   ✓ Architecture written → ${archPath}`)

  lines.push("## Step 3/3 — PM: Breaking down tasks...")
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
  const tasksPath = await writeDoc(directory, `${docsDir}/TASKS.md`, formatDoc("Task Breakdown", featureName, tasks))
  lines.push(`   ✓ Tasks written → ${tasksPath}`)

  lines.push(`\n## Done ✓`)
  lines.push(`Generated docs in \`${docsDir}/\`:`)
  lines.push(`  - PRD.md`)
  lines.push(`  - ARCHITECTURE.md`)
  lines.push(`  - TASKS.md`)
  lines.push(`\nYou can now continue manually or run \`workflow_review\` after implementation.`)

  return lines.join("\n")
}
