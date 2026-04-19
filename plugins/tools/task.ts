import { tool } from "@opencode-ai/plugin"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { WorkflowCtx, WorkflowRunCtx, DevPromptMode } from "../types/workflow.ts"
import { withSession } from "../session/context.ts"
import { runDevAgentSession } from "../session/agent.ts"
import { buildQuickTaskPrompt } from "../session/prompts.ts"
import { readDoc } from "../storage/docs.ts"
import { shrinkConventions } from "../parsers/shrink.ts"
import { checkPromptBudget } from "../parsers/tokens.ts"

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

type TaskArgs = WorkflowRunCtx & { description: string }

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

async function readQuickTasksLog(directory: string): Promise<string> {
  const path = join(directory, "ai-artifacts/quick-tasks-log.yaml")
  try {
    return await readFile(path, "utf-8")
  } catch {
    return ""
  }
}

async function appendQuickTask(
  directory: string,
  taskId: string,
  description: string,
  status: "done" | "escalated",
  summary: string,
): Promise<void> {
  const path = join(directory, "ai-artifacts/quick-tasks-log.yaml")
  const existing = await readQuickTasksLog(directory)
  const date = new Date().toISOString().split("T")[0]

  const entry = [
    `  - id: "${taskId}"`,
    `    date: ${date}`,
    `    description: "${description.replace(/"/g, "'")}"`,
    `    status: ${status}`,
    `    summary: "${summary.replace(/"/g, "'").replace(/\n/g, " ").slice(0, 200)}"`,
  ].join("\n")

  const updated = existing
    ? existing.trimEnd() + "\n" + entry + "\n"
    : `quick_tasks:\n${entry}\n`

  await writeFile(path, updated, "utf-8")
}

function generateTaskId(existing: string): string {
  const matches = [...existing.matchAll(/id: "QT-(\d+)"/g)]
  const max = matches.reduce((acc, m) => Math.max(acc, parseInt(m[1], 10)), 0)
  return `QT-${String(max + 1).padStart(3, "0")}`
}

async function runTask(args: TaskArgs): Promise<string> {
  const { description, directory, config, ...runCtx } = args

  const existingLog = await readQuickTasksLog(directory)
  const taskId = generateTaskId(existingLog)

  const level = evaluateEscalation(description)

  if (level === "escalate") {
    await appendQuickTask(directory, taskId, description, "escalated", "Escalated to full story workflow")
    return [
      `# Quick Task ${taskId} — Escalation recommended`,
      ``,
      `This task seems too complex for a quick task (multiple components, system scope, or cross-layer).`,
      ``,
      `**Recommendation:** use \`/workflow-story\` to create a full story with AC and an implementation plan.`,
      ``,
      `If you still want to run it directly, rerun with a more precise and targeted description.`,
    ].join("\n")
  }

  if (level === "warn") {
    return [
      `# Quick Task ${taskId} — Warning`,
      ``,
      `This task may be more complex than expected (multiple complexity signals detected).`,
      ``,
      `**Options:**`,
      `- Rerun \`workflow_task\` if you are sure it is simple`,
      `- Use \`/workflow-story\` for a more structured plan`,
      ``,
      `> Task: ${description}`,
    ].join("\n")
  }

  const rawConventions = (await readDoc(directory, "ai-artifacts/conventions.md")) || ""
  const mode: DevPromptMode = config.localModel ? "local" : "frontier"
  const conventions = config.localModel ? shrinkConventions({ conventions: rawConventions }) : rawConventions

  const prompt = buildQuickTaskPrompt({ description, conventions, mode })
  const budget = checkPromptBudget(prompt, config.contextBudget)

  if (!budget.ok && config.localModel) {
    return [
      `# Quick Task ${taskId} — Aborted (prompt over budget)`,
      ``,
      `Estimated prompt: ${budget.estimatedTokens} tokens (budget ${config.contextBudget}, soft cap 60%).`,
      ``,
      `Shorten the task description, raise \`contextBudget\`, or disable local mode.`,
    ].join("\n")
  }

  const summary = await runDevAgentSession(
    { ...runCtx, directory, config },
    "dev",
    prompt,
    { disableFileTools: config.localModel },
  )

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
