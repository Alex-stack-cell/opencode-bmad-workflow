import type { OpencodeClient } from "@opencode-ai/sdk"
import type { ShrinkMode } from "../parsers/shrink.ts"

// ─── Config ───────────────────────────────────────────────────────────────────

/** Persistent per-project workflow preferences (stored in ai-artifacts/.workflow-config.json). */
export type WorkflowConfig = {
  /** BCP 47 language tag, e.g. "fr", "en", "es". */
  language: string
  /** Enable local-model mode: shrinks story/conventions and disables file tools in dev sessions. */
  localModel: boolean
  /** Soft token budget used to gate dev prompts when localModel is true. */
  contextBudget: number
  /** Aggressiveness of story/conventions shrinking when localModel is true. */
  shrinkMode: ShrinkMode
}

export const DEFAULT_CONFIG: WorkflowConfig = {
  language: "en",
  localModel: false,
  contextBudget: 32000,
  shrinkMode: "balanced",
}

// ─── Prompt modes ─────────────────────────────────────────────────────────────

export type DevPromptMode = "local" | "frontier"

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
