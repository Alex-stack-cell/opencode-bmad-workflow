import type { PluginCtx, WorkflowCtx } from "./types/workflow.ts"
import { createInitTool, createSetupTool } from "./tools/setup.ts"
import { createStatusTool } from "./tools/status.ts"
import { createEpicPreviewTool, createEpicSaveTool } from "./tools/epic.ts"
import { createStoryPreviewTool, createStorySaveTool } from "./tools/story.ts"
import { createStoryUpdateTool } from "./tools/story-update.ts"
import { createStoryDevTool } from "./tools/story-dev.ts"
import { createStoryTasksListTool, createStoryTaskTool } from "./tools/story-task.ts"
import { createSprintPreviewTool, createSprintSaveTool } from "./tools/sprint.ts"
import { createReviewPreviewTool, createReviewSaveTool } from "./tools/review.ts"
import { createTaskTool } from "./tools/task.ts"
import { createConventionsTool } from "./tools/conventions.ts"

type ToolFactory = (ctx: WorkflowCtx) => unknown

const toolRegistry: Record<string, ToolFactory> = {
  workflow_init: createInitTool,
  workflow_setup: createSetupTool,
  workflow_status: createStatusTool,
  workflow_epic_preview: createEpicPreviewTool,
  workflow_epic_save: createEpicSaveTool,
  workflow_story_preview: createStoryPreviewTool,
  workflow_story_save: createStorySaveTool,
  workflow_story_update: createStoryUpdateTool,
  workflow_story_dev: createStoryDevTool,
  workflow_story_tasks: createStoryTasksListTool,
  workflow_story_task: createStoryTaskTool,
  workflow_sprint_preview: createSprintPreviewTool,
  workflow_sprint_save: createSprintSaveTool,
  workflow_review_preview: createReviewPreviewTool,
  workflow_review_save: createReviewSaveTool,
  workflow_task: createTaskTool,
  workflow_conventions: createConventionsTool,
}

async function WorkflowPlugin(ctx: PluginCtx) {
  const wfCtx: WorkflowCtx = { client: ctx.client, directory: ctx.directory }
  const tool = Object.fromEntries(
    Object.entries(toolRegistry).map(([name, factory]) => [name, factory(wfCtx)]),
  )
  return { tool }
}

export { WorkflowPlugin }
export default WorkflowPlugin
