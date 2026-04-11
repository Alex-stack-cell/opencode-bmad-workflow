import { tool } from "@opencode-ai/plugin"
import { runAgentSession, withSession } from "../utils/session.ts"
import { writeDoc, readDoc, timestamp, formatDoc } from "../utils/files.ts"
import { rm } from "node:fs/promises"
import { join } from "node:path"
import type { WorkflowCtx, WorkflowRunCtx } from "../types/workflow.ts"

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
      "Code review workflow: Analyst investigates → Reviewer writes the report. Pass dry_run: true to write a preview to ai-artifacts/.previews/ for review before committing.",
    args: {
      scope: tool.schema
        .string()
        .optional()
        .describe("File or folder path to review (e.g. 'src/components/Button'). Leave empty to use the current git diff."),
      dry_run: tool.schema
        .boolean()
        .optional()
        .describe("If true, write a preview to ai-artifacts/.previews/ without touching real files. The user can edit the preview, then call again with dry_run: false to finalize. Default: false."),
    },
    execute: (args) =>
      withSession(ctx, (runCtx) =>
        runReviewWorkflow({
          ...runCtx,
          scope: args.scope,
          dryRun: args.dry_run ?? false,
        }),
      ),
  })
}

// ─── Workflow implementation ──────────────────────────────────────────────────

type ReviewArgs = WorkflowRunCtx & { scope?: string; dryRun: boolean }

async function runReviewWorkflow({ scope, dryRun, ...runCtx }: ReviewArgs): Promise<string> {
  const { directory } = runCtx
  const scopeLabel = scope ?? "full diff"
  const slug = (scope ?? "full-diff").toLowerCase().replaceAll(/[^a-z0-9]/g, "-").replaceAll(/-+/g, "-")
  const previewDir = `ai-artifacts/.previews/review-${slug}`

  // ── Check for existing preview (user may have edited it) ──────────────────────
  const previewAnalysis = await readDoc(directory, `${previewDir}/analysis.md`)
  const previewReview = await readDoc(directory, `${previewDir}/review.md`)
  const hasPreview = !!previewAnalysis && !!previewReview

  // ── Generate or reuse content ─────────────────────────────────────────────────
  let analysis: string
  let review: string

  if (!dryRun && hasPreview) {
    analysis = previewAnalysis
    review = previewReview
  } else {
    analysis = await runAgentSession(runCtx, "analyst", `
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

    review = await runAgentSession(runCtx, "reviewer", `
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
  }

  // ── Dry run: write preview files ──────────────────────────────────────────────
  if (dryRun) {
    const docsDir = `ai-artifacts/review-[date]`
    await writeDoc(directory, `${previewDir}/analysis.md`, analysis)
    await writeDoc(directory, `${previewDir}/review.md`, review)

    return [
      `# Preview ready — Code Review: ${scopeLabel}`,
      ``,
      `Open and edit these files freely before finalizing:`,
      `  - ${previewDir}/analysis.md → ${docsDir}/ANALYSIS.md`,
      `  - ${previewDir}/review.md → ${docsDir}/REVIEW.md`,
      ``,
      `When ready, call \`workflow_review\` again with the same arguments and \`dry_run: false\` to save to their final locations.`,
    ].join("\n")
  }

  // ── Write real files ──────────────────────────────────────────────────────────
  const docsDir = `ai-artifacts/review-${timestamp()}`
  const lines: string[] = []
  lines.push(`# Workflow: Code Review`)
  lines.push(`> Started at ${new Date().toISOString()}\n`)

  if (hasPreview) lines.push(`> Loaded from preview (including any edits you made).\n`)

  const analysisPath = await writeDoc(directory, `${docsDir}/ANALYSIS.md`, formatDoc("Code Analysis", scopeLabel, analysis))
  lines.push(`   ✓ Analysis written → ${analysisPath}`)

  const reviewPath = await writeDoc(directory, `${docsDir}/REVIEW.md`, formatDoc("Code Review Report", scopeLabel, review))
  lines.push(`   ✓ Review written → ${reviewPath}`)

  if (hasPreview) {
    await rm(join(directory, previewDir), { recursive: true, force: true })
    lines.push(`   ✓ Preview cleaned up`)
  }

  lines.push(`\n## Done ✓`)
  lines.push(`Generated docs in \`${docsDir}/\`:`)
  lines.push(`  - ANALYSIS.md`)
  lines.push(`  - REVIEW.md`)

  return lines.join("\n")
}
