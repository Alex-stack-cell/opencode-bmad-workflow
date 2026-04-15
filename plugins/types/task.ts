/** A single top-level task parsed from a story file. */
export type Task = {
  /** 1-based position in the story's top-level task list. */
  index: number
  /** Whether the task checkbox is checked `[x]`. */
  done: boolean
  /** Raw label text without the checkbox prefix. */
  label: string
}
