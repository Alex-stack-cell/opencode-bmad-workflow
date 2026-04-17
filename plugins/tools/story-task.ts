import { tool } from "@opencode-ai/plugin"
import type { WorkflowCtx, WorkflowRunCtx } from "../types/workflow.ts"
import type { Task } from "../types/task.ts"
import { withSession } from "../session/context.ts"
import { runDevAgentSession } from "../session/agent.ts"
import { readStoryFile, writeStoryFile } from "../storage/stories.ts"
import { readDoc } from "../storage/docs.ts"
import { parseTopLevelTasks, allTasksDone, markTaskDone } from "../parsers/tasks.ts"
import { readSprintStatus, writeSprintStatus } from "../storage/sprint.ts"
import { patchStoryStatusInYaml } from "../parsers/sprint.ts"
import { patchStoryFileStatus } from "../parsers/stories.ts"
import { Paths } from "../constants/paths.ts"
import { AgentRole } from "../agents/roles.ts"

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

type StoryTaskWorkflowArgs = WorkflowRunCtx & { storyId: string; taskIndex?: number }

async function runStoryTask({ storyId, taskIndex, directory, ...runCtx }: StoryTaskWorkflowArgs): Promise<string> {
  const content = await readStoryFile(directory, storyId)
  if (!content) return `Error: story "${storyId}" not found. Use workflow_status to list available stories.`

  if (allTasksDone(content)) {
    return `Story ${storyId}: all tasks completed. Run \`workflow_story_update\` to mark as review or done.`
  }

  const tasks = parseTopLevelTasks(content)
  const target = resolveTarget(tasks, taskIndex)

  if ("error" in target) return target.error

  const conventions = await readDoc(directory, Paths.CONVENTIONS)
  const isLast = tasks.filter((t) => !t.done).length === 1
  const summary = await runDevAgentSession(
    { ...runCtx, directory },
    AgentRole.DEV,
    buildPrompt(target, tasks.length, isLast, content, conventions),
  )

  const afterDev = await readStoryFile(directory, storyId)
  if (afterDev) {
    await writeStoryFile(directory, storyId, markTaskDone(afterDev, target.index))
  }

  const updated = await readStoryFile(directory, storyId)
  const remaining = (updated?.match(/^- \[ \]/gim) ?? []).length

  const lines = [
    `# Story ${storyId} — Task ${target.index} done`,
    "",
    `**Task:** ${target.label}`,
    "",
    summary,
    "",
  ]

  if (remaining === 0 && updated) {
    const yaml = await readSprintStatus(directory)
    if (yaml) {
      await writeSprintStatus(directory, patchStoryStatusInYaml(yaml, storyId, "review"))
    }
    await writeStoryFile(directory, storyId, patchStoryFileStatus(updated, "review"))
    lines.push(`✅ All tasks done — story ${storyId} automatically moved to \`review\`.`)
    lines.push(`Run \`workflow_review\` to perform a code review before marking done.`)
  } else {
    lines.push(`${remaining} task(s) remaining. Run \`workflow_story_task\` to continue, or \`workflow_story_tasks\` to pick by index.`)
  }

  return lines.join("\n")
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

function buildPrompt(target: Task, total: number, isLast: boolean, storyContent: string, conventions: string): string {
  return `
You are implementing task ${target.index} of ${total} from a BMAD story. Implement ONLY this task.

## Task
${target.label}

## Story context (AC, dev notes, patterns — do NOT implement other tasks)
${storyContent}
${conventions ? `\n## Project conventions\n${conventions}\n` : ""}
## Instructions
1. Read relevant files before making changes.
2. Implement this task only, including its subtasks.
3. ${isLast
    ? `This is the last task. Update the \`## Dev Agent Record\` section: Agent Model Used, Completion Notes, Files Modified.`
    : `Do NOT touch the Dev Agent Record — more tasks remain.`}
4. Follow existing codebase patterns and the project conventions above. No unrelated changes.

Summarize in 2–3 sentences what you implemented and which files were modified.
`.trim()
}
