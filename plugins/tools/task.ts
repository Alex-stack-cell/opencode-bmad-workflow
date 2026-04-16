import { tool } from "@opencode-ai/plugin"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { WorkflowCtx, WorkflowRunCtx } from "../types/workflow.ts"
import { withSession } from "../session/context.ts"
import { runDevAgentSession } from "../session/agent.ts"
import { readDoc } from "../storage/docs.ts"

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
  const { description, directory, ...runCtx } = args

  const existingLog = await readQuickTasksLog(directory)
  const taskId = generateTaskId(existingLog)

  const level = evaluateEscalation(description)

  if (level === "escalate") {
    await appendQuickTask(directory, taskId, description, "escalated", "Escalated to full story workflow")
    return [
      `# Quick Task ${taskId} — Escalation recommandée`,
      ``,
      `Cette tâche semble trop complexe pour un quick task (plusieurs composants, scope système ou multi-couche).`,
      ``,
      `**Recommandation :** utilise \`/workflow-story\` pour créer une story complète avec AC et plan d'implémentation.`,
      ``,
      `Si tu veux quand même l'exécuter directement, relance avec une description plus précise et ciblée.`,
    ].join("\n")
  }

  if (level === "warn") {
    return [
      `# Quick Task ${taskId} — Attention`,
      ``,
      `Cette tâche pourrait être plus complexe que prévu (plusieurs signaux de complexité détectés).`,
      ``,
      `**Options :**`,
      `- Continue avec \`workflow_task_confirm\` si tu es sûr que c'est simple`,
      `- Utilise \`/workflow-story\` pour un plan plus structuré`,
      ``,
      `> Tâche : ${description}`,
    ].join("\n")
  }

  const conventions = await readDoc(directory, "ai-artifacts/conventions.md")

  const summary = await runDevAgentSession({ ...runCtx, directory }, "dev", `
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
    `# Quick Task ${taskId} — Terminé`,
    ``,
    `## Ce qui a été fait`,
    summary,
    ``,
    `## Logged`,
    `  ✓ ai-artifacts/quick-tasks-log.yaml → ${taskId}`,
    ``,
    `Si le scope a grandi, utilise \`/workflow-story\` pour formaliser en story.`,
    `Pour une revue de code : \`/workflow-review\`.`,
  ].join("\n")
}
