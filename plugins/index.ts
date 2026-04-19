import type { OpencodeClient } from "@opencode-ai/sdk"
import { createInitTool, createSetupTool } from "./tools/setup.ts"
import { createStatusTool, createEpicPreviewTool, createEpicSaveTool } from "./tools/epic.ts"
import { createStoryPreviewTool, createStorySaveTool } from "./tools/story.ts"
import { createStoryUpdateTool } from "./tools/story-update.ts"
import { createStoryDevTool } from "./tools/story-dev.ts"
import { createStoryTasksListTool, createStoryTaskTool } from "./tools/story-task.ts"
import { createSprintPreviewTool, createSprintSaveTool } from "./tools/sprint.ts"
import { createReviewPreviewTool, createReviewSaveTool } from "./tools/review.ts"
import { createTaskTool } from "./tools/task.ts"
import { createConventionsTool } from "./tools/conventions.ts"

type PluginCtx = {
  client: OpencodeClient
  directory: string
  worktree: string
  project: { root: string }
}

async function WorkflowPlugin(ctx: PluginCtx) {
  const { client, directory } = ctx
  const wfCtx = { client, directory }

  return {
    tool: {
      workflow_init: createInitTool(wfCtx),
      workflow_setup: createSetupTool(wfCtx),
      workflow_status: createStatusTool(wfCtx),
      workflow_epic_preview: createEpicPreviewTool(wfCtx),
      workflow_epic_save: createEpicSaveTool(wfCtx),
      workflow_story_preview: createStoryPreviewTool(wfCtx),
      workflow_story_save: createStorySaveTool(wfCtx),
      workflow_story_update: createStoryUpdateTool(wfCtx),
      workflow_story_dev: createStoryDevTool(wfCtx),
      workflow_story_tasks: createStoryTasksListTool(wfCtx),
      workflow_story_task: createStoryTaskTool(wfCtx),
      workflow_sprint_preview: createSprintPreviewTool(wfCtx),
      workflow_sprint_save: createSprintSaveTool(wfCtx),
      workflow_review_preview: createReviewPreviewTool(wfCtx),
      workflow_review_save: createReviewSaveTool(wfCtx),
      workflow_task: createTaskTool(wfCtx),
      workflow_conventions: createConventionsTool(wfCtx),
    },
  }
}

export { WorkflowPlugin }
export default WorkflowPlugin
