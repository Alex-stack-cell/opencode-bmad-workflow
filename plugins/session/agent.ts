import type { WorkflowRunCtx } from "../types/workflow.ts"
import { waitForIdle } from "./polling.ts"

const DIRECT_OUTPUT_INSTRUCTION =
  "IMPORTANT: Respond with plain text only. Do NOT use any tools or function calls. Do NOT ask for confirmation, approval, or additional input from the user. Write the complete content directly and immediately.\n\n"

/** Workflow tool names to disable in child sessions to prevent recursion. */
const WORKFLOW_TOOLS_DISABLED: Record<string, boolean> = {
  workflow_init: false,
  workflow_setup: false,
  workflow_status: false,
  workflow_epic_preview: false,
  workflow_epic_save: false,
  workflow_story_preview: false,
  workflow_story_save: false,
  workflow_story_update: false,
  workflow_story_dev: false,
  workflow_sprint_preview: false,
  workflow_sprint_save: false,
  workflow_review_preview: false,
  workflow_review_save: false,
}

/** Read/exploration tools. Disabled when the child session has all needed context inline. */
const FILE_TOOLS_DISABLED: Record<string, boolean> = {
  read: false,
  glob: false,
  grep: false,
  webfetch: false,
  task: false,
}

export type RunDevOpts = {
  disableFileTools?: boolean
}

function getLanguageLabel(language: string): string {
  return new Intl.DisplayNames(["en"], { type: "language" }).of(language) ?? language
}

function buildLanguageInstruction(language: string): string {
  if (language === "en") return ""
  const label = getLanguageLabel(language)
  return `IMPORTANT: Write your entire response in ${label} (${language}). All headings, descriptions, labels, and content must be in ${label}.\n\n`
}

function resolveToolMap(opts: RunDevOpts | undefined): Record<string, boolean> {
  return opts?.disableFileTools
    ? { ...WORKFLOW_TOOLS_DISABLED, ...FILE_TOOLS_DISABLED }
    : WORKFLOW_TOOLS_DISABLED
}

async function extractLastAssistantText(
  client: WorkflowRunCtx["client"],
  sessionId: string,
  directory: string,
): Promise<string> {
  const messagesRes = await client.session.messages({
    path: { id: sessionId },
    query: { directory },
  })
  const messages = messagesRes.data ?? []
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    const info = msg.info as { role?: string }
    if (info?.role !== "assistant") continue
    const textPart = msg.parts.find((p: { type: string }) => p.type === "text") as
      | { type: "text"; text: string }
      | undefined
    if (textPart?.text) return textPart.text
  }
  return ""
}

async function runChildSession(
  runCtx: WorkflowRunCtx,
  agentName: string,
  text: string,
  tools: Record<string, boolean>,
): Promise<string> {
  const { client, directory, sessionId: parentSessionId } = runCtx

  const sessionRes = await client.session.create({
    body: { parentID: parentSessionId, title: `[workflow] ${agentName}` },
    query: { directory },
  })
  const session = sessionRes.data
  if (!session) throw new Error(`Failed to create session for agent "${agentName}"`)

  const sessionId = session.id

  await client.session.prompt({
    path: { id: sessionId },
    body: {
      agent: agentName,
      tools,
      parts: [{ type: "text", text }],
    },
    query: { directory },
  })

  await waitForIdle(client, sessionId, directory)
  return extractLastAssistantText(client, sessionId, directory)
}

export async function runAgentSession(
  runCtx: WorkflowRunCtx,
  agentName: string,
  prompt: string,
  opts?: RunDevOpts,
): Promise<string> {
  const languageInstruction = buildLanguageInstruction(runCtx.config.language)
  const text = DIRECT_OUTPUT_INSTRUCTION + languageInstruction + prompt
  return runChildSession(runCtx, agentName, text, resolveToolMap(opts))
}

export async function runDevAgentSession(
  runCtx: WorkflowRunCtx,
  agentName: string,
  prompt: string,
  opts?: RunDevOpts,
): Promise<string> {
  const languageInstruction = buildLanguageInstruction(runCtx.config.language)
  const text = languageInstruction + prompt
  return runChildSession(runCtx, agentName, text, resolveToolMap(opts))
}
