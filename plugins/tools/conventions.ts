import { tool } from "@opencode-ai/plugin"
import type { WorkflowCtx, WorkflowRunCtx } from "../types/workflow.ts"
import { withSession } from "../session/context.ts"
import { runAgentSession } from "../session/agent.ts"
import { readDoc, writeDoc } from "../storage/docs.ts"
import { Paths } from "../constants/paths.ts"
import { AgentRole } from "../agents/roles.ts"
import { readFile, readdir } from "node:fs/promises"
import { join, extname } from "node:path"

// ─── Tool factory ─────────────────────────────────────────────────────────────

export function createConventionsTool(ctx: WorkflowCtx) {
  return tool({
    description:
      "Generate or regenerate ai-artifacts/conventions.md by analyzing the codebase. The file is then automatically injected into all implementation workflows (workflow_story_task, workflow_story_dev, workflow_task). Edit the file manually at any time to refine the conventions.",
    args: {},
    execute: () => withSession(ctx, runConventions),
  })
}

// ─── File sampling ────────────────────────────────────────────────────────────

const MANIFEST_FILES = [
  "package.json", "composer.json", "pyproject.toml", "Cargo.toml",
  "go.mod", "Gemfile", "pom.xml", "build.gradle",
  "tsconfig.json", "phpcs.xml", ".eslintrc.json", ".eslintrc.js",
  "vite.config.ts", "vite.config.js", "tailwind.config.js", "tailwind.config.ts",
]

const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".php", ".py", ".go", ".rs", ".rb", ".java", ".vue",
])

const SKIP_DIRS = new Set([
  "node_modules", "vendor", "dist", "build", ".git", "coverage",
  "storage", "bootstrap/cache", "__pycache__", ".next", ".nuxt",
])

async function safeRead(path: string, maxBytes = 3000): Promise<string> {
  try {
    const buf = Buffer.alloc(maxBytes)
    const { createReadStream } = await import("node:fs")
    return await new Promise((resolve) => {
      let out = ""
      const stream = createReadStream(path, { encoding: "utf8", start: 0, end: maxBytes - 1 })
      stream.on("data", (chunk) => { out += chunk })
      stream.on("end", () => resolve(out))
      stream.on("error", () => resolve(""))
    })
  } catch {
    return ""
  }
}

async function collectSourceSamples(
  dir: string,
  maxFiles = 12,
  depth = 0,
): Promise<Array<{ path: string; content: string }>> {
  if (depth > 3) return []
  const results: Array<{ path: string; content: string }> = []
  let entries: string[] = []
  try { entries = await readdir(dir) } catch { return [] }

  for (const entry of entries) {
    if (results.length >= maxFiles) break
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    const ext = extname(entry)
    if (SOURCE_EXTENSIONS.has(ext)) {
      const content = await safeRead(full)
      if (content) results.push({ path: full.replace(dir + "/", ""), content })
    }
  }

  // recurse into subdirs if we still need more samples
  for (const entry of entries) {
    if (results.length >= maxFiles) break
    if (SKIP_DIRS.has(entry)) continue
    try {
      const full = join(dir, entry)
      const stat = await import("node:fs/promises").then(m => m.stat(full))
      if (stat.isDirectory()) {
        const sub = await collectSourceSamples(full, maxFiles - results.length, depth + 1)
        results.push(...sub)
      }
    } catch {}
  }

  return results.slice(0, maxFiles)
}

async function buildCodebaseSnapshot(directory: string): Promise<string> {
  const parts: string[] = []

  // manifests
  for (const name of MANIFEST_FILES) {
    const content = await safeRead(join(directory, name), 2000)
    if (content) parts.push(`### ${name}\n\`\`\`\n${content.slice(0, 1500)}\n\`\`\``)
  }

  // source samples
  const samples = await collectSourceSamples(directory)
  for (const { path, content } of samples) {
    parts.push(`### ${path}\n\`\`\`\n${content.slice(0, 1200)}\n\`\`\``)
  }

  return parts.join("\n\n")
}

// ─── Workflow implementation ──────────────────────────────────────────────────

async function runConventions(runCtx: WorkflowRunCtx): Promise<string> {
  const { directory } = runCtx

  const [existing, snapshot] = await Promise.all([
    readDoc(directory, Paths.CONVENTIONS),
    buildCodebaseSnapshot(directory),
  ])

  const conventions = await runAgentSession(runCtx, AgentRole.ARCHITECT, `
Analyze the codebase files provided below and extract the development conventions the team follows.
You have all the context you need — do NOT use any tools or read any additional files.

${existing ? `An existing conventions file is present — update and improve it rather than starting from scratch:\n\n${existing}\n\n---\n` : ""}

## Codebase snapshot

${snapshot}

---

Produce a concise, actionable \`conventions.md\` file covering:

## Naming
- File, variable, function, class naming rules (e.g. kebab-case files, PascalCase components)

## Code style
- Patterns the team uses consistently (immutability, error handling, async patterns)
- What to avoid (anti-patterns visible in the codebase)

## Architecture
- How the codebase is structured (feature folders, layers, etc.)
- Where new files should go

## Testing
- Test framework and conventions
- What must be tested and how

## Framework-specific rules
- Any framework or library conventions enforced in this project

Keep each rule short and concrete. Skip sections that are not applicable.
Do NOT invent rules that are not observable in the codebase.
`.trim(), { disableFileTools: true })

  const path = await writeDoc(directory, Paths.CONVENTIONS, conventions)

  return [
    `# Workflow: Conventions generated`,
    ``,
    `   ✓ Written → ${path}`,
    ``,
    `Open \`${Paths.CONVENTIONS}\` and edit freely — add, remove, or refine any rule.`,
    `This file will be automatically injected into all implementation workflows.`,
    `Re-run \`workflow_conventions\` at any time to refresh from the codebase.`,
    ``,
    `→ Run \`workflow_epic_preview\` to define your first epic.`,
  ].join("\n")
}
