import { readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

const STORIES_DIR = "ai-artifacts/implementation-artifacts/stories"

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

export async function readStoryFile(projectDir: string, storyId: string): Promise<string> {
  const path = await findStoryFile(projectDir, storyId)
  if (!path) return ""
  try {
    return await readFile(path, "utf-8")
  } catch {
    return ""
  }
}

export async function writeStoryFile(projectDir: string, storyId: string, content: string): Promise<void> {
  const path = await findStoryFile(projectDir, storyId)
  if (!path) throw new Error(`Story file not found for ID "${storyId}"`)
  await writeFile(path, content, "utf-8")
}
