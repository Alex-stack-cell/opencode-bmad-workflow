import { tool } from "@opencode-ai/plugin"
import type { WorkflowCtx, WorkflowRunCtx } from "../types/workflow.ts"
import { withSession } from "../session/context.ts"
import { runDevAgentSession } from "../session/agent.ts"
import { readDoc } from "../storage/docs.ts"
import { readQuickTasksLog, generateTaskId, appendQuickTask } from "../storage/quick-tasks.ts"
import { Paths } from "../constants/paths.ts"
import { AgentRole } from "../agents/roles.ts"

// ─── Tool factory ─────────────────────────────────────────────────────────────

export function createTaskTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Quick task workflow: implements a single fix or small feature directly without epic/story ceremony. Evaluates complexity first — escalates to workflow_story_preview if too complex. Logs the task to ai-artifacts/quick-tasks-log.yaml.",
    args: {
      description: tool.schema
        .string()
        .describe("Task description provided by the user. Should be specific and actionable."),
    },
    execute: (args) => withSession(ctx, (runCtx) => runTask({ ...runCtx, description: args.description })),
  })
}

// ─── Workflow implementation ──────────────────────────────────────────────────

type QuickTaskWorkflowArgs = WorkflowRunCtx & { description: string }

function evaluateEscalation(description: string): "simple" | "warn" | "escalate" {
  const text = description.toLowerCase()

  const escalationSignals = [
    /multiple (components|pages|modules|services)/i,
    /\b(architecture|platform|integration|refactor|system)\b/i,
    /\bhow (should|do) i\b/i,
    /\bbest way to\b/i,
    /\bthis week|over the next|several days\b/i,
    /(frontend|ui).+(backend|api|database)/i,
  ]

  const simplicitySignals = [
    /\b(just|quick|fix|bug|typo|simple|small|minor|tweak)\b/i,
    /\bsrc\/|in [a-z0-9/_-]+\.[a-z]+\b/i,
  ]

  const escalationCount = escalationSignals.filter((r) => r.test(text)).length
  const simplicityCount = simplicitySignals.filter((r) => r.test(text)).length

  if (escalationCount >= 3) return "escalate"
  if (escalationCount >= 2 && simplicityCount === 0) return "warn"
  return "simple"
}

async function runTask(args: QuickTaskWorkflowArgs): Promise<string> {
  const { description, directory, ...runCtx } = args

  const existingLog = await readQuickTasksLog(directory)
  const taskId = generateTaskId(existingLog)

  const level = evaluateEscalation(description)

  if (level === "escalate") {
    await appendQuickTask(directory, taskId, description, "escalated", "Escalated to full story workflow")
    return [
      `# Quick Task ${taskId} — Escalation recommended`,
      ``,
      `This task seems too complex for a quick task (multiple components, system-level or multi-layer scope).`,
      ``,
      `**Recommendation:** use \`/workflow-story\` to create a full story with AC and an implementation plan.`,
      ``,
      `If you still want to run it directly, re-run with a more precise and targeted description.`,
    ].join("\n")
  }

  if (level === "warn") {
    return [
      `# Quick Task ${taskId} — Warning`,
      ``,
      `This task might be more complex than expected (multiple complexity signals detected).`,
      ``,
      `**Options:**`,
      `- Continue with \`workflow_task\` if you are sure it is simple`,
      `- Use \`/workflow-story\` for a more structured plan`,
      ``,
      `> Task: ${description}`,
    ].join("\n")
  }

  const conventions = await readDoc(directory, Paths.CONVENTIONS)

  const summary = await runDevAgentSession({ ...runCtx, directory }, AgentRole.DEV, `
You are implementing a quick fix or small feature directly. No story file exists — work from the description below.

## Task
${description}
${conventions ? `\n## Project conventions\n${conventions}\n` : ""}
## Instructions
1. Read the relevant files in the codebase before making changes
2. Implement the fix following existing patterns and the project conventions above
3. Keep the change minimal and focused — do NOT add unrelated improvements
4. Write a 2-3 sentence summary of what you changed and which files were modified

Do NOT create any story files or update sprint-status.yaml.
`.trim())

  await appendQuickTask(directory, taskId, description, "done", summary)

  return [
    `# Quick Task ${taskId} — Done`,
    ``,
    `## What was done`,
    summary,
    ``,
    `## Logged`,
    `  ✓ ai-artifacts/quick-tasks-log.yaml → ${taskId}`,
    ``,
    `If the scope grew, use \`/workflow-story\` to formalize it as a story.`,
    `For a code review: \`/workflow-review\`.`,
  ].join("\n")
}
