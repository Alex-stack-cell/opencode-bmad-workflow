import { readDoc, writeDoc } from "./docs.ts"
import { Paths } from "../constants/paths.ts"

export async function readSprintStatus(projectDir: string): Promise<string> {
  return readDoc(projectDir, Paths.SPRINT_STATUS)
}

export async function writeSprintStatus(projectDir: string, yaml: string): Promise<string> {
  return writeDoc(projectDir, Paths.SPRINT_STATUS, yaml)
}
