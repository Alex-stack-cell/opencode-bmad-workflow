import { describe, expect, test } from "bun:test"
import { shrinkStoryForTask, shrinkConventions } from "./shrink.ts"

const FIXTURE = `# Story 1.2 - Add user authentication

## Status
draft

## Story
As a user, I want to log in with email and password, so that I can access my account.

## Acceptance Criteria
1. Email/password login form validates input client-side.
2. Successful login redirects to /dashboard.
3. Failed login shows clear error message.
4. Sessions persist across page reloads via cookie.
5. Logout clears the session and redirects to /.

## Tasks / Subtasks
- [ ] Task 1: Build login form component with validation
  - [ ] Add email regex check
  - [ ] Add password min-length check
- [ ] Task 2: Implement session cookie handling
  - [ ] Set HttpOnly cookie on login
  - [ ] Clear cookie on logout
- [ ] Task 3: Add dashboard redirect logic
- [ ] Task 4: Write E2E tests for the login flow

## Dev Notes
The login form should use the existing Form primitive in src/components/Form.tsx.
Session cookies are handled by the auth middleware in src/middleware/auth.ts — follow its existing patterns.
Error messages should use the toast notification component.
E2E tests live in tests/e2e and use Playwright with the fixtures defined in tests/fixtures/user.ts.
Redirects must preserve query string params for deep links.

## Dev Agent Record
### Agent Model Used
### Completion Notes
### File List
`

describe("shrinkStoryForTask", () => {
  test("keeps only the targeted task block", () => {
    const result = shrinkStoryForTask({
      story: FIXTURE,
      taskLabel: "Task 2: Implement session cookie handling",
      taskIndex: 2,
      isLast: false,
    })
    expect(result.shrunk).toContain("Task 2: Implement session cookie handling")
    expect(result.shrunk).toContain("Set HttpOnly cookie on login")
    expect(result.shrunk).not.toContain("Task 1: Build login form")
    expect(result.shrunk).not.toContain("Task 3: Add dashboard redirect")
    expect(result.shrunk).not.toContain("Task 4: Write E2E tests")
  })

  test("omits Dev Agent Record unless isLast", () => {
    const notLast = shrinkStoryForTask({
      story: FIXTURE,
      taskLabel: "Task 1: Build login form component with validation",
      taskIndex: 1,
      isLast: false,
    })
    expect(notLast.shrunk).not.toContain("Dev Agent Record")

    const last = shrinkStoryForTask({
      story: FIXTURE,
      taskLabel: "Task 4: Write E2E tests for the login flow",
      taskIndex: 4,
      isLast: true,
    })
    expect(last.shrunk).toContain("Dev Agent Record")
  })

  test("keeps all ACs when filter matches none (defensive fallback)", () => {
    const result = shrinkStoryForTask({
      story: FIXTURE,
      taskLabel: "Task 3: Add dashboard redirect logic",
      taskIndex: 3,
      isLast: false,
      mode: "balanced",
    })
    expect(result.keptAcIndices.length).toBeGreaterThanOrEqual(1)
  })

  test("conservative mode keeps all ACs and all dev notes verbatim", () => {
    const result = shrinkStoryForTask({
      story: FIXTURE,
      taskLabel: "Task 1: Build login form component with validation",
      taskIndex: 1,
      isLast: false,
      mode: "conservative",
    })
    expect(result.keptAcIndices).toEqual([1, 2, 3, 4, 5])
    expect(result.devNotesKept).toBe("all")
  })

  test("preserves title and Status section", () => {
    const result = shrinkStoryForTask({
      story: FIXTURE,
      taskLabel: "Task 2: Implement session cookie handling",
      taskIndex: 2,
      isLast: false,
    })
    expect(result.shrunk).toContain("# Story 1.2 - Add user authentication")
    expect(result.shrunk).toContain("## Status")
    expect(result.shrunk).toContain("draft")
  })

  test("returns input unchanged when no H2 at all", () => {
    const plain = "just a plain paragraph"
    const result = shrinkStoryForTask({
      story: plain,
      taskLabel: "whatever",
      isLast: false,
    })
    expect(result.shrunk).toBe(plain)
  })

  test("returns story unchanged when target task label does not match", () => {
    const result = shrinkStoryForTask({
      story: FIXTURE,
      taskLabel: "Task 99: Does not exist",
      isLast: false,
    })
    expect(result.shrunk).toContain("Task 1")
    expect(result.shrunk).toContain("Task 2")
    expect(result.shrunk).toContain("Task 3")
  })

  test("resolves task by taskIndex when label does not match", () => {
    const result = shrinkStoryForTask({
      story: FIXTURE,
      taskLabel: "totally different label",
      taskIndex: 3,
      isLast: false,
    })
    expect(result.shrunk).toContain("Task 3: Add dashboard redirect logic")
    expect(result.shrunk).not.toContain("Task 1:")
    expect(result.shrunk).not.toContain("Task 4:")
  })
})

describe("shrinkConventions", () => {
  const CONVENTIONS = `## Naming
- kebab-case files
- PascalCase components

more details that extend the naming section beyond the first paragraph

## Code style
- immutable by default
- explicit error handling

## Testing
- Bun test runner
- 80% coverage target`

  test("returns input unchanged when already under budget", () => {
    const result = shrinkConventions({ conventions: CONVENTIONS, targetTokens: 1000 })
    expect(result).toBe(CONVENTIONS)
  })

  test("keeps only first paragraph per section when over budget", () => {
    const result = shrinkConventions({ conventions: CONVENTIONS, targetTokens: 40 })
    expect(result).toContain("kebab-case files")
    expect(result).not.toContain("more details that extend")
  })

  test("hard-truncates with ellipsis if still over budget", () => {
    const huge = "## Naming\n" + "x".repeat(10000)
    const result = shrinkConventions({ conventions: huge, targetTokens: 10 })
    expect(result.endsWith("…")).toBe(true)
    expect(result.length).toBeLessThanOrEqual(41)
  })

  test("returns empty string for empty input", () => {
    expect(shrinkConventions({ conventions: "" })).toBe("")
    expect(shrinkConventions({ conventions: "   " })).toBe("")
  })
})
