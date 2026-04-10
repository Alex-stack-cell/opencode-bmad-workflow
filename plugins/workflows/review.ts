import { tool } from "@opencode-ai/plugin"
import { runAgentSession, withSession } from "../utils/session.ts"
import { writeDoc, timestamp, formatDoc } from "../utils/files.ts"
import type { WorkflowCtx, WorkflowRunCtx } from "../utils/types.ts"

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const meta = {
  name: "workflow_review",
  summary: "Code review",
  chain: "Analyst (analysis) → Reviewer (report)",
  generates: "ai-artifacts/review-[date]/ANALYSIS.md, REVIEW.md",
}

// ─── Tool factory ─────────────────────────────────────────────────────────────

export function createReviewTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Automated code review workflow: Analyst investigates → Reviewer writes the report. Docs saved in ai-artifacts/",
    args: {
      scope: tool.schema
        .string()
        .optional()
        .describe("File or folder path to review (e.g. 'src/components/Button'). Leave empty to use the current git diff."),
    },
    execute: (args) =>
      withSession(ctx, (runCtx) =>
        runReviewWorkflow({ ...runCtx, scope: args.scope }),
      ),
  })
}

// ─── Workflow implementation ──────────────────────────────────────────────────

type ReviewArgs = WorkflowRunCtx & { scope?: string }

async function runReviewWorkflow({ scope, ...runCtx }: ReviewArgs): Promise<string> {
  const { directory } = runCtx
  const docsDir = `ai-artifacts/review-${timestamp()}`
  const scopeLabel = scope ?? "full diff"
  const lines: string[] = []

  lines.push(`# Workflow: Code Review`)
  lines.push(`> Started at ${new Date().toISOString()}\n`)

  lines.push("## Step 1/2 — Analyst: Investigating code...")
  const analysis = await runAgentSession(runCtx, "analyst", `
Perform a deep technical analysis of the following code scope.
${scope ? `Scope: ${scope}` : "Scope: the current git diff / recent changes"}

Look for:
- Logic errors and edge cases
- Performance issues
- Complexity hotspots
- Security concerns
- Missing error handling
- Test coverage gaps

Be thorough and methodical. List all findings with file references.
`.trim())
  const analysisPath = await writeDoc(directory, `${docsDir}/ANALYSIS.md`, formatDoc("Code Analysis", scopeLabel, analysis))
  lines.push(`   ✓ Analysis written → ${analysisPath}`)

  lines.push("## Step 2/2 — Reviewer: Writing review report...")
  const review = await runAgentSession(runCtx, "reviewer", `
Based on this technical analysis, write a structured code review report.

Analysis:
${analysis}

Format the report with:
- CRITICAL issues (must fix before merge)
- HIGH issues (should fix)
- MEDIUM issues (consider fixing)
- LOW issues (suggestions)
- APPROVED / CHANGES REQUESTED verdict
- Summary of strengths
`.trim())
  const reviewPath = await writeDoc(directory, `${docsDir}/REVIEW.md`, formatDoc("Code Review Report", scopeLabel, review))
  lines.push(`   ✓ Review written → ${reviewPath}`)

  lines.push(`\n## Done ✓`)
  lines.push(`Generated docs in \`${docsDir}/\`:`)
  lines.push(`  - ANALYSIS.md`)
  lines.push(`  - REVIEW.md`)

  return lines.join("\n")
}
