import { mkdir, writeFile, readFile } from "node:fs/promises"
import { join, dirname } from "node:path"

export async function readDoc(projectDir: string, relativePath: string): Promise<string> {
  try {
    return await readFile(join(projectDir, relativePath), "utf-8")
  } catch {
    return ""
  }
}

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
