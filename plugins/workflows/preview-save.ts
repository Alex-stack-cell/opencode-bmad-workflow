import { rm } from "node:fs/promises"
import { join } from "node:path"
import { readDoc, writeDoc } from "../storage/docs.ts"

/**
 * Attempts to read a set of preview files from disk.
 * Returns the content keyed by the same keys as `paths`, or null if any required file is missing.
 */
export async function loadPreview<K extends string>(
  directory: string,
  paths: Record<K, string>,
): Promise<Record<K, string> | null> {
  const result = {} as Record<K, string>
  for (const [key, relativePath] of Object.entries(paths) as [K, string][]) {
    const content = await readDoc(directory, relativePath)
    if (!content) return null
    result[key] = content
  }
  return result
}

/**
 * Writes a set of files to disk and returns their absolute paths.
 * Keys are ignored — only the relativePath → content mapping matters.
 */
export async function saveFiles(
  directory: string,
  files: Record<string, string>,
): Promise<string[]> {
  const written: string[] = []
  for (const [relativePath, content] of Object.entries(files)) {
    written.push(await writeDoc(directory, relativePath, content))
  }
  return written
}

/**
 * Removes a preview directory recursively.
 */
export async function cleanPreview(directory: string, previewDir: string): Promise<void> {
  await rm(join(directory, previewDir), { recursive: true, force: true })
}
