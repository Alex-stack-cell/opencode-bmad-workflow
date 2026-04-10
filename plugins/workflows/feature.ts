import { tool } from "@opencode-ai/plugin"
import type { OpencodeClient } from "@opencode-ai/sdk"
import { runAgentSession, getCurrentSessionId } from "../utils/session.ts"
import { writeDoc, timestamp, formatDoc } from "../utils/files.ts"
import type { WorkflowCtx } from "../utils/types.ts"

export const meta = {
  name: "workflow_feature",
  summary: "New feature",
  chain: "PM (PRD) → Architect (architecture) → PM (tasks)",
  generates: ".workflow/[feature]/PRD.md, ARCHITECTURE.md, TASKS.md",
}

export function createFeatureTool(ctx: WorkflowCtx) {
  const { client, directory } = ctx
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
    async execute(args) {
      const sessionId = await getCurrentSessionId(client, directory)
      return runFeatureWorkflow({ client, sessionId, directory, featureName: args.feature_name, featureDescription: args.feature_description })
    },
  })
}

async function runFeatureWorkflow(opts: {
  client: OpencodeClient
  sessionId: string
  directory: string
  featureName: string
  featureDescription: string
}): Promise<string> {
  const { client, sessionId, directory, featureName, featureDescription } = opts
  const docsDir = `.workflow/${timestamp()}-${featureName.toLowerCase().replace(/\s+/g, "-")}`
  const lines: string[] = []

  lines.push(`# Workflow: ${featureName}`)
  lines.push(`> Started at ${new Date().toISOString()}\n`)

  lines.push("## Step 1/3 — PM: Writing PRD...")
  const pmPrompt = `
Write a complete PRD for the following feature using BMAD methodology.

Feature: ${featureName}
Description: ${featureDescription}

Include:
- Overview & goals
- User stories (As a / I want / So that)
- Acceptance criteria (Given/When/Then)
- Out of scope
- Technical notes
`.trim()

  const prd = await runAgentSession(client, sessionId, directory, "pm", pmPrompt)
  const prdPath = await writeDoc(directory, `${docsDir}/PRD.md`, formatDoc("PRD", featureName, prd))
  lines.push(`   ✓ PRD written → ${prdPath}`)

  lines.push("## Step 2/3 — Architect: Designing architecture...")
  const archPrompt = `
Based on this PRD, design the technical architecture.

${prd}

Produce:
- Component overview
- Data flow
- Key technical decisions & tradeoffs
- File/module structure suggestion
- Risks & mitigations
`.trim()

  const arch = await runAgentSession(client, sessionId, directory, "architect", archPrompt)
  const archPath = await writeDoc(directory, `${docsDir}/ARCHITECTURE.md`, formatDoc("Architecture", featureName, arch))
  lines.push(`   ✓ Architecture written → ${archPath}`)

  lines.push("## Step 3/3 — PM: Breaking down tasks...")
  const tasksPrompt = `
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
`.trim()

  const tasks = await runAgentSession(client, sessionId, directory, "pm", tasksPrompt)
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
