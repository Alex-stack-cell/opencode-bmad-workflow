import { describe, expect, test } from "bun:test"
import { estimateTokens, checkPromptBudget } from "./tokens.ts"

describe("estimateTokens", () => {
  test("returns 0 for empty", () => {
    expect(estimateTokens("")).toBe(0)
  })

  test("approximates at 4 chars per token, rounded up", () => {
    expect(estimateTokens("abcd")).toBe(1)
    expect(estimateTokens("abcde")).toBe(2)
    expect(estimateTokens("x".repeat(4000))).toBe(1000)
  })
})

describe("checkPromptBudget", () => {
  test("accepts within 60% soft cap by default", () => {
    const result = checkPromptBudget("x".repeat(4000), 10000)
    expect(result.ok).toBe(true)
    expect(result.estimatedTokens).toBe(1000)
    expect(result.ratio).toBe(0.1)
  })

  test("rejects at or above soft cap", () => {
    const result = checkPromptBudget("x".repeat(80000), 32000)
    expect(result.ok).toBe(false)
    expect(result.ratio).toBeGreaterThan(0.6)
  })

  test("respects custom soft ratio", () => {
    const result = checkPromptBudget("x".repeat(20000), 10000, 0.4)
    expect(result.ok).toBe(false)
    expect(result.ratio).toBe(0.5)
  })

  test("budget of 0 produces Infinity ratio", () => {
    const result = checkPromptBudget("x", 0)
    expect(result.ratio).toBe(Infinity)
    expect(result.ok).toBe(false)
  })
})
