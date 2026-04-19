/**
 * Pure Markdown section utilities. No I/O.
 * A section is defined by an H2 boundary (`^## `). Content before the first H2
 * is discarded — callers interested in the preamble must read it separately.
 */

export type MdSection = {
  heading: string
  level: number
  body: string
}

const H2_LINE = /^(##+)\s+(.*)$/

export function splitSectionsByH2(md: string): MdSection[] {
  const lines = md.split("\n")
  const sections: MdSection[] = []
  let current: { heading: string; level: number; lines: string[] } | null = null

  for (const line of lines) {
    const match = line.match(H2_LINE)
    if (match && match[1].length >= 2) {
      if (current) sections.push({ ...current, body: current.lines.join("\n") })
      current = { heading: match[2].trim(), level: match[1].length, lines: [] }
      continue
    }
    if (current) current.lines.push(line)
  }
  if (current) sections.push({ ...current, body: current.lines.join("\n") })

  return sections
}

export function findSection(
  sections: readonly MdSection[],
  heading: RegExp | string,
): MdSection | undefined {
  const matcher =
    heading instanceof RegExp ? (h: string) => heading.test(h) : (h: string) => h.toLowerCase() === heading.toLowerCase()
  return sections.find((s) => matcher(s.heading))
}

/** Render a section back to markdown (heading + body), trimming trailing blank lines. */
export function renderSection(section: MdSection): string {
  const prefix = "#".repeat(section.level)
  return `${prefix} ${section.heading}\n${section.body.replace(/\s+$/g, "")}`
}
