import { tool } from "@opencode-ai/plugin"
import { rm } from "node:fs/promises"
import { join } from "node:path"
import type { WorkflowCtx, WorkflowRunCtx } from "../types/workflow.ts"
import { withSession } from "../session/context.ts"
import { runAgentSession } from "../session/agent.ts"
import { readDoc, writeDoc } from "../storage/docs.ts"
import { slugify } from "../parsers/slugify.ts"

// ─── Tool factories ───────────────────────────────────────────────────────────

export function createReviewPreviewTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Code review workflow — Step 1/2: Analyst investigates, Reviewer writes a report, then both are written to ai-artifacts/.previews/ for the user to review and annotate. Always call this before workflow_review_save.",
    args: {
      scope: tool.schema.string().optional().describe("File or folder path to review (e.g. 'src/components/Button'). Leave empty to use the current git diff."),
    },
    execute: (args) =>
      withSession(ctx, (runCtx) =>
        runReviewPreview({ ...runCtx, scope: args.scope }),
      ),
  })
}

export function createReviewSaveTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Code review workflow — Step 2/2: Save the review docs to their final locations. Reads from ai-artifacts/.previews/ if a preview exists (preserving user annotations), otherwise generates fresh. Call workflow_review_preview first.",
    args: {
      scope: tool.schema.string().optional().describe("Same scope used in workflow_review_preview."),
    },
    execute: (args) =>
      withSession(ctx, (runCtx) =>
        runReviewSave({ ...runCtx, scope: args.scope }),
      ),
  })
}

// ─── Workflow implementation ──────────────────────────────────────────────────

type ReviewArgs = WorkflowRunCtx & { scope?: string }

async function generateReviewContent(args: ReviewArgs) {
  const { scope, directory, ...runCtx } = args

  const analysis = await runAgentSession({ ...runCtx, directory }, "analyst", `
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

  const review = await runAgentSession({ ...runCtx, directory }, "reviewer", `
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

  return { analysis, review }
}

async function runReviewPreview(args: ReviewArgs): Promise<string> {
  const { scope, directory } = args
  const scopeLabel = scope ?? "full diff"
  const slug = slugify(scope ?? "full-diff")
  const previewDir = `ai-artifacts/.previews/review-${slug}`

  const { analysis, review } = await generateReviewContent(args)

  await writeDoc(directory, `${previewDir}/analysis.md`, analysis)
  await writeDoc(directory, `${previewDir}/review.md`, review)

  return [
    `# Preview ready — Code Review: ${scopeLabel}`,
    ``,
    `Open and annotate these files freely before finalizing:`,
    `  - ${previewDir}/analysis.md → ai-artifacts/planning-artifacts/review-${slug}/ANALYSIS.md`,
    `  - ${previewDir}/review.md → ai-artifacts/planning-artifacts/review-${slug}/REVIEW.md`,
    ``,
    `When ready, call \`workflow_review_save\` with the same arguments to write to their final locations.`,
  ].join("\n")
}

async function runReviewSave(args: ReviewArgs): Promise<string> {
  const { scope, directory } = args
  const scopeLabel = scope ?? "full diff"
  const slug = slugify(scope ?? "full-diff")
  const previewDir = `ai-artifacts/.previews/review-${slug}`
  const docsDir = `ai-artifacts/planning-artifacts/review-${slug}`

  const previewAnalysis = await readDoc(directory, `${previewDir}/analysis.md`)
  const previewReview = await readDoc(directory, `${previewDir}/review.md`)
  const hasPreview = !!previewAnalysis && !!previewReview

  let analysis: string
  let review: string

  if (hasPreview) {
    analysis = previewAnalysis
    review = previewReview
  } else {
    const generated = await generateReviewContent(args)
    analysis = generated.analysis
    review = generated.review
  }

  const lines: string[] = []
  lines.push(`# Workflow: Code Review`)
  lines.push(`> Started at ${new Date().toISOString()}\n`)
  if (hasPreview) lines.push(`> Loaded from preview (including any edits you made).\n`)

  const analysisPath = await writeDoc(directory, `${docsDir}/ANALYSIS.md`, analysis)
  lines.push(`   ✓ Analysis written → ${analysisPath}`)

  const reviewPath = await writeDoc(directory, `${docsDir}/REVIEW.md`, review)
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
