import type { OpencodeClient } from "@opencode-ai/sdk"
import type { WorkflowCtx, WorkflowRunCtx } from "../types/workflow.ts"
import { loadConfig } from "./config.ts"

// ─── Session resolution ───────────────────────────────────────────────────────

/** Resolves the active root sessionId for the given directory. */
export async function getCurrentSessionId(client: OpencodeClient, directory: string): Promise<string> {
  const res = await client.session.list({ query: { directory } })
  const sessions = (res.data ?? []) as Array<{ id: string; parentID?: string }>
  const root = sessions.findLast((s) => !s.parentID) ?? sessions.at(-1)
  if (!root) throw new Error("No active session found")
  return root.id
}

/**
 * Resolves the sessionId and loads project config, then calls fn with a complete WorkflowRunCtx.
 */
export async function withSession<T>(
  ctx: WorkflowCtx,
  fn: (runCtx: WorkflowRunCtx) => Promise<T>,
): Promise<T> {
  const [sessionId, config] = await Promise.all([
    getCurrentSessionId(ctx.client, ctx.directory),
    loadConfig(ctx.directory),
  ])
  return fn({ ...ctx, sessionId, config })
}

// ─── Agent execution ──────────────────────────────────────────────────────────

/**
 * Sends a prompt to a child session via a named agent.
 * Waits until the session is idle, then returns the last assistant text.
 */
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
  workflow_sprint_preview: false,
  workflow_sprint_save: false,
  workflow_review_preview: false,
  workflow_review_save: false,
}

function getLanguageLabel(language: string): string {
  return new Intl.DisplayNames(["en"], { type: "language" }).of(language) ?? language
}

function buildLanguageInstruction(language: string): string {
  if (language === "en") return ""
  const label = getLanguageLabel(language)
  return `IMPORTANT: Write your entire response in ${label} (${language}). All headings, descriptions, labels, and content must be in ${label}.\n\n`
}

export async function runAgentSession(
  runCtx: WorkflowRunCtx,
  agentName: string,
  prompt: string,
): Promise<string> {
  const { client, directory, sessionId: parentSessionId, config } = runCtx

  const sessionRes = await client.session.create({
    body: { parentID: parentSessionId, title: `[workflow] ${agentName}` },
    query: { directory },
  })
  const session = sessionRes.data
  if (!session) throw new Error(`Failed to create session for agent "${agentName}"`)

  const sessionId = session.id
  const languageInstruction = buildLanguageInstruction(config.language)

  await client.session.prompt({
    path: { id: sessionId },
    body: {
      agent: agentName,
      tools: WORKFLOW_TOOLS_DISABLED,
      parts: [{ type: "text", text: DIRECT_OUTPUT_INSTRUCTION + languageInstruction + prompt }],
    },
    query: { directory },
  })

  await waitForIdle(client, sessionId, directory)

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

// ─── Internals ────────────────────────────────────────────────────────────────

async function waitForIdle(
  client: OpencodeClient,
  sessionId: string,
  directory: string,
  timeoutMs = 5 * 60 * 1000,
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const res = await client.session.status({ query: { directory } })
    const statuses = (res.data ?? {}) as Record<string, { type: string }>
    const entry = statuses[sessionId]
    if (!entry) return
    if (entry.type === "idle") return
    await sleep(500)
  }
  throw new Error(`Session ${sessionId} timed out waiting for idle`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}