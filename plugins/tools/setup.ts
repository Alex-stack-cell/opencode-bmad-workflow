import { tool } from "@opencode-ai/plugin"
import type { WorkflowCtx, WorkflowConfig } from "../types/workflow.ts"
import type { ShrinkMode } from "../parsers/shrink.ts"
import { loadConfig, saveConfig } from "../storage/config.ts"
import { allMeta } from "../meta/index.ts"

// ─── Constants ────────────────────────────────────────────────────────────────

export const SUPPORTED_LANGUAGES = ["en", "fr", "es", "de", "pt", "it", "ja", "zh"] as const
export const SUPPORTED_SHRINK_MODES = ["aggressive", "balanced", "conservative"] as const satisfies readonly ShrinkMode[]

// ─── Init text builder ────────────────────────────────────────────────────────

export function buildInitText(config: WorkflowConfig): string {
  const modeBadge = config.localModel
    ? `\`localModel: true\` — shrink=${config.shrinkMode}, budget=${config.contextBudget} tok`
    : `\`localModel: false\` — frontier mode (Claude, GPT, Gemini…)`

  return [
    "# BMAD Workflow — Quick Reference",
    "",
    "## Recommended cycle",
    "",
    "```",
    "1. /workflow-setup         → set language + local-model mode                  [once per project]",
    "   /workflow-conventions  → generate ai-artifacts/conventions.md              [once per project, edit freely]",
    "2. /workflow-epic          → define an epic (scope, goal, priority)            [once per epic]",
    "3. /workflow-story         → create a BMAD story for that epic                 [repeat per story]",
    "4. /workflow-status        → verify stories appear as ready-for-dev",
    "5. /workflow-sprint        → plan a sprint from your backlog                   [once per sprint]",
    "6. /workflow-story-tasks   → list tasks in a story with index and status",
    "   /workflow-story-task   → implement one task at a time (safer, interruptible)",
    "   /workflow-story-dev    → implement all tasks in one shot (legacy, less control)",
    "   /workflow-task         → quick fix without epic/story (CSS, bug, tweak)     [shortcut]",
    "7. /workflow-story-update  → mark as review, then done                         [repeat per story]",
    "8. /workflow-review        → adversarial code review before closing            [optional]",
    "```",
    "",
    "## Story lifecycle",
    "",
    "```",
    "ready-for-dev → in-progress → review → done",
    "                                     ↘ superseded / deferred",
    "```",
    "",
    "## All tools",
    "",
    ...allMeta.map((m) => `- \`${m.name}\` — ${m.summary}`),
    "",
    "---",
    `Language: \`${config.language}\` — use \`workflow_setup\` to change.`,
    `Mode: ${modeBadge}`,
    "Artifacts: `ai-artifacts/` — preview files in `ai-artifacts/.previews/` before every save.",
  ].join("\n")
}

// ─── Tool factories ───────────────────────────────────────────────────────────

export function createInitTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "List available BMAD automated workflows. Return the tool output VERBATIM — do not reformat, summarize, or invent commands. Use this as a starting point to pick a workflow or continue manually.",
    args: {},
    async execute() {
      const config = await loadConfig(ctx.directory)
      return buildInitText(config)
    },
  })
}

export function createSetupTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Configure workflow preferences for this project: output language, local-model mode (shrinks prompts and disables file tools for 8-32k context models), token budget, and shrink aggressiveness. All fields are optional — only the fields you pass are updated.",
    args: {
      language: tool.schema
        .enum(SUPPORTED_LANGUAGES)
        .optional()
        .describe("Language code for generated documents. Supported: en, fr, es, de, pt, it, ja, zh."),
      local_model: tool.schema
        .boolean()
        .optional()
        .describe("Enable local-model mode: shrinks story/conventions before prompting and disables file-read tools in dev sessions. Use for Qwen, DeepSeek-Coder, Llama, or any model under 32k context."),
      context_budget: tool.schema
        .number()
        .int()
        .positive()
        .optional()
        .describe("Soft prompt-size cap (in tokens) used when local_model is true. Default 32000. A prompt exceeding 60% of this budget is refused with a clear error."),
      shrink_mode: tool.schema
        .enum(SUPPORTED_SHRINK_MODES)
        .optional()
        .describe("How aggressively to shrink stories for local models. aggressive=most pruning, balanced=default, conservative=no filtering. Ignored when local_model is false."),
    },
    async execute(args) {
      const patch: Partial<WorkflowConfig> = {}
      if (args.language !== undefined) patch.language = args.language
      if (args.local_model !== undefined) patch.localModel = args.local_model
      if (args.context_budget !== undefined) patch.contextBudget = args.context_budget
      if (args.shrink_mode !== undefined) patch.shrinkMode = args.shrink_mode

      if (Object.keys(patch).length === 0) {
        const current = await loadConfig(ctx.directory)
        return formatCurrentConfig(current)
      }

      const saved = await saveConfig(ctx.directory, patch)
      return formatSaveResult(patch, saved)
    },
  })
}

// ─── Output formatting ────────────────────────────────────────────────────────

function formatCurrentConfig(config: WorkflowConfig): string {
  return [
    `# Workflow config (current)`,
    ``,
    `- \`language\`: ${config.language}`,
    `- \`localModel\`: ${config.localModel}`,
    `- \`contextBudget\`: ${config.contextBudget}`,
    `- \`shrinkMode\`: ${config.shrinkMode}`,
    ``,
    `Pass any of \`language\`, \`local_model\`, \`context_budget\`, \`shrink_mode\` to update.`,
  ].join("\n")
}

function formatSaveResult(patch: Partial<WorkflowConfig>, saved: WorkflowConfig): string {
  const lines = [`# Workflow setup saved`, ``]
  if (patch.language !== undefined) lines.push(`- Language → \`${saved.language}\``)
  if (patch.localModel !== undefined) {
    lines.push(`- Local-model mode → \`${saved.localModel}\``)
    if (saved.localModel) {
      lines.push(`  - Story/conventions will be shrunk (mode: ${saved.shrinkMode}) before prompting.`)
      lines.push(`  - File-read tools disabled in dev sessions.`)
      lines.push(`  - Prompt-size gate: 60% of ${saved.contextBudget} tokens.`)
    }
  }
  if (patch.contextBudget !== undefined) lines.push(`- Context budget → \`${saved.contextBudget}\` tokens`)
  if (patch.shrinkMode !== undefined) lines.push(`- Shrink mode → \`${saved.shrinkMode}\``)
  lines.push(``, `Config saved to \`ai-artifacts/.workflow-config.json\`.`)
  return lines.join("\n")
}
