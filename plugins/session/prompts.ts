/**
 * Shared prompt builders for dev agent sessions.
 * Pure functions — no I/O, no session access.
 */

import type { DevPromptMode } from "../types/workflow.ts"

// ─── Dev task prompt ──────────────────────────────────────────────────────────

export type DevPromptInput = {
  taskLabel: string
  taskIndex: number
  totalTasks: number
  isLast: boolean
  story: string
  conventions: string
  directory: string
  mode: DevPromptMode
}

export function buildDevTaskPrompt(input: DevPromptInput): string {
  const { taskLabel, taskIndex, totalTasks, isLast, story, conventions, directory, mode } = input

  const devAgentRule = isLast
    ? "This is the last task. Update the `## Dev Agent Record` section: Agent Model Used, Completion Notes, Files Modified."
    : "Do NOT touch the Dev Agent Record — more tasks remain."

  return [
    `You are implementing task ${taskIndex} of ${totalTasks} from a BMAD story. Implement ONLY this task.`,
    ``,
    `## Project root`,
    directory,
    ``,
    `## Task`,
    taskLabel,
    ``,
    `## Story context (AC, dev notes, patterns — do NOT implement other tasks)`,
    story.trim(),
    conventions.trim() ? `\n## Project conventions\n${conventions.trim()}` : "",
    ``,
    toolPolicy(mode),
    ``,
    `## Implementation instructions`,
    `1. Implement this task only, including its subtasks.`,
    `2. ${devAgentRule}`,
    `3. Follow existing codebase patterns and the project conventions above. No unrelated changes.`,
    ``,
    `Summarize in 2–3 sentences what you implemented and which files were modified.`,
  ]
    .filter((line) => line !== "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
}

// ─── Quick task prompt ────────────────────────────────────────────────────────

export type QuickTaskPromptInput = {
  description: string
  conventions: string
  mode: DevPromptMode
}

export function buildQuickTaskPrompt(input: QuickTaskPromptInput): string {
  const { description, conventions, mode } = input

  return [
    `You are implementing a quick fix or small feature directly. No story file exists — work from the description below.`,
    ``,
    `## Task`,
    description,
    conventions.trim() ? `\n## Project conventions\n${conventions.trim()}` : "",
    ``,
    toolPolicy(mode),
    ``,
    `## Instructions`,
    `1. Implement the fix following existing patterns and the project conventions above.`,
    `2. Keep the change minimal and focused — do NOT add unrelated improvements.`,
    `3. Write a 2–3 sentence summary of what you changed and which files were modified.`,
    ``,
    `Do NOT create any story files or update sprint-status.yaml.`,
  ]
    .filter((line) => line !== "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
}

// ─── Tool policy per mode ─────────────────────────────────────────────────────

function toolPolicy(mode: DevPromptMode): string {
  if (mode === "local") {
    return [
      `## Tool policy — MANDATORY`,
      `All context you need is inline above. DO NOT call \`read\`, \`glob\`, \`grep\`, or \`webfetch\`.`,
      `Write code directly using \`write\` / \`edit\`. Assume the context is complete.`,
    ].join("\n")
  }
  return [
    `## Tool policy`,
    `The context above is a hint. Use \`read\` / \`glob\` / \`grep\` sparingly to verify a specific file when needed.`,
    `Prefer working from the context above when it is sufficient.`,
  ].join("\n")
}
