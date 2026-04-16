import { tool } from "@opencode-ai/plugin"
import type { WorkflowCtx, WorkflowRunCtx } from "../types/workflow.ts"
import { withSession } from "../session/context.ts"
import { runDevAgentSession } from "../session/agent.ts"
import { readSprintStatus, writeSprintStatus } from "../storage/sprint.ts"
import { readStoryFile, writeStoryFile } from "../storage/stories.ts"
import { readDoc } from "../storage/docs.ts"
import { writeProgressFile, clearProgressFile } from "../storage/progress.ts"
import { patchStoryStatusInYaml } from "../parsers/sprint.ts"
import { allTasksDone, parseUncheckedTopLevelTasks, markFirstUncheckedTaskDone } from "../parsers/tasks.ts"

// ─── Tool factory ─────────────────────────────────────────────────────────────

export function createStoryDevTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Development workflow: reads a story file, runs a dev agent to implement the remaining unchecked tasks, updates task checkboxes [x] in the story file, and updates the Dev Agent Record. Updates sprint-status.yaml to in-progress. After completion, use workflow_story_update to mark as review or done.",
    args: {
      story_id: tool.schema.string().describe("Story ID to implement, e.g. '1.1'. Use workflow_status to find it."),
    },
    execute: (args) =>
      withSession(ctx, (runCtx) => runStoryDev({ ...runCtx, storyId: args.story_id })),
  })
}

// ─── Workflow implementation ──────────────────────────────────────────────────

type StoryDevArgs = WorkflowRunCtx & { storyId: string }

async function runStoryDev(args: StoryDevArgs): Promise<string> {
  const { storyId, directory, ...runCtx } = args

  const storyContent = await readStoryFile(directory, storyId)
  if (!storyContent) {
    return `Error: story file not found for ID "${storyId}". Use \`workflow_status\` to check available story IDs.`
  }

  if (allTasksDone(storyContent)) {
    return [
      `# Story ${storyId} — All tasks already completed`,
      ``,
      `No remaining \`[ ]\` tasks found in the story file.`,
      `Use \`workflow_story_update\` to mark this story as \`review\` or \`done\`.`,
    ].join("\n")
  }

  const yaml = await readSprintStatus(directory)
  if (yaml) {
    const patched = patchStoryStatusInYaml(yaml, storyId, "in-progress")
    if (patched !== yaml) await writeSprintStatus(directory, patched)
  }

  const conventions = await readDoc(directory, "ai-artifacts/conventions.md")
  const tasks = parseUncheckedTopLevelTasks(storyContent)
  const taskSummaries: string[] = []

  if (tasks.length === 0) {
    return [
      `# Story ${storyId} — No unchecked tasks found`,
      ``,
      `Use \`workflow_story_update\` to mark this story as \`review\` or \`done\`.`,
    ].join("\n")
  }

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]

    await writeProgressFile(
      directory,
      [
        `# Dev Progress — Story ${storyId}`,
        ``,
        `**Task ${i + 1} / ${tasks.length}** — en cours`,
        ``,
        `> ${task}`,
        ``,
        `## Tâches complétées`,
        ...taskSummaries.map((s, idx) => `- [x] Tâche ${idx + 1}: ${tasks[idx]}`),
        ``,
        `## En attente`,
        ...tasks.slice(i).map((t, idx) => `- [ ] Tâche ${i + idx + 1}: ${t}`),
      ].join("\n"),
    )

    const currentStory = (await readStoryFile(directory, storyId)) || storyContent

    const summary = await runDevAgentSession({ ...runCtx, directory }, "dev", `
You are implementing a BMAD user story. Implement ONLY the single task described below — do not implement other tasks.

## Task to implement (task ${i + 1} of ${tasks.length})

${task}

## Full story context (for AC, dev notes, and patterns — do NOT implement other tasks)

${currentStory}
${conventions ? `\n## Project conventions\n${conventions}\n` : ""}
## Instructions

1. Read the task and the story context carefully.
2. Implement this task only, including any subtasks listed under it.
3. If this is the last task, also update the \`## Dev Agent Record\` section:
   - **Agent Model Used**: your model name
   - **Completion Notes**: brief summary, decisions, limitations
   - **Files Modified**: every file created or modified across all tasks
4. Follow existing codebase patterns and the project conventions above. Write tests for your implementation.

When done, write 2–3 sentences summarizing what you implemented for this task.
`.trim())

    taskSummaries.push(summary)

    // Programmatically mark the task and its subtasks done — don't rely on the agent
    const afterDev = await readStoryFile(directory, storyId)
    if (afterDev) {
      await writeStoryFile(directory, storyId, markFirstUncheckedTaskDone(afterDev))
    }
  }

  await clearProgressFile(directory)

  const updatedContent = await readStoryFile(directory, storyId)
  const isDone = updatedContent ? allTasksDone(updatedContent) : false

  const lines = [
    `# Workflow: Story Dev — ${storyId}`,
    ``,
    `## Implementation Summary (${tasks.length} tasks)`,
    ...taskSummaries.map((s, i) => [``, `### Task ${i + 1}: ${tasks[i]}`, s].join("\n")),
    ``,
    `## Status`,
  ]

  if (isDone) {
    lines.push(`All tasks completed ✓`)
    lines.push(``)
    lines.push(`Run \`workflow_story_update\` with status \`review\` to request a code review.`)
    lines.push(`Or \`workflow_review_preview\` to run an automated review.`)
  } else {
    lines.push(`Some tasks may still be unchecked — check the story file.`)
    lines.push(`Run \`workflow_story_dev\` again to continue implementation.`)
  }

  lines.push(``)
  lines.push(`sprint-status.yaml updated → story ${storyId} is now \`in-progress\``)

  return lines.join("\n")
}
