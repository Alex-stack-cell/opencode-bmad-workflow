import type { OpencodeClient } from "@opencode-ai/sdk"

export async function waitForIdle(
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
