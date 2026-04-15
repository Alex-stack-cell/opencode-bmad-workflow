import { tool } from "@opencode-ai/plugin"
import { withSession, runDevAgentSession } from "../utils/session.ts"
import { readStoryFile, allTasksDone } from "../utils/status.ts"
import type { Task } from "../types/task.ts"
import type { WorkflowCtx, WorkflowRunCtx } from "../types/workflow.ts"

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metaList = {
  name: "workflow_story_tasks",
  summary: "List tasks in a story with index and status",
}

export const meta = {
  name: "workflow_story_task",
  summary: "Implement one task at a time from a story (safer than workflow_story_dev)",
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

function parseTopLevelTasks(content: string): Task[] {
  const tasks: Task[] = []
  let i = 0
  for (const line of content.split("\n")) {
    if (/^- \[x\]/i.test(line)) {
      tasks.push({ index: ++i, done: true, label: line.replace(/^- \[x\]\s*/i, "").trim() })
    } else if (/^- \[ \]/.test(line)) {
      tasks.push({ index: ++i, done: false, label: line.replace(/^- \[ \]\s*/, "").trim() })
    }
  }
  return tasks
}

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

  const isLast = tasks.filter((t) => !t.done).length === 1
  const summary = await runDevAgentSession(
    { ...runCtx, directory },
    "dev",
    buildPrompt(target, tasks.length, isLast, content),
  )

  const updated = await readStoryFile(directory, storyId)
  const remaining = (updated?.match(/^- \[ \]/gm) ?? []).length

  return [
    `# Story ${storyId} — Task ${target.index} done`,
    "",
    `**Task:** ${target.label}`,
    "",
    summary,
    "",
    remaining > 0
      ? `${remaining} task(s) remaining. Run \`workflow_story_task\` to continue, or \`workflow_story_tasks\` to pick by index.`
      : `All tasks done! Run \`workflow_story_update\` with status \`review\`.`,
  ].join("\n")
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

function buildPrompt(target: Task, total: number, isLast: boolean, storyContent: string): string {
  return `
You are implementing task ${target.index} of ${total} from a BMAD story. Implement ONLY this task.

## Task
${target.label}

## Story context (AC, dev notes, patterns — do NOT implement other tasks)
${storyContent}

## Instructions
1. Read relevant files before making changes.
2. Implement this task only, including its subtasks.
3. Mark it done in the story file: change \`- [ ]\` to \`- [x]\` for this line only.
4. ${isLast
    ? `This is the last task. Update the \`## Dev Agent Record\` section: Agent Model Used, Completion Notes, Files Modified.`
    : `Do NOT touch the Dev Agent Record — more tasks remain.`}
5. Follow existing codebase patterns. No unrelated changes.

Summarize in 2–3 sentences what you implemented and which files were modified.
`.trim()
}
