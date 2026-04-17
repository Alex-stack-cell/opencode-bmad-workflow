import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Paths } from "../constants/paths.ts"

export async function writeProgressFile(projectDir: string, content: string): Promise<void> {
  const path = join(projectDir, Paths.PROGRESS)
  await writeFile(path, content, "utf-8").catch(() => {})
}

export async function clearProgressFile(projectDir: string): Promise<void> {
  const path = join(projectDir, Paths.PROGRESS)
  await writeFile(path, "", "utf-8").catch(() => {})
}
