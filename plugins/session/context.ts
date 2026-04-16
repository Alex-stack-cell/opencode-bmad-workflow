import type { OpencodeClient } from "@opencode-ai/sdk"
import type { WorkflowCtx, WorkflowRunCtx } from "../types/workflow.ts"
import { loadConfig } from "../storage/config.ts"

export async function getCurrentSessionId(client: OpencodeClient, directory: string): Promise<string> {
  const res = await client.session.list({ query: { directory } })
  const sessions = (res.data ?? []) as Array<{ id: string; parentID?: string }>
  const root = sessions.findLast((s) => !s.parentID) ?? sessions.at(-1)
  if (!root) throw new Error("No active session found")
  return root.id
}

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
