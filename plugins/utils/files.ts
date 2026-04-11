import { mkdir, writeFile, readFile } from "node:fs/promises"
import { join, dirname } from "node:path"

/** Reads an existing project doc, returns its content or "" if it doesn't exist yet. */
export async function readDoc(projectDir: string, relativePath: string): Promise<string> {
  try {
    return await readFile(join(projectDir, relativePath), "utf-8")
  } catch {
    return ""
  }
}

export function slugify(s: string): string {
  return s.toLowerCase().replaceAll(/\s+/g, "-").replaceAll(/[^a-z0-9-]/g, "")
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

