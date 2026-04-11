import { readDoc, writeDoc } from "./files.ts"
import { readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

const SPRINT_STATUS_PATH = "ai-artifacts/sprint-status.yaml"
const STORIES_DIR = "ai-artifacts/implementation-artifacts/stories"

export type StoryStatus =
  | "backlog"
  | "ready-for-dev"
  | "in-progress"
  | "review"
  | "done"
  | "superseded"
  | "deferred"

// ─── Sprint-status.yaml IO ────────────────────────────────────────────────────

/** Reads the raw sprint-status.yaml content, or "" if it doesn't exist yet. */
export async function readSprintStatus(projectDir: string): Promise<string> {
  return readDoc(projectDir, SPRINT_STATUS_PATH)
}

/** Writes the raw sprint-status.yaml content. */
export async function writeSprintStatus(projectDir: string, yaml: string): Promise<string> {
  return writeDoc(projectDir, SPRINT_STATUS_PATH, yaml)
}

/**
 * Updates a single story's status in sprint-status.yaml without calling the LLM.
 * Finds `id: "storyId"` and replaces the `status:` line that immediately follows.
 */
export function patchStoryStatusInYaml(yaml: string, storyId: string, newStatus: StoryStatus): string {
  const lines = yaml.split("\n")
  let foundStory = false
  return lines
    .map((line) => {
      if (line.includes(`id: "${storyId}"`)) {
        foundStory = true
        return line
      }
      if (foundStory && line.trim().startsWith("status:")) {
        foundStory = false
        return line.replace(/status:\s*\S+/, `status: ${newStatus}`)
      }
      return line
    })
    .join("\n")
}

// ─── Story file helpers ───────────────────────────────────────────────────────

/**
 * Resolves the absolute path of a story file given its ID (e.g. "1.1").
 * Story files follow the convention: [epicId]-[storyNum]-[slug].md
 */
export async function findStoryFile(projectDir: string, storyId: string): Promise<string | null> {
  const [epicId, storyNum] = storyId.split(".")
  if (!epicId || !storyNum) return null

  const dir = join(projectDir, STORIES_DIR)
  try {
    const entries = await readdir(dir)
    const match = entries.find((f) => f.startsWith(`${epicId}-${storyNum}-`) && f.endsWith(".md"))
    return match ? join(dir, match) : null
  } catch {
    return null
  }
}

/** Reads a story file by ID. Returns "" if not found. */
export async function readStoryFile(projectDir: string, storyId: string): Promise<string> {
  const path = await findStoryFile(projectDir, storyId)
  if (!path) return ""
  try {
    return await readFile(path, "utf-8")
  } catch {
    return ""
  }
}

/**
 * Updates the `## Status` section in a story markdown file.
 * Expects the format: `## Status\n<status>` on two consecutive lines.
 */
export function patchStoryFileStatus(content: string, newStatus: StoryStatus): string {
  return content.replace(/^(## Status\n)\S+/m, `$1${newStatus}`)
}

/** Writes updated content back to a story file. */
export async function writeStoryFile(projectDir: string, storyId: string, content: string): Promise<void> {
  const path = await findStoryFile(projectDir, storyId)
  if (!path) throw new Error(`Story file not found for ID "${storyId}"`)
  await writeFile(path, content, "utf-8")
}

/** Returns true if the story file has no remaining unchecked tasks `- [ ]`. */
export function allTasksDone(storyContent: string): boolean {
  return !storyContent.includes("- [ ]")
}
