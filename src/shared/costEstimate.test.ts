import { describe, expect, it } from 'vitest'
import { estimateCost, formatCost } from './costEstimate'
import type { OpenRouterModel } from './types'

function model(promptPrice: string, completionPrice: string): OpenRouterModel {
  return { id: 'test/model', name: 'Test Model', contextLength: 16000, promptPrice, completionPrice }
}

describe('estimateCost', () => {
  it('returns null when no model is given', () => {
    expect(estimateCost(undefined, 1000, 500)).toBeNull()
  })

  it('returns null when pricing is not a valid number', () => {
    expect(estimateCost(model('not-a-number', '0.000001'), 1000, 500)).toBeNull()
  })

  it('computes prompt + worst-case completion cost', () => {
    // 1000 chars / 4 chars-per-token = 250 prompt tokens
    const cost = estimateCost(model('0.000001', '0.000002'), 1000, 500)
    expect(cost).toBeCloseTo(250 * 0.000001 + 500 * 0.000002)
  })

  it('is zero for a free model', () => {
    expect(estimateCost(model('0', '0'), 1000, 500)).toBe(0)
  })
})

describe('formatCost', () => {
  it('labels zero cost as free', () => {
    expect(formatCost(0)).toBe('free')
  })

  it('shows a floor label for very small nonzero costs', () => {
    expect(formatCost(0.00001)).toBe('<$0.0001')
  })

  it('formats a normal cost with 4 decimal places', () => {
    expect(formatCost(0.0234)).toBe('~$0.0234')
  })
})
