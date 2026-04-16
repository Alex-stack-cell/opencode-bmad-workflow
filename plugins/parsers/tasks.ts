import type { Task } from "../types/task.ts"

/**
 * Marks a top-level task (by 1-based index among ALL top-level tasks) and all
 * its indented subtasks as done. Does nothing if the task is already checked.
 */
export function markTaskDone(content: string, taskIndex: number): string {
  const lines = content.split("\n")
  let count = 0
  let inTarget = false

  return lines
    .map((line) => {
      if (/^- \[[ x]\]/i.test(line)) {
        count++
        if (count === taskIndex) {
          inTarget = true
          return line.replace(/^- \[ \]/i, "- [x]")
        }
        inTarget = false
        return line
      }
      if (inTarget && /^\s+- \[[ x]\]/i.test(line)) {
        return line.replace(/- \[ \]/i, "- [x]")
      }
      return line
    })
    .join("\n")
}

/**
 * Marks the first unchecked top-level task and all its indented subtasks as done.
 */
export function markFirstUncheckedTaskDone(content: string): string {
  const lines = content.split("\n")
  let inTarget = false

  return lines
    .map((line) => {
      if (/^- \[[ x]\]/i.test(line)) {
        if (!inTarget && /^- \[ \]/i.test(line)) {
          inTarget = true
          return line.replace(/^- \[ \]/i, "- [x]")
        }
        inTarget = false
        return line
      }
      if (inTarget && /^\s+- \[[ x]\]/i.test(line)) {
        return line.replace(/- \[ \]/i, "- [x]")
      }
      return line
    })
    .join("\n")
}

export function parseTopLevelTasks(content: string): Task[] {
  const tasks: Task[] = []
  let i = 0
  for (const line of content.split("\n")) {
    if (/^- \[x\]/i.test(line)) {
      tasks.push({ index: ++i, done: true, label: line.replace(/^- \[x\]\s*/i, "").trim() })
    } else if (/^- \[ \]/i.test(line)) {
      tasks.push({ index: ++i, done: false, label: line.replace(/^- \[ \]\s*/i, "").trim() })
    }
  }
  return tasks
}

export function allTasksDone(storyContent: string): boolean {
  return !/^- \[ \]/im.test(storyContent)
}

export function parseUncheckedTopLevelTasks(content: string): string[] {
  return content
    .split("\n")
    .filter((line) => /^- \[ \]/i.test(line))
    .map((line) => line.replace(/^- \[ \]\s*/i, "").trim())
    .filter(Boolean)
}
