import type { OpencodeClient } from "@opencode-ai/sdk"

// ─── Config ───────────────────────────────────────────────────────────────────

/** Persistent per-project workflow preferences (stored in ai-artifacts/.workflow-config.json). */
export type WorkflowConfig = {
  /** BCP 47 language tag, e.g. "fr", "en", "es". Default: "en". */
  language: string
}

export const DEFAULT_CONFIG: WorkflowConfig = {
  language: "en",
}

// ─── Contexts ─────────────────────────────────────────────────────────────────

/** Minimal context provided by the OpenCode plugin to each tool. */
export type WorkflowCtx = {
  client: OpencodeClient
  directory: string
}

/** WorkflowCtx enriched with a resolved sessionId and loaded config. */
export type WorkflowRunCtx = WorkflowCtx & {
  sessionId: string
  config: WorkflowConfig
}

/** Plugin-level context injected by OpenCode into the plugin factory. */
export type PluginCtx = {
  client: import("@opencode-ai/sdk").OpencodeClient
  directory: string
  worktree: string
  project: { root: string }
}