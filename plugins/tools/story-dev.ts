import { tool } from "@opencode-ai/plugin"
import type { WorkflowCtx, WorkflowRunCtx } from "../types/workflow.ts"
import { withSession } from "../session/context.ts"
import { runDevAgentSession } from "../session/agent.ts"
import { readSprintStatus, writeSprintStatus } from "../storage/sprint.ts"
import { readStoryFile, writeStoryFile } from "../storage/stories.ts"
import { readDoc } from "../storage/docs.ts"
import { writeProgressFile, clearProgressFile } from "../storage/progress.ts"
import { patchStoryStatusInYaml } from "../parsers/sprint.ts"
import { allTasksDone, parseTopLevelTasks, markFirstUncheckedTaskDone } from "../parsers/tasks.ts"
import { buildDevPlan } from "./story-task.ts"

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

  const conventions = (await readDoc(directory, "ai-artifacts/conventions.md")) || ""
  const allTasks = parseTopLevelTasks(storyContent)
  const unchecked = allTasks.filter((t) => !t.done)

  if (unchecked.length === 0) {
    return [
      `# Story ${storyId} — No unchecked tasks found`,
      ``,
      `Use \`workflow_story_update\` to mark this story as \`review\` or \`done\`.`,
    ].join("\n")
  }

  const taskSummaries: string[] = []
  const shrinkNotes: string[] = []

  for (let i = 0; i < unchecked.length; i++) {
    const target = unchecked[i]
    const isLast = i === unchecked.length - 1

    await writeProgressFile(
      directory,
      renderProgress(storyId, i, unchecked.length, target.label, unchecked, taskSummaries),
    )

    const currentStory = (await readStoryFile(directory, storyId)) || storyContent

    const plan = buildDevPlan({
      config: runCtx.config,
      story: currentStory,
      conventions,
      target,
      totalTasks: allTasks.length,
      isLast,
      directory,
    })

    if (!plan.budget.ok) {
      await clearProgressFile(directory)
      return formatBudgetAbort(storyId, target.label, plan.budget.estimatedTokens, runCtx.config.contextBudget, i)
    }

    const summary = await runDevAgentSession(
      { ...runCtx, directory },
      "dev",
      plan.prompt,
      { disableFileTools: runCtx.config.localModel },
    )

    taskSummaries.push(summary)
    if (plan.shrinkNote) shrinkNotes.push(`Task ${target.index}: ${plan.shrinkNote}`)

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
    `## Implementation Summary (${unchecked.length} tasks)`,
    ...unchecked.map((t, i) => `\n### Task ${t.index}: ${t.label}\n${taskSummaries[i] ?? "(no summary)"}`),
    ``,
    `## Status`,
    isDone ? `All tasks completed ✓` : `Some tasks may still be unchecked — check the story file.`,
    ``,
    isDone
      ? `Run \`workflow_story_update\` with status \`review\` to request a code review.\nOr \`workflow_review_preview\` to run an automated review.`
      : `Run \`workflow_story_dev\` again to continue implementation.`,
    ``,
    `sprint-status.yaml updated → story ${storyId} is now \`in-progress\``,
  ]

  if (shrinkNotes.length > 0) {
    lines.push(``, `## Local-mode shrink report`, ...shrinkNotes)
  }

  return lines.join("\n")
}

function renderProgress(
  storyId: string,
  currentIdx: number,
  total: number,
  currentLabel: string,
  unchecked: ReadonlyArray<{ index: number; label: string }>,
  completed: readonly string[],
): string {
  return [
    `# Dev Progress — Story ${storyId}`,
    ``,
    `**Task ${currentIdx + 1} / ${total}** — in progress`,
    ``,
    `> ${currentLabel}`,
    ``,
    `## Completed`,
    ...completed.map((_, idx) => `- [x] Task ${unchecked[idx].index}: ${unchecked[idx].label}`),
    ``,
    `## Pending`,
    ...unchecked.slice(currentIdx).map((t) => `- [ ] Task ${t.index}: ${t.label}`),
  ].join("\n")
}

function formatBudgetAbort(
  storyId: string,
  taskLabel: string,
  estimated: number,
  budget: number,
  completedCount: number,
): string {
  return [
    `# Story ${storyId} — Aborted (prompt over budget)`,
    ``,
    `Completed ${completedCount} task(s) before aborting.`,
    ``,
    `**Task over budget:** ${taskLabel}`,
    `Estimated prompt: ${estimated} tokens (budget ${budget}, soft cap 60%).`,
    ``,
    `Split this task into smaller subtasks, raise \`contextBudget\`, or disable local mode, then re-run \`workflow_story_dev\`.`,
  ].join("\n")
}
