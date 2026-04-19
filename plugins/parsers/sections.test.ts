import { describe, expect, test } from "bun:test"
import { splitSectionsByH2, findSection, renderSection } from "./sections.ts"

describe("splitSectionsByH2", () => {
  test("returns empty array when no H2 boundaries", () => {
    expect(splitSectionsByH2("just a paragraph\nwith no headings")).toEqual([])
  })

  test("splits on ## boundaries", () => {
    const md = `preamble discarded\n## Alpha\na1\na2\n## Beta\nb1`
    const sections = splitSectionsByH2(md)
    expect(sections).toHaveLength(2)
    expect(sections[0].heading).toBe("Alpha")
    expect(sections[0].body).toBe("a1\na2")
    expect(sections[1].heading).toBe("Beta")
    expect(sections[1].body).toBe("b1")
  })

  test("records deeper headings as sections too", () => {
    const sections = splitSectionsByH2(`## H2\nx\n### H3\ny`)
    expect(sections.map((s) => s.level)).toEqual([2, 3])
  })

  test("discards content before the first H2", () => {
    const sections = splitSectionsByH2(`intro line\n\n## Only\nbody`)
    expect(sections).toHaveLength(1)
    expect(sections[0].body).toBe("body")
  })
})

describe("findSection", () => {
  const sections = splitSectionsByH2(`## Dev Notes\nx\n## Acceptance Criteria\ny`)

  test("matches a literal heading case-insensitively", () => {
    expect(findSection(sections, "dev notes")?.body).toBe("x")
  })

  test("matches a regex", () => {
    expect(findSection(sections, /acceptance/i)?.heading).toBe("Acceptance Criteria")
  })

  test("returns undefined on miss", () => {
    expect(findSection(sections, "missing")).toBeUndefined()
  })
})

describe("renderSection", () => {
  test("renders heading + body with correct # count", () => {
    const [section] = splitSectionsByH2(`## Alpha\nbody`)
    expect(renderSection(section)).toBe(`## Alpha\nbody`)
  })

  test("trims trailing whitespace", () => {
    const [section] = splitSectionsByH2(`## Alpha\nbody\n\n\n`)
    expect(renderSection(section)).toBe(`## Alpha\nbody`)
  })
})
