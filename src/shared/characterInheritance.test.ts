import { describe, expect, it } from 'vitest'
import { resolveCharacterInheritance } from './characterInheritance'
import type { Character } from './types'

function character(overrides: Partial<Character> & { id: number; name: string }): Character {
  return {
    avatarType: 'monogram',
    avatarPath: null,
    avatarEmoji: null,
    universeId: null,
    baseCharacterId: null,
    isWorldbuildingAssistant: false,
    tags: [],
    appearance: '',
    personality: '',
    speechStyle: '',
    background: '',
    relationships: '',
    scenario: '',
    firstMessage: '',
    notes: '',
    createdAt: new Date().toISOString(),
    deletedAt: null,
    ...overrides
  }
}

describe('resolveCharacterInheritance', () => {
  const base = character({
    id: 1,
    name: 'Kaoru',
    personality: 'Fierce and loyal',
    speechStyle: 'Formal, old-fashioned',
    relationships: 'Devoted to her clan'
  })

  it('returns the character unchanged when it has no base', () => {
    const standalone = character({ id: 2, name: 'Aria' })
    expect(resolveCharacterInheritance(standalone, [standalone, base])).toBe(standalone)
  })

  it("keeps the variant's own values when all three fields are overridden", () => {
    const variant = character({
      id: 3,
      name: 'Kaoru (FF14)',
      baseCharacterId: 1,
      personality: 'Same fire, different world',
      speechStyle: 'Casual Miqo\'te slang',
      relationships: 'New friends in the Scions'
    })
    const resolved = resolveCharacterInheritance(variant, [base, variant])
    expect(resolved.personality).toBe('Same fire, different world')
    expect(resolved.speechStyle).toBe("Casual Miqo'te slang")
    expect(resolved.relationships).toBe('New friends in the Scions')
  })

  it('falls back to the base for blank fields', () => {
    const variant = character({ id: 3, name: 'Kaoru (FF14)', baseCharacterId: 1 })
    const resolved = resolveCharacterInheritance(variant, [base, variant])
    expect(resolved.personality).toBe('Fierce and loyal')
    expect(resolved.speechStyle).toBe('Formal, old-fashioned')
    expect(resolved.relationships).toBe('Devoted to her clan')
    // Non-inheritable fields are untouched.
    expect(resolved.name).toBe('Kaoru (FF14)')
  })

  it('returns the character unchanged if the base cannot be found', () => {
    const variant = character({ id: 3, name: 'Orphaned Variant', baseCharacterId: 999 })
    expect(resolveCharacterInheritance(variant, [variant])).toBe(variant)
  })
})
