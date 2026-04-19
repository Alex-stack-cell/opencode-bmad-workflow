import { tool } from "@opencode-ai/plugin"
import type { WorkflowCtx, WorkflowRunCtx, WorkflowConfig, DevPromptMode } from "../types/workflow.ts"
import type { Task } from "../types/task.ts"
import { withSession } from "../session/context.ts"
import { runDevAgentSession } from "../session/agent.ts"
import { buildDevTaskPrompt } from "../session/prompts.ts"
import { readStoryFile, writeStoryFile } from "../storage/stories.ts"
import { readDoc } from "../storage/docs.ts"
import { parseTopLevelTasks, allTasksDone, markTaskDone } from "../parsers/tasks.ts"
import { shrinkStoryForTask, shrinkConventions, type ShrinkMode } from "../parsers/shrink.ts"
import { checkPromptBudget } from "../parsers/tokens.ts"

// ─── Tool: list ───────────────────────────────────────────────────────────────

export function createStoryTasksListTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Lists all top-level tasks of a story with their 1-based index and status (✅ done / ⬜ pending). Use before workflow_story_task to know which task_index to pass.",
    args: {
      story_id: tool.schema.string().describe("Story ID, e.g. '1.2'."),
    },
    execute: async ({ story_id }) => {
      const content = await readStoryFile(ctx.directory, story_id)
      if (!content) return `Error: story "${story_id}" not found. Use workflow_status to list available stories.`

      const tasks = parseTopLevelTasks(content)
      if (tasks.length === 0) return `No top-level tasks found in story ${story_id}.`

      const done = tasks.filter((t) => t.done).length
      return [
        `# Story ${story_id} — Tasks (${done}/${tasks.length} done)`,
        "",
        ...tasks.map((t) => `${t.done ? "✅" : "⬜"} [${t.index}] ${t.label}`),
        "",
        allTasksDone(content)
          ? `All done! Run \`workflow_story_update\` to mark as review.`
          : `Run \`workflow_story_task\` to implement the next pending task.`,
      ].join("\n")
    },
  })
}

// ─── Tool: single task ────────────────────────────────────────────────────────

export function createStoryTaskTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Implements a single unchecked task from a story. Safer than workflow_story_dev: run one task, validate, then run the next. Defaults to the first unchecked task. Use workflow_story_tasks to see indices.",
    args: {
      story_id: tool.schema.string().describe("Story ID, e.g. '1.2'."),
      task_index: tool.schema
        .number()
        .optional()
        .describe("1-based task index. Omit to auto-pick the next unchecked task."),
    },
    execute: (args) =>
      withSession(ctx, (runCtx) =>
        runStoryTask({ ...runCtx, storyId: args.story_id, taskIndex: args.task_index }),
      ),
  })
}

// ─── Orchestration ────────────────────────────────────────────────────────────

type StoryTaskArgs = WorkflowRunCtx & { storyId: string; taskIndex?: number }

async function runStoryTask({ storyId, taskIndex, directory, ...runCtx }: StoryTaskArgs): Promise<string> {
  const content = await readStoryFile(directory, storyId)
  if (!content) return `Error: story "${storyId}" not found. Use workflow_status to list available stories.`

  if (allTasksDone(content)) {
    return `Story ${storyId}: all tasks completed. Run \`workflow_story_update\` to mark as review or done.`
  }

  const tasks = parseTopLevelTasks(content)
  const target = resolveTarget(tasks, taskIndex)
  if ("error" in target) return target.error

  const conventions = (await readDoc(directory, "ai-artifacts/conventions.md")) || ""
  const isLast = tasks.filter((t) => !t.done).length === 1

  const plan = buildDevPlan({
    config: runCtx.config,
    story: content,
    conventions,
    target,
    totalTasks: tasks.length,
    isLast,
    directory,
  })

  if (!plan.budget.ok) {
    return formatBudgetError(storyId, target, plan.budget, runCtx.config)
  }

  const summary = await runDevAgentSession(
    { ...runCtx, directory },
    "dev",
    plan.prompt,
    { disableFileTools: runCtx.config.localModel },
  )

  const afterDev = await readStoryFile(directory, storyId)
  if (afterDev) {
    await writeStoryFile(directory, storyId, markTaskDone(afterDev, target.index))
  }

  const updated = await readStoryFile(directory, storyId)
  const remaining = (updated?.match(/^- \[ \]/gm) ?? []).length

  return [
    `# Story ${storyId} — Task ${target.index} done`,
    "",
    `**Task:** ${target.label}`,
    plan.shrinkNote,
    "",
    summary,
    "",
    remaining > 0
      ? `${remaining} task(s) remaining. Run \`workflow_story_task\` to continue, or \`workflow_story_tasks\` to pick by index.`
      : `All tasks done! Run \`workflow_story_update\` with status \`review\`.`,
  ]
    .filter(Boolean)
    .join("\n")
}

function resolveTarget(tasks: Task[], taskIndex?: number): Task | { error: string } {
  if (taskIndex !== undefined) {
    const found = tasks.find((t) => t.index === taskIndex)
    if (!found) return { error: `Error: task_index ${taskIndex} not found. Use workflow_story_tasks to list available indices.` }
    if (found.done) return { error: `Task ${taskIndex} is already completed. Use workflow_story_tasks to see remaining tasks.` }
    return found
  }
  return tasks.find((t) => !t.done) ?? { error: `All tasks are done. Run \`workflow_story_update\` to finalize.` }
}

// ─── Prompt plan (shared shrink + budget pipeline) ────────────────────────────

export type DevPlanInput = {
  config: WorkflowConfig
  story: string
  conventions: string
  target: Task
  totalTasks: number
  isLast: boolean
  directory: string
}

export type DevPlan = {
  prompt: string
  budget: ReturnType<typeof checkPromptBudget>
  shrinkNote: string
  mode: DevPromptMode
}

export function buildDevPlan(input: DevPlanInput): DevPlan {
  const { config, story, conventions, target, totalTasks, isLast, directory } = input
  const mode: DevPromptMode = config.localModel ? "local" : "frontier"

  // Try configured shrink mode first; if over budget in local mode, retry aggressive.
  const firstTry = renderAttempt({ story, conventions, target, totalTasks, isLast, directory, mode, shrinkMode: config.shrinkMode, forceShrink: config.localModel })
  const firstBudget = checkPromptBudget(firstTry.prompt, config.contextBudget)

  if (firstBudget.ok || !config.localModel || config.shrinkMode === "aggressive") {
    return { prompt: firstTry.prompt, budget: firstBudget, shrinkNote: firstTry.note, mode }
  }

  const retry = renderAttempt({ story, conventions, target, totalTasks, isLast, directory, mode, shrinkMode: "aggressive", forceShrink: true })
  const retryBudget = checkPromptBudget(retry.prompt, config.contextBudget)
  return { prompt: retry.prompt, budget: retryBudget, shrinkNote: retry.note, mode }
}

type AttemptInput = {
  story: string
  conventions: string
  target: Task
  totalTasks: number
  isLast: boolean
  directory: string
  mode: DevPromptMode
  shrinkMode: ShrinkMode
  forceShrink: boolean
}

function renderAttempt(input: AttemptInput): { prompt: string; note: string } {
  const { story, conventions, target, totalTasks, isLast, directory, mode, shrinkMode, forceShrink } = input

  const shrunk = forceShrink
    ? shrinkStoryForTask({ story, taskLabel: target.label, taskIndex: target.index, isLast, mode: shrinkMode })
    : { shrunk: story, keptAcIndices: [], devNotesKept: "all" as const }

  const convs = forceShrink ? shrinkConventions({ conventions }) : conventions

  const prompt = buildDevTaskPrompt({
    taskLabel: target.label,
    taskIndex: target.index,
    totalTasks,
    isLast,
    story: shrunk.shrunk,
    conventions: convs,
    directory,
    mode,
  })

  const note = forceShrink
    ? `_Local mode: shrink=${shrinkMode}, ACs kept=${shrunk.keptAcIndices.length || "all"}, dev-notes=${shrunk.devNotesKept}._`
    : ""

  return { prompt, note }
}

function formatBudgetError(
  storyId: string,
  target: Task,
  budget: ReturnType<typeof checkPromptBudget>,
  config: WorkflowConfig,
): string {
  const pct = Math.round(budget.ratio * 100)
  return [
    `# Story ${storyId} — Task ${target.index} aborted (prompt over budget)`,
    "",
    `Estimated prompt size: **${budget.estimatedTokens} tokens** (${pct}% of ${config.contextBudget} budget).`,
    `Soft cap: 60%. Even with aggressive shrinking the prompt is too large for this local model.`,
    "",
    `**Options:**`,
    `- Raise \`contextBudget\` in \`ai-artifacts/.workflow-config.json\` if your model supports a larger window.`,
    `- Split this task into smaller subtasks and run them individually.`,
    `- Disable local mode (\`localModel: false\`) if you have access to a frontier model.`,
  ].join("\n")
}
