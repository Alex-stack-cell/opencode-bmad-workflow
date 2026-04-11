import { tool } from "@opencode-ai/plugin"
import { withSession, runDevAgentSession } from "../utils/session.ts"
import {
  readSprintStatus,
  writeSprintStatus,
  patchStoryStatusInYaml,
  readStoryFile,
  writeStoryFile,
  allTasksDone,
} from "../utils/status.ts"
import type { WorkflowCtx, WorkflowRunCtx } from "../types/workflow.ts"

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const meta = {
  name: "workflow_story_dev",
  summary: "Implement story",
  chain: "Dev agent (implements tasks, updates checkboxes, updates Dev Agent Record)",
  generates: "(modifies project files + story file)",
}

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

  // Read story file
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

  // Mark story as in-progress in sprint-status.yaml
  const yaml = await readSprintStatus(directory)
  if (yaml) {
    const patched = patchStoryStatusInYaml(yaml, storyId, "in-progress")
    if (patched !== yaml) await writeSprintStatus(directory, patched)
  }

  // Run dev agent — full tool access so it can read/write project files
  const summary = await runDevAgentSession({ ...runCtx, directory }, "dev", `
You are implementing a BMAD user story. Your job is to implement all remaining unchecked tasks in the story below, then update the story file to reflect your work.

## Story to implement

${storyContent}

## Instructions

1. Read the story carefully: understand the user story, acceptance criteria, tasks, and dev notes.
2. Implement ALL unchecked tasks (marked \`- [ ]\`) one by one, including their subtasks.
3. For each task you complete, mark it as done in the story file: change \`- [ ]\` to \`- [x]\`.
4. After implementing all tasks, validate each acceptance criterion by reviewing your implementation.
5. Update the \`## Dev Agent Record\` section at the bottom of the story file:
   - **Agent Model Used**: fill in your model name
   - **Completion Notes**: brief summary of what was done, any decisions made, issues encountered
   - **Files Modified**: list every file you created or modified

Follow the dev notes and existing codebase patterns strictly. Write tests for your implementation.

When done, summarize what you implemented and list the files you modified.
`.trim())

  // Re-read story to check if all tasks are now done
  const updatedContent = await readStoryFile(directory, storyId)
  const isDone = updatedContent ? allTasksDone(updatedContent) : false

  const lines = [
    `# Workflow: Story Dev — ${storyId}`,
    ``,
    `## Implementation Summary`,
    summary,
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
