import type { OpencodeClient } from "@opencode-ai/sdk"
import type { WorkflowCtx, WorkflowRunCtx } from "./types.ts"

// ─── Session resolution ───────────────────────────────────────────────────────

/** Resolves the active root sessionId for the given directory. */
export async function getCurrentSessionId(client: OpencodeClient, directory: string): Promise<string> {
  const res = await client.session.list({ query: { directory } })
  const sessions = (res.data ?? []) as Array<{ id: string; parentID?: string }>
  const root = sessions.filter((s) => !s.parentID).at(-1) ?? sessions.at(-1)
  if (!root) throw new Error("No active session found")
  return root.id
}

/**
 * Resolves the sessionId then calls fn with a complete WorkflowRunCtx.
 * Removes the getCurrentSessionId boilerplate from every execute().
 */
export async function withSession<T>(
  ctx: WorkflowCtx,
  fn: (runCtx: WorkflowRunCtx) => Promise<T>,
): Promise<T> {
  const sessionId = await getCurrentSessionId(ctx.client, ctx.directory)
  return fn({ ...ctx, sessionId })
}

// ─── Agent execution ──────────────────────────────────────────────────────────

/**
 * Sends a prompt to a child session via a named agent.
 * Waits until the session is idle, then returns the last assistant text.
 *
 * @param runCtx - context holding client, directory, and parent sessionId
 * @param agentName - name of the OpenCode agent to invoke
 * @param prompt - prompt text to send
 * @returns last assistant text message, or "" if none
 */
const DIRECT_OUTPUT_INSTRUCTION =
  "IMPORTANT: Respond with plain text only. Do NOT use any tools or function calls. Write the content directly.\n\n"

/** Workflow tool names to disable in child sessions to prevent recursion. */
const WORKFLOW_TOOLS_DISABLED: Record<string, boolean> = {
  workflow_init: false,
  workflow_epics: false,
  workflow_epic: false,
  workflow_feature: false,
  workflow_sprint: false,
  workflow_review: false,
}

export async function runAgentSession(
  runCtx: WorkflowRunCtx,
  agentName: string,
  prompt: string,
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
      tools: WORKFLOW_TOOLS_DISABLED,
      parts: [{ type: "text", text: DIRECT_OUTPUT_INSTRUCTION + prompt }],
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
    // API returns { [sessionId]: SessionStatus }, not an array
    const statuses = (res.data ?? {}) as Record<string, { type: string }>
    const entry = statuses[sessionId]
    // Session not found: completed and removed, or never started — stop waiting
    if (!entry) return
    if (entry.type === "idle") return
    await sleep(500)
  }
  throw new Error(`Session ${sessionId} timed out waiting for idle`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
