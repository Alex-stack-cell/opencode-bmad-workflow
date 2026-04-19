import { writeFile } from "node:fs/promises"
import { join } from "node:path"

const PROGRESS_FILE = "ai-artifacts/.dev-progress.md"

export async function writeProgressFile(projectDir: string, content: string): Promise<void> {
  const path = join(projectDir, PROGRESS_FILE)
  await writeFile(path, content, "utf-8").catch(() => {})
}

export async function clearProgressFile(projectDir: string): Promise<void> {
  const path = join(projectDir, PROGRESS_FILE)
  await writeFile(path, "", "utf-8").catch(() => {})
}
