import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join, dirname } from "node:path"
import { DEFAULT_CONFIG, type WorkflowConfig } from "../types/workflow.ts"

const CONFIG_PATH = "ai-artifacts/.workflow-config.json"

export async function loadConfig(projectDir: string): Promise<WorkflowConfig> {
  try {
    const raw = await readFile(join(projectDir, CONFIG_PATH), "utf-8")
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export async function saveConfig(
  projectDir: string,
  patch: Partial<WorkflowConfig>,
): Promise<WorkflowConfig> {
  const fullPath = join(projectDir, CONFIG_PATH)
  await mkdir(dirname(fullPath), { recursive: true })
  const current = await loadConfig(projectDir)
  const merged: WorkflowConfig = { ...current, ...patch }
  await writeFile(fullPath, JSON.stringify(merged, null, 2), "utf-8")
  return merged
}
