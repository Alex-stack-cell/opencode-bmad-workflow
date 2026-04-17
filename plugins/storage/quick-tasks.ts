import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Paths } from "../constants/paths.ts"

export async function readQuickTasksLog(directory: string): Promise<string> {
  try {
    return await readFile(join(directory, Paths.QUICK_TASKS_LOG), "utf-8")
  } catch {
    return ""
  }
}

export function generateTaskId(existing: string): string {
  const matches = [...existing.matchAll(/id: "QT-(\d+)"/g)]
  const max = matches.reduce((acc, m) => Math.max(acc, parseInt(m[1], 10)), 0)
  return `QT-${String(max + 1).padStart(3, "0")}`
}

export async function appendQuickTask(
  directory: string,
  taskId: string,
  description: string,
  status: "done" | "escalated",
  summary: string,
): Promise<void> {
  const path = join(directory, Paths.QUICK_TASKS_LOG)
  const existing = await readQuickTasksLog(directory)
  const date = new Date().toISOString().split("T")[0]

  const entry = [
    `  - id: "${taskId}"`,
    `    date: ${date}`,
    `    description: "${description.replace(/"/g, "'")}"`,
    `    status: ${status}`,
    `    summary: "${summary.replace(/"/g, "'").replace(/\n/g, " ").slice(0, 200)}"`,
  ].join("\n")

  const updated = existing
    ? existing.trimEnd() + "\n" + entry + "\n"
    : `quick_tasks:\n${entry}\n`

  await writeFile(path, updated, "utf-8")
}
