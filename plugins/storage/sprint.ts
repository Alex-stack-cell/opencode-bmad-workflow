import { readDoc, writeDoc } from "./docs.ts"

const SPRINT_STATUS_PATH = "ai-artifacts/sprint-status.yaml"

export async function readSprintStatus(projectDir: string): Promise<string> {
  return readDoc(projectDir, SPRINT_STATUS_PATH)
}

export async function writeSprintStatus(projectDir: string, yaml: string): Promise<string> {
  return writeDoc(projectDir, SPRINT_STATUS_PATH, yaml)
}
