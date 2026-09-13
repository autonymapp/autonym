import { describe, expect, it } from 'vitest'
import { assertExists } from './assertExists'

describe('assertExists', () => {
  it('returns the value unchanged when it is defined', () => {
    expect(assertExists({ id: 1 }, 'Thing')).toEqual({ id: 1 })
    expect(assertExists(0, 'Number')).toBe(0)
    expect(assertExists('', 'String')).toBe('')
    expect(assertExists(null, 'Nullable')).toBeNull()
  })

  it('throws a labeled error when the value is undefined', () => {
    expect(() => assertExists(undefined, 'Character')).toThrow('Character not found')
    expect(() => assertExists(undefined, 'Lorebook')).toThrow('Lorebook not found')
  })
})
