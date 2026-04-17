import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join, dirname } from "node:path"
import { DEFAULT_CONFIG, type WorkflowConfig } from "../types/workflow.ts"
import { Paths } from "../constants/paths.ts"

export async function loadConfig(projectDir: string): Promise<WorkflowConfig> {
  try {
    const raw = await readFile(join(projectDir, Paths.CONFIG), "utf-8")
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export async function saveConfig(projectDir: string, language: string): Promise<void> {
  const fullPath = join(projectDir, Paths.CONFIG)
  await mkdir(dirname(fullPath), { recursive: true })
  const config: WorkflowConfig = { language }
  await writeFile(fullPath, JSON.stringify(config, null, 2), "utf-8")
}
