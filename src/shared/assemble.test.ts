import { describe, expect, it } from 'vitest'
import { assemblePrompt, matchLoreEntries, estimateTokens } from './assemble'
import type { Character, LoreEntry } from './types'

function entry(overrides: Partial<LoreEntry>): LoreEntry {
  return {
    id: 1,
    lorebookId: 1,
    title: 'Untitled',
    entryType: 'other',
    keywords: [],
    description: '',
    fields: {},
    enabled: true,
    createdAt: new Date().toISOString(),
    ...overrides
  }
}

describe('matchLoreEntries', () => {
  it('matches a keyword case-insensitively', () => {
    const entries = [entry({ id: 1, title: 'Twilight River City', keywords: ['Twilight River City'] })]
    const matched = matchLoreEntries(entries, 'She looked out over TWILIGHT RIVER CITY at dusk.')
    expect(matched.map((e) => e.id)).toEqual([1])
  })

  it('never matches a disabled entry', () => {
    const entries = [entry({ id: 1, title: 'Dragon Lore', keywords: ['dragon'], enabled: false })]
    const matched = matchLoreEntries(entries, 'A dragon flew overhead.')
    expect(matched).toEqual([])
  })

  it('matches multiple entries at once and ignores irrelevant text', () => {
    const entries = [
      entry({ id: 1, title: 'City', keywords: ['city'] }),
      entry({ id: 2, title: 'Sword', keywords: ['sword', 'blade'] }),
      entry({ id: 3, title: 'Unrelated', keywords: ['dragon'] })
    ]
    const matched = matchLoreEntries(entries, 'Down by the city, blades clashed.')
    expect(matched.map((e) => e.id).sort()).toEqual([1, 2])
  })

  it('ignores blank/whitespace-only keywords', () => {
    const entries = [entry({ id: 1, keywords: ['', '   '] })]
    expect(matchLoreEntries(entries, 'Anything at all')).toEqual([])
  })
})

describe('estimateTokens', () => {
  it('roughly approximates 4 characters per token', () => {
    expect(estimateTokens('12345678')).toBe(2)
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('123')).toBe(1) // rounds up
  })
})

function character(overrides: Partial<Character> = {}): Character {
  return {
    id: 1,
    name: 'Aria',
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

function baseParams() {
  return {
    character: character(),
    persona: null,
    impersonatingCharacter: null,
    relationship: null,
    scenario: null,
    scenarioMilestoneIndex: 0,
    priorSummary: null,
    directorsNotes: '',
    inFictionDate: null,
    groupCharacters: [],
    loreEntries: [],
    lorebooks: [],
    history: [],
    contextLength: 8192,
    rpMode: 'narrative' as const,
    collaborativeMode: false,
    moodPreset: null,
    contentIntensity: 'standard' as const
  }
}

describe('assemblePrompt — mood and content intensity', () => {
  it('adds no extra steering when mood is unset and intensity is standard', () => {
    const { messages } = assemblePrompt(baseParams())
    expect(messages[0].content).not.toContain('Pacing for this scene')
    expect(messages[0].content).not.toContain('Content intensity')
  })

  it('injects the matching instruction block for each mood preset', () => {
    const slowBurn = assemblePrompt({ ...baseParams(), moodPreset: 'slow-burn' })
    expect(slowBurn.messages[0].content).toContain('slow burn')
    expect(slowBurn.messages[0].content).toContain('premature confession')

    const highAction = assemblePrompt({ ...baseParams(), moodPreset: 'high-action' })
    expect(highAction.messages[0].content).toContain('high action and grit')
  })

  it('adds no content-intensity instruction for standard, but does for mature/explicit', () => {
    const standard = assemblePrompt({ ...baseParams(), contentIntensity: 'standard' })
    expect(standard.messages[0].content).not.toContain('Content intensity')

    const mature = assemblePrompt({ ...baseParams(), contentIntensity: 'mature' })
    expect(mature.messages[0].content).toContain('Content intensity')
    expect(mature.messages[0].content).toContain('consenting fictional characters')

    const explicit = assemblePrompt({ ...baseParams(), contentIntensity: 'explicit' })
    expect(explicit.messages[0].content).toContain('directly rather than fading to black')
  })
})

describe('assemblePrompt — Group Scene cast depth', () => {
  it('gives each secondary cast member more than just a name and one-line personality', () => {
    const finn = character({
      id: 2,
      name: 'Finn',
      appearance: 'Lanky, sun-browned, a scar across one eyebrow.',
      personality: 'Blunt but soft-hearted.',
      speechStyle: 'Short sentences, dry humor, rarely swears.',
      background: 'A retired courier who knows every back alley in the city.'
    })
    const { messages } = assemblePrompt({ ...baseParams(), groupCharacters: [finn] })
    expect(messages[0].content).toContain('Lanky, sun-browned')
    expect(messages[0].content).toContain('Short sentences, dry humor')
    expect(messages[0].content).toContain('retired courier')
  })

  it('still works when a secondary character has no fields filled in', () => {
    const blank = character({ id: 2, name: 'Blank', personality: '', speechStyle: '', appearance: '', background: '' })
    const { messages } = assemblePrompt({ ...baseParams(), groupCharacters: [blank] })
    expect(messages[0].content).toContain('Blank')
  })
})
