import type { OpenRouterModel } from './types'

/** Rough chars-per-token approximation — good enough for a ballpark estimate, not billing. */
const CHARS_PER_TOKEN = 4

/**
 * Rough, client-side cost estimate for one message send: approximates prompt tokens from
 * character count, and assumes the worst case (full maxTokens) for the completion side.
 * Returns null when the model or its pricing isn't known (some OpenRouter models don't
 * publish pricing, or is free).
 */
export function estimateCost(
  model: OpenRouterModel | undefined,
  promptChars: number,
  maxTokens: number
): number | null {
  if (!model) return null
  const promptPrice = parseFloat(model.promptPrice)
  const completionPrice = parseFloat(model.completionPrice)
  if (!Number.isFinite(promptPrice) || !Number.isFinite(completionPrice)) return null

  const promptTokens = promptChars / CHARS_PER_TOKEN
  return promptTokens * promptPrice + maxTokens * completionPrice
}

export function formatCost(cost: number): string {
  if (cost === 0) return 'free'
  if (cost < 0.0001) return '<$0.0001'
  return `~$${cost.toFixed(4)}`
}
