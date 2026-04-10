import type { OpencodeClient } from "@opencode-ai/sdk"

/** Minimal context provided by the OpenCode plugin to each tool. */
export type WorkflowCtx = {
  client: OpencodeClient
  directory: string
}

/** WorkflowCtx enriched with a resolved sessionId — entry contract for internal workflow functions. */
export type WorkflowRunCtx = WorkflowCtx & {
  sessionId: string
}
