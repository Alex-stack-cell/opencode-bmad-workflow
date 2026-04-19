import { tool } from "@opencode-ai/plugin"
import { rm } from "node:fs/promises"
import { join } from "node:path"
import type { WorkflowCtx, WorkflowRunCtx } from "../types/workflow.ts"
import { withSession } from "../session/context.ts"
import { runAgentSession } from "../session/agent.ts"
import { readDoc, writeDoc } from "../storage/docs.ts"
import { readSprintStatus, writeSprintStatus } from "../storage/sprint.ts"
import { slugify } from "../parsers/slugify.ts"

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

Calibrate to the actual scope:
- A simple CSS fix or minor UI tweak → 2 AC max, no redundant cases
- A full feature → as many AC as genuinely needed
Do NOT repeat AC that test the same thing with trivial variations (e.g. "single panel" vs "multiple panels" for the same CSS rule).
Include only realistic, testable acceptance criteria.
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

Calibrate to the actual scope:
- A simple CSS fix → 2-3 tasks max, no verification task if the fix is trivial
- A full feature → as many tasks as needed
Do NOT add tasks that are obvious or redundant (e.g. "verify in Figma" when the fix value was already specified by the user).
`.trim())

  return { userStory, tasks }
}

function buildStoryFile(storyId: string, title: string, userStory: string, tasks: string): string {
  return [
    `# Story ${storyId}: ${title}`,
    ``,
    `## Status`,
    `ready-for-dev`,
    ``,
    userStory,
    ``,
    tasks,
    ``,
    `## Dev Agent Record`,
    ``,
    `### Agent Model Used`,
    ``,
    `### Completion Notes`,
    ``,
    `### Files Modified`,
    ``,
  ].join("\n")
}

async function runStoryPreview(args: StoryArgs): Promise<string> {
  const { epicId, storyTitle, directory } = args
  const slug = slugify(storyTitle)
  const previewDir = `ai-artifacts/.previews/story-${epicId}-${slug}`

  const { userStory, tasks } = await generateStoryContent(args)

  const storyContent = buildStoryFile(`${epicId}.?`, storyTitle, userStory, tasks)
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

function computeNextStoryNum(yaml: string, epicId: number): number {
  if (!yaml) return 1
  const nums = [...yaml.matchAll(/id:\s*"(\d+)\.(\d+)"/g)]
    .filter(([, eId]) => Number(eId) === epicId)
    .map(([, , sNum]) => Number(sNum))
  return nums.length > 0 ? Math.max(...nums) + 1 : 1
}

function appendStoryToYaml(yaml: string, epicId: number, storyId: string, title: string, slug: string): string {
  const newEntry = [
    `      - id: "${storyId}"`,
    `        title: "${title}"`,
    `        status: ready-for-dev`,
    `        parent: ${epicId}`,
    `        file: implementation-artifacts/stories/${epicId}-${storyId.split(".")[1]}-${slug}.md`,
  ].join("\n")

  if (!yaml) {
    return [
      `epics:`,
      `  - id: ${epicId}`,
      `    name: ""`,
      `    status: planned`,
      `    priority: HIGH`,
      `    goal: ""`,
      `    stories:`,
      newEntry,
    ].join("\n") + "\n"
  }

  const lines = yaml.split("\n")
  let inTargetEpic = false
  let lastStoryLineIdx = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*-\s+id:\s+\d+/.test(line)) {
      inTargetEpic = line.includes(`id: ${epicId}`) || line.includes(`id: "${epicId}"`)
    }
    if (inTargetEpic && /^\s*-\s+id:\s+"[\d.]+"|^\s*stories:/.test(line)) {
      lastStoryLineIdx = i
    }
  }

  if (lastStoryLineIdx === -1) return yaml + "\n" + newEntry + "\n"

  let insertIdx = lastStoryLineIdx + 1
  while (insertIdx < lines.length) {
    const l = lines[insertIdx]
    if (/^\s{2}-\s+id:\s+\d/.test(l) && !l.includes(`id: "${epicId}`)) break
    insertIdx++
  }

  lines.splice(insertIdx, 0, newEntry)
  return lines.join("\n")
}

async function runStorySave(args: StoryArgs): Promise<string> {
  const { epicId, storyTitle, storyDescription, directory, ...runCtx } = args
  const slug = slugify(storyTitle)
  const previewDir = `ai-artifacts/.previews/story-${epicId}-${slug}`

  const previewStory = await readDoc(directory, `${previewDir}/story.md`)
  const hasPreview = !!previewStory

  const existingStatus = await readSprintStatus(directory)
  const storyNum = computeNextStoryNum(existingStatus, epicId)
  const storyId = `${epicId}.${storyNum}`

  const updatedStatus = appendStoryToYaml(existingStatus, epicId, storyId, storyTitle, slug)

  let storyContent: string
  if (hasPreview) {
    storyContent = previewStory.replace(/^# Story \d+\.[^:]+:/m, `# Story ${storyId}:`)
  } else {
    const { userStory, tasks } = await generateStoryContent({ ...runCtx, directory, epicId, storyTitle, storyDescription })
    storyContent = buildStoryFile(storyId, storyTitle, userStory, tasks)
  }

  const storyFilePath = await writeDoc(
    directory,
    `ai-artifacts/implementation-artifacts/stories/${epicId}-${storyNum}-${slug}.md`,
    storyContent,
  )

  const statusPath = await writeSprintStatus(directory, updatedStatus)

  if (hasPreview) {
    await rm(join(directory, previewDir), { recursive: true, force: true })
  }

  return [
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
  ].filter(Boolean).join("\n")
}
