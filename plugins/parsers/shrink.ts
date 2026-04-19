/**
 * Pure story/conventions shrinkers for local-model dev workflows.
 * Deterministic, no LLM, no I/O.
 */

import { splitSectionsByH2, findSection, renderSection, type MdSection } from "./sections.ts"

export type ShrinkMode = "aggressive" | "balanced" | "conservative"

// ─── Public API ───────────────────────────────────────────────────────────────

export type ShrinkStoryInput = {
  story: string
  taskLabel: string
  taskIndex?: number
  isLast: boolean
  mode?: ShrinkMode
}

export type ShrinkStoryResult = {
  shrunk: string
  keptAcIndices: number[]
  devNotesKept: "all" | "filtered" | "none"
}

export function shrinkStoryForTask(input: ShrinkStoryInput): ShrinkStoryResult {
  const { story, taskLabel, taskIndex, isLast, mode = "balanced" } = input

  const title = extractTitle(story)
  const sections = splitSectionsByH2(story)

  if (sections.length === 0) {
    return { shrunk: story, keptAcIndices: [], devNotesKept: "all" }
  }

  const status = findSection(sections, /^status$/i)
  const userStory = findSection(sections, /^story$/i)
  const acSection = findSection(sections, /acceptance criteria/i)
  const tasksSection = findSection(sections, /tasks\s*\/?\s*subtasks/i)
  const devNotesSection = findSection(sections, /^dev notes$/i)
  const agentRecord = findSection(sections, /dev agent record/i)

  const keywords = extractKeywords(taskLabel)
  const acFilter = filterAcceptanceCriteria(acSection, taskLabel, keywords, mode)
  const filteredTasks = filterTaskBlock(tasksSection, taskLabel, taskIndex)
  const devNotesFilter = filterDevNotes(devNotesSection, keywords, mode)

  const parts: string[] = []
  if (title) parts.push(title)
  if (status) parts.push(renderSection(status))
  if (userStory) parts.push(renderSection(userStory))
  if (acFilter.section) parts.push(renderSection(acFilter.section))
  if (filteredTasks) parts.push(renderSection(filteredTasks))
  if (devNotesFilter.section) parts.push(renderSection(devNotesFilter.section))
  if (isLast && agentRecord) parts.push(renderSection(agentRecord))

  return {
    shrunk: parts.join("\n\n") + "\n",
    keptAcIndices: acFilter.kept,
    devNotesKept: devNotesFilter.kept,
  }
}

export type ShrinkConventionsInput = {
  conventions: string
  targetTokens?: number
}

export function shrinkConventions(input: ShrinkConventionsInput): string {
  const { conventions, targetTokens = 500 } = input
  if (!conventions.trim()) return ""

  const maxChars = targetTokens * 4
  if (conventions.length <= maxChars) return conventions

  const sections = splitSectionsByH2(conventions)
  if (sections.length === 0) return truncate(conventions, maxChars)

  const compact = sections
    .map((s) => `## ${s.heading}\n${firstParagraph(s.body)}`)
    .join("\n\n")

  return compact.length <= maxChars ? compact : truncate(compact, maxChars)
}

// ─── Title ────────────────────────────────────────────────────────────────────

function extractTitle(story: string): string | null {
  const firstLine = story.split("\n").find((l) => l.trim().length > 0)
  return firstLine && /^#\s+/.test(firstLine) ? firstLine : null
}

// ─── Acceptance Criteria filter ───────────────────────────────────────────────

type AcFilterResult = { section: MdSection | null; kept: number[] }

function filterAcceptanceCriteria(
  section: MdSection | undefined,
  taskLabel: string,
  keywords: string[],
  mode: ShrinkMode,
): AcFilterResult {
  if (!section) return { section: null, kept: [] }
  if (mode === "conservative") return { section, kept: allAcIndices(section.body) }

  const items = parseAcItems(section.body)
  if (items.length === 0) return { section, kept: [] }

  const lower = taskLabel.toLowerCase()
  const minKeywordMatches = mode === "aggressive" ? 3 : 2

  const kept = items.filter((item) => {
    if (lower.includes(`ac ${item.index}`) || lower.includes(`#${item.index}`)) return true
    const itemKeywords = extractKeywords(item.text)
    const overlap = keywords.filter((k) => itemKeywords.includes(k)).length
    return overlap >= minKeywordMatches
  })

  if (kept.length === 0) return { section, kept: items.map((i) => i.index) }

  const body = kept.map((i) => `${i.index}. ${i.text}`).join("\n")
  return {
    section: { ...section, body: `\n${body}\n` },
    kept: kept.map((i) => i.index),
  }
}

type AcItem = { index: number; text: string }

function parseAcItems(body: string): AcItem[] {
  const items: AcItem[] = []
  const lines = body.split("\n")
  let current: AcItem | null = null

  for (const line of lines) {
    const match = line.match(/^(\d+)\.\s+(.*)$/)
    if (match) {
      if (current) items.push(current)
      current = { index: parseInt(match[1], 10), text: match[2] }
      continue
    }
    if (current && line.trim()) current.text += " " + line.trim()
  }
  if (current) items.push(current)
  return items
}

function allAcIndices(body: string): number[] {
  return parseAcItems(body).map((i) => i.index)
}

// ─── Task block filter ────────────────────────────────────────────────────────

function filterTaskBlock(
  section: MdSection | undefined,
  taskLabel: string,
  taskIndex?: number,
): MdSection | null {
  if (!section) return null

  const lines = section.body.split("\n")
  const topLevels: Array<{ start: number; end: number; label: string }> = []
  let currentStart = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^- \[[ x]\]/.test(line)) {
      if (currentStart !== -1) {
        const prev = topLevels[topLevels.length - 1]
        if (prev) prev.end = i - 1
      }
      const label = line.replace(/^- \[[ x]\]\s*/, "").trim()
      topLevels.push({ start: i, end: lines.length - 1, label })
      currentStart = i
    }
  }

  if (topLevels.length === 0) return section

  const target =
    taskIndex !== undefined && topLevels[taskIndex - 1]
      ? topLevels[taskIndex - 1]
      : topLevels.find((t) => t.label === taskLabel.trim())

  if (!target) return section

  const kept = lines.slice(target.start, target.end + 1).join("\n")
  return { ...section, body: `\n${kept}\n` }
}

// ─── Dev Notes filter ─────────────────────────────────────────────────────────

type DevNotesFilterResult = { section: MdSection | null; kept: "all" | "filtered" | "none" }
const DEV_NOTES_MIN_RETENTION = 0.3

function filterDevNotes(
  section: MdSection | undefined,
  keywords: string[],
  mode: ShrinkMode,
): DevNotesFilterResult {
  if (!section) return { section: null, kept: "none" }
  if (mode === "conservative" || keywords.length === 0) {
    return { section, kept: "all" }
  }

  const paragraphs = section.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  if (paragraphs.length === 0) return { section, kept: "all" }

  const minMatches = mode === "aggressive" ? 2 : 1
  const kept = paragraphs.filter((p) => {
    const paraKeywords = extractKeywords(p)
    return keywords.filter((k) => paraKeywords.includes(k)).length >= minMatches
  })

  const originalLen = section.body.length
  const keptLen = kept.join("\n\n").length
  if (kept.length === 0 || keptLen / originalLen < DEV_NOTES_MIN_RETENTION) {
    return { section, kept: "all" }
  }

  return {
    section: { ...section, body: `\n${kept.join("\n\n")}\n` },
    kept: "filtered",
  }
}

// ─── Keywords ─────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "task", "with", "from", "this", "that", "into", "your", "have", "will",
  "shall", "when", "what", "which", "them", "they", "than", "then",
])

function extractKeywords(text: string): string[] {
  const cleaned = text
    .toLowerCase()
    .replace(/^task\s+\d+\s*:\s*/i, "")
    .replace(/[^a-z0-9\s-]/g, " ")
  const tokens = cleaned.split(/\s+/).filter((t) => t.length >= 4 && !STOPWORDS.has(t))
  return Array.from(new Set(tokens))
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function firstParagraph(body: string): string {
  const trimmed = body.trim()
  if (!trimmed) return ""
  const [first] = trimmed.split(/\n\s*\n/)
  return first.trim()
}

function truncate(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : text.slice(0, maxChars - 1).trimEnd() + "…"
}
