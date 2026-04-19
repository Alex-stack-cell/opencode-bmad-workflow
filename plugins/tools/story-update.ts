import { tool } from "@opencode-ai/plugin"
import type { WorkflowCtx, WorkflowRunCtx } from "../types/workflow.ts"
import type { StoryStatus } from "../types/story.ts"
import { withSession } from "../session/context.ts"
import { readSprintStatus, writeSprintStatus } from "../storage/sprint.ts"
import { readStoryFile, writeStoryFile } from "../storage/stories.ts"
import { patchStoryStatusInYaml } from "../parsers/sprint.ts"
import { patchStoryFileStatus } from "../parsers/stories.ts"

const STORY_STATUSES = [
  "ready-for-dev",
  "in-progress",
  "review",
  "done",
  "superseded",
  "deferred",
] as const

// ─── Tool factory ─────────────────────────────────────────────────────────────

export function createStoryUpdateTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Update a story's status in both sprint-status.yaml and the story file. Use this to advance a story through the lifecycle: ready-for-dev → in-progress → review → done (or superseded / deferred). No LLM involved — instant update.",
    args: {
      story_id: tool.schema.string().describe("Story ID to update, e.g. '1.1'. Use workflow_status to find it."),
      status: tool.schema
        .enum(STORY_STATUSES)
        .describe("New status for the story."),
      note: tool.schema.string().optional().describe("Optional comment to append to the sprint-status.yaml entry (e.g. date, reason)."),
    },
    execute: (args) =>
      withSession(ctx, (runCtx) =>
        runStoryUpdate({ ...runCtx, storyId: args.story_id, status: args.status, note: args.note }),
      ),
  })
}

// ─── Workflow implementation ──────────────────────────────────────────────────

type StoryUpdateArgs = WorkflowRunCtx & { storyId: string; status: StoryStatus; note?: string }

async function runStoryUpdate(args: StoryUpdateArgs): Promise<string> {
  const { storyId, status, note, directory } = args

  const yaml = await readSprintStatus(directory)
  if (!yaml) {
    return `Error: sprint-status.yaml not found. Run \`workflow_epic_preview\` first to create it.`
  }

  const patchedYaml = patchStoryStatusInYaml(yaml, storyId, status)
  if (patchedYaml === yaml) {
    return `Error: story ID "${storyId}" not found in sprint-status.yaml. Use \`workflow_status\` to check available IDs.`
  }

  const yamlWithNote = note
    ? patchedYaml.replace(
        new RegExp(`(id:\\s*"${storyId.replaceAll(".", "\\.")}".+?status:\\s*${status})`, "s"),
        `$1 # ${note}`,
      )
    : patchedYaml

  await writeSprintStatus(directory, yamlWithNote)

  const storyContent = await readStoryFile(directory, storyId)
  const lines: string[] = [`# Workflow: Story Update — ${storyId} → ${status}`]

  if (storyContent) {
    const patchedStory = patchStoryFileStatus(storyContent, status)
    await writeStoryFile(directory, storyId, patchedStory)
    lines.push(`   ✓ Story file updated`)
  } else {
    lines.push(`   ⚠ Story file not found — only sprint-status.yaml was updated`)
  }

  lines.push(`   ✓ sprint-status.yaml updated`)
  lines.push(``)
  lines.push(`## Done ✓`)
  lines.push(`  - Story ${storyId} is now \`${status}\``)

  if (status === "review") {
    lines.push(``)
    lines.push(`Run \`workflow_review_preview\` to perform a code review before marking done.`)
  } else if (status === "done") {
    lines.push(``)
    lines.push(`Run \`workflow_status\` to see the updated project overview.`)
  }

  return lines.join("\n")
}
