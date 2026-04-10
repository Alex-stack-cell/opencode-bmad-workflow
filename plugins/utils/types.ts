import type { OpencodeClient } from "@opencode-ai/sdk"

export type WorkflowCtx = {
  client: OpencodeClient
  directory: string
}
