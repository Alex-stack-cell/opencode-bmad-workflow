/**
 * Dependency-free token estimation. Accuracy target: ±15%.
 * Only used to gate against a soft budget, never to split strings precisely.
 */

const CHARS_PER_TOKEN = 4

export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export type BudgetCheck = {
  ok: boolean
  estimatedTokens: number
  budget: number
  ratio: number
}

export function checkPromptBudget(prompt: string, budget: number, softRatio = 0.6): BudgetCheck {
  const estimatedTokens = estimateTokens(prompt)
  const ratio = budget > 0 ? estimatedTokens / budget : Infinity
  return {
    ok: ratio <= softRatio,
    estimatedTokens,
    budget,
    ratio,
  }
}
