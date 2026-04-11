import { tool } from "@opencode-ai/plugin"
import { runAgentSession, withSession } from "../utils/session.ts"
import { writeDoc, readDoc } from "../utils/files.ts"
import { readSprintStatus, writeSprintStatus } from "../utils/status.ts"
import { rm } from "node:fs/promises"
import { join } from "node:path"
import type { WorkflowCtx, WorkflowRunCtx } from "../types/workflow.ts"

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const meta = {
  name: "workflow_story_save",
  summary: "New story",
  chain: "PM (story) → Architect (tasks + dev notes) → updates sprint-status.yaml",
  generates: "ai-artifacts/implementation-artifacts/stories/[n-m]-[slug].md",
}

// ─── Tool factories ───────────────────────────────────────────────────────────

export function createStoryPreviewTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Story workflow — Step 1/2: Generate a BMAD story (user story + AC + tasks + dev notes) and write it to ai-artifacts/.previews/ for the user to review and edit. Always call this before workflow_story_save. IMPORTANT: Never call this tool without explicit story_title, story_description, and epic_id provided by the user.",
    args: {
      epic_id: tool.schema.number().describe("ID of the parent epic from sprint-status.yaml. Use workflow_status to find it."),
      story_title: tool.schema.string().describe("Short story title explicitly provided by the user. Never invent this."),
      story_description: tool.schema.string().describe("What the user wants to achieve. Explicitly provided by the user."),
    },
    execute: (args) =>
      withSession(ctx, (runCtx) =>
        runStoryPreview({ ...runCtx, epicId: args.epic_id, storyTitle: args.story_title, storyDescription: args.story_description }),
      ),
  })
}

export function createStorySaveTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Story workflow — Step 2/2: Save the BMAD story to its final location and update sprint-status.yaml. Reads from ai-artifacts/.previews/ if a preview exists (preserving user edits). Call workflow_story_preview first.",
    args: {
      epic_id: tool.schema.number().describe("Same epic ID used in workflow_story_preview."),
      story_title: tool.schema.string().describe("Same story title used in workflow_story_preview."),
      story_description: tool.schema.string().describe("Same story description used in workflow_story_preview."),
    },
    execute: (args) =>
      withSession(ctx, (runCtx) =>
        runStorySave({ ...runCtx, epicId: args.epic_id, storyTitle: args.story_title, storyDescription: args.story_description }),
      ),
  })
}

// ─── Workflow implementation ──────────────────────────────────────────────────

type StoryArgs = WorkflowRunCtx & { epicId: number; storyTitle: string; storyDescription: string }

async function generateStoryContent(args: StoryArgs) {
  const { epicId, storyTitle, storyDescription, directory, ...runCtx } = args

  const existingStatus = await readSprintStatus(directory)
  const epicContext = existingStatus
    ? `Epic context from sprint-status.yaml:\n\`\`\`yaml\n${existingStatus}\n\`\`\`\n\nThis story belongs to epic ID ${epicId}.`
    : `This story belongs to epic ID ${epicId}.`

  const userStory = await runAgentSession({ ...runCtx, directory }, "pm", `
Write a BMAD user story following this exact format.

${epicContext}

Story title: ${storyTitle}
Description: ${storyDescription}

Output ONLY the story in this exact format (no extra commentary):

## Story
As a [user type], I want [goal], so that [benefit].

## Acceptance Criteria
1. Given [context], when [action], then [outcome].
2. Given [context], when [action], then [outcome].
(add as many as needed)

Include realistic, testable acceptance criteria based on the description.
`.trim())

  const tasks = await runAgentSession({ ...runCtx, directory }, "architect", `
Based on this user story, produce a technical task breakdown and developer notes.

Story title: ${storyTitle}
${userStory}

Output ONLY in this exact format (no extra commentary):

## Tasks / Subtasks
- [ ] Task 1 (agent: frontend/backend/architect)
  - [ ] Subtask 1.1
- [ ] Task 2
  - [ ] Subtask 2.1

## Dev Notes
Key technical decisions, constraints, and implementation hints relevant to this story.
Reference existing patterns from the codebase where applicable.
`.trim())

  return { userStory, tasks }
}

function buildStoryFile(epicId: number, storyId: string, title: string, userStory: string, tasks: string): string {
  return [
    `# Story ${storyId}: ${title}`,
    ``,
    `## Status`,
    `backlog`,
    ``,
    userStory,
    ``,
    tasks,
  ].join("\n")
}

async function runStoryPreview(args: StoryArgs): Promise<string> {
  const { epicId, storyTitle, directory } = args
  const slug = storyTitle.toLowerCase().replaceAll(/\s+/g, "-").replaceAll(/[^a-z0-9-]/g, "")
  const previewDir = `ai-artifacts/.previews/story-${epicId}-${slug}`

  const { userStory, tasks } = await generateStoryContent(args)

  const storyContent = buildStoryFile(epicId, `${epicId}.?`, storyTitle, userStory, tasks)
  await writeDoc(directory, `${previewDir}/story.md`, storyContent)

  return [
    `# Preview ready — Story: ${storyTitle}`,
    ``,
    `Open and edit this file freely before finalizing:`,
    `  - ${previewDir}/story.md → ai-artifacts/implementation-artifacts/stories/${epicId}-[m]-${slug}.md`,
    `  - (sprint-status.yaml will be updated on save)`,
    ``,
    `When ready, call \`workflow_story_save\` with the same arguments to write to its final location.`,
  ].join("\n")
}

async function runStorySave(args: StoryArgs): Promise<string> {
  const { epicId, storyTitle, storyDescription, directory, ...runCtx } = args
  const slug = storyTitle.toLowerCase().replaceAll(/\s+/g, "-").replaceAll(/[^a-z0-9-]/g, "")
  const previewDir = `ai-artifacts/.previews/story-${epicId}-${slug}`

  const previewStory = await readDoc(directory, `${previewDir}/story.md`)
  const hasPreview = !!previewStory

  // Update sprint-status.yaml to get the assigned story ID
  const existingStatus = await readSprintStatus(directory)
  const updatedStatus = await runAgentSession({ ...runCtx, directory }, "pm", `
Update this sprint-status.yaml to add a new story to epic ID ${epicId}.

${existingStatus
    ? `Existing sprint-status.yaml:\n\`\`\`yaml\n${existingStatus}\n\`\`\`\n\nAdd the new story inside the stories list of epic with id: ${epicId}. Use the next available story number within that epic (e.g. if epic 1 already has stories 1.1 and 1.2, the new one is 1.3). Keep all existing entries intact.`
    : `No sprint-status.yaml exists yet. Create one from scratch.`}

New story to add:
- title: "${storyTitle}"
- status: backlog
- parent epic id: ${epicId}

Output ONLY the raw YAML content, no markdown fences, no explanation.

Format (follow exactly):
epics:
  - id: 1
    name: "Epic name"
    status: planned
    priority: HIGH
    stories:
      - id: "1.1"
        title: "Story title"
        status: backlog
`.trim())

  // Extract the assigned story ID from the updated yaml
  const lines = updatedStatus.split("\n")
  const titleLineIdx = lines.findIndex((l) => l.includes(`title: "${storyTitle}"`))
  const storyIdRaw = titleLineIdx > 0
    ? lines.slice(Math.max(0, titleLineIdx - 2), titleLineIdx).join("\n").match(/id:\s*"([^"]+)"/)?.[1]
    : null
  const storyId = storyIdRaw ?? `${epicId}.?`

  let storyContent: string
  if (hasPreview) {
    // Replace the placeholder "epicId.?" with the real story ID
    storyContent = previewStory.replace(`# Story ${epicId}.?: ${storyTitle}`, `# Story ${storyId}: ${storyTitle}`)
  } else {
    const { userStory, tasks } = await generateStoryContent({ ...runCtx, directory, epicId, storyTitle, storyDescription })
    storyContent = buildStoryFile(epicId, storyId, storyTitle, userStory, tasks)
  }

  const storyNum = storyId.includes(".") ? storyId.split(".")[1] : "?"
  const storyFilePath = await writeDoc(
    directory,
    `ai-artifacts/implementation-artifacts/stories/${epicId}-${storyNum}-${slug}.md`,
    storyContent,
  )

  const statusPath = await writeSprintStatus(directory, updatedStatus)

  if (hasPreview) {
    await rm(join(directory, previewDir), { recursive: true, force: true })
  }

  const resultLines = [
    `# Workflow: Story — ${storyTitle}`,
    hasPreview ? `> Loaded from preview (including any edits you made).\n` : "",
    `   ✓ Story written → ${storyFilePath}`,
    `   ✓ Sprint status updated → ${statusPath}`,
    ``,
    `## Done ✓`,
    `  - Story ID: **${storyId}**`,
    `  - File: ai-artifacts/implementation-artifacts/stories/${epicId}-${storyNum}-${slug}.md`,
    `  - ai-artifacts/sprint-status.yaml`,
    ``,
    `Run \`workflow_sprint_preview\` when you're ready to plan the next sprint.`,
  ].filter(Boolean)

  return resultLines.join("\n")
}
