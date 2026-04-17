import { tool } from "@opencode-ai/plugin"
import type { WorkflowCtx, WorkflowRunCtx } from "../types/workflow.ts"
import { withSession } from "../session/context.ts"
import { readSprintStatus } from "../storage/sprint.ts"

// ─── Tool factory ─────────────────────────────────────────────────────────────

export function createStatusTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Show the current project status: all epics and their stories with statuses from sprint-status.yaml. Use this to get an overview before planning a sprint or creating a story.",
    args: {},
    execute: () => withSession(ctx, runStatus),
  })
}

// ─── Workflow implementation ──────────────────────────────────────────────────

async function runStatus(runCtx: WorkflowRunCtx): Promise<string> {
  const { directory } = runCtx
  const yaml = await readSprintStatus(directory)

  if (!yaml) {
    return [
      "# Project Status",
      "",
      "No epics yet. Use `workflow_epic_preview` to create your first epic.",
    ].join("\n")
  }

  return ["# Project Status\n", "```yaml", yaml, "```"].join("\n")
}
