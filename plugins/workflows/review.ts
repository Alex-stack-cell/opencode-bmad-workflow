import type { OpencodeClient } from "@opencode-ai/sdk"
import { runAgentSession } from "../utils/session.ts"
import { writeDoc, timestamp, formatDoc } from "../utils/files.ts"

export interface ReviewWorkflowOptions {
  client: OpencodeClient
  sessionId: string
  directory: string
  scope?: string // e.g. "src/components/Button" or leave empty for full diff
}

export async function runReviewWorkflow(opts: ReviewWorkflowOptions): Promise<string> {
  const { client, sessionId, directory, scope } = opts
  const ts = timestamp()
  const docsDir = `.workflow/review-${ts}`
  const lines: string[] = []

  lines.push(`# Workflow: Code Review`)
  lines.push(`> Started at ${new Date().toISOString()}\n`)

  // ─── Step 1: Analyst → Deep analysis ───────────────────────────────────────
  lines.push("## Step 1/2 — Analyst: Investigating code...")
  const analystPrompt = `
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
`.trim()

  const analysis = await runAgentSession(client, sessionId, directory, "analyst", analystPrompt)
  const analysisPath = await writeDoc(
    directory,
    `${docsDir}/ANALYSIS.md`,
    formatDoc("Code Analysis", scope ?? "full diff", analysis),
  )
  lines.push(`   ✓ Analysis written → ${analysisPath}`)

  // ─── Step 2: Reviewer → Review report ──────────────────────────────────────
  lines.push("## Step 2/2 — Reviewer: Writing review report...")
  const reviewPrompt = `
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
`.trim()

  const review = await runAgentSession(client, sessionId, directory, "reviewer", reviewPrompt)
  const reviewPath = await writeDoc(
    directory,
    `${docsDir}/REVIEW.md`,
    formatDoc("Code Review Report", scope ?? "full diff", review),
  )
  lines.push(`   ✓ Review written → ${reviewPath}`)

  lines.push(`\n## Done ✓`)
  lines.push(`Generated docs in \`${docsDir}/\`:`)
  lines.push(`  - ANALYSIS.md`)
  lines.push(`  - REVIEW.md`)

  return lines.join("\n")
}

