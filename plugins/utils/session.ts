import type { OpencodeClient } from "@opencode-ai/sdk"

export async function getCurrentSessionId(client: OpencodeClient, directory: string): Promise<string> {
  const res = await client.session.list({ query: { directory } })
  const sessions = (res.data ?? []) as Array<{ id: string; parentID?: string }>
  const root = sessions.filter((s) => !s.parentID).at(-1) ?? sessions.at(-1)
  if (!root) throw new Error("No active session found")
  return root.id
}

/**
 * Run a prompt in a child session using a specific agent.
 * Waits for the session to become idle, then returns the last assistant text.
 */
export async function runAgentSession(
  client: OpencodeClient,
  parentSessionId: string,
  directory: string,
  agentName: string,
  prompt: string,
): Promise<string> {
  // 1. Create a child session
  const sessionRes = await client.session.create({
    body: { parentID: parentSessionId, title: `[workflow] ${agentName}` },
    query: { directory },
  })
  const session = sessionRes.data
  if (!session) throw new Error(`Failed to create session for agent "${agentName}"`)

  const sessionId = session.id

  // 2. Send the prompt to the child session with the target agent
  await client.session.prompt({
    path: { id: sessionId },
    body: {
      agent: agentName,
      parts: [{ type: "text", text: prompt }],
    },
    query: { directory },
  })

  // 3. Poll until the session is no longer busy
  await waitForIdle(client, sessionId, directory)

  // 4. Extract the last assistant text response
  const messagesRes = await client.session.messages({
    path: { id: sessionId },
    query: { directory },
  })

  const messages = messagesRes.data ?? []
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    const info = msg.info as { role?: string }
    if (info?.role !== "assistant") continue
    const textPart = msg.parts.find(
      (p: { type: string }) => p.type === "text",
    ) as { type: "text"; text: string } | undefined
    if (textPart?.text) return textPart.text
  }

  return ""
}

async function waitForIdle(
  client: OpencodeClient,
  sessionId: string,
  directory: string,
  timeoutMs = 5 * 60 * 1000,
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const res = await client.session.status({ query: { directory } })
    // The API returns { [sessionId]: SessionStatus } — not an array
    const statuses = (res.data ?? {}) as Record<string, { type: string }>
    const entry = statuses[sessionId]
    // Session not found: either completed and removed, or never started — stop waiting
    if (!entry) return
    if (entry.type === "idle") return
    await sleep(500)
  }
  throw new Error(`Session ${sessionId} timed out waiting for idle`)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
