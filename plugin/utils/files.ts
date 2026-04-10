import { mkdir, writeFile } from "node:fs/promises"
import { join, dirname } from "node:path"

export async function writeDoc(
  projectDir: string,
  relativePath: string,
  content: string,
): Promise<string> {
  const fullPath = join(projectDir, relativePath)
  await mkdir(dirname(fullPath), { recursive: true })
  await writeFile(fullPath, content, "utf-8")
  return fullPath
}

export function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
}
