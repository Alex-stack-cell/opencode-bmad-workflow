import { readDoc, writeDoc } from "./files.ts"

const SPRINT_STATUS_PATH = "ai-artifacts/sprint-status.yaml"

/** Reads the raw sprint-status.yaml content, or "" if it doesn't exist yet. */
export async function readSprintStatus(projectDir: string): Promise<string> {
  return readDoc(projectDir, SPRINT_STATUS_PATH)
}

/** Writes the raw sprint-status.yaml content. */
export async function writeSprintStatus(projectDir: string, yaml: string): Promise<string> {
  return writeDoc(projectDir, SPRINT_STATUS_PATH, yaml)
}
