import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock storage modules for unit test environment
vi.mock('./webStorage', () => ({
  loadLocalStore: vi.fn().mockResolvedValue(null),
  saveLocalStore: vi.fn().mockResolvedValue(undefined),
  saveLocalAvatar: vi.fn().mockResolvedValue(undefined),
  getLocalAvatar: vi.fn().mockResolvedValue(null),
  deleteLocalAvatar: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('./supabaseClient', () => ({
  loadStoreFromCloud: vi.fn().mockResolvedValue(null),
  saveStoreToCloud: vi.fn().mockResolvedValue(true),
  uploadAvatarToCloud: vi.fn().mockResolvedValue(null),
  subscribeToCloudChanges: vi.fn().mockReturnValue(() => {})
}))

describe('webDb — in-memory and repository logic', () => {
  beforeEach(async () => {
    vi.resetModules()
  })

  it('initializes fresh database cleanly without seed tutorial content', async () => {
    const { initDb, characterRepo, universeRepo, lorebookRepo } = await import('./webDb')
    await initDb()

    const characters = characterRepo.list()
    expect(characters.length).toBe(0)

    const universes = universeRepo.list()
    expect(universes.length).toBe(0)

    const lorebooks = lorebookRepo.list()
    expect(lorebooks.length).toBe(0)
  })

  it('handles character creation, update, and soft deletion', async () => {
    const { initDb, characterRepo } = await import('./webDb')
    await initDb()

    const char = characterRepo.create({
      name: 'Test Character',
      avatarType: 'monogram',
      avatarPath: null,
      avatarEmoji: null,
      universeId: null,
      baseCharacterId: null,
      isWorldbuildingAssistant: false,
      tags: ['test'],
      appearance: 'Tall and quiet.',
      personality: 'Calm under pressure.',
      speechStyle: 'Terse.',
      background: 'Former pilot.',
      relationships: '',
      scenario: 'Preparing for launch.',
      firstMessage: 'Radio check, anyone reading me?',
      notes: ''
    })

    expect(char.id).toBeDefined()
    expect(char.name).toBe('Test Character')

    // Update
    const updated = characterRepo.update(char.id, {
      ...char,
      personality: 'Witty and alert.'
    })
    expect(updated.personality).toBe('Witty and alert.')

    // Soft delete
    characterRepo.delete(char.id)
    const listAfterDelete = characterRepo.list()
    expect(listAfterDelete.some((c) => c.id === char.id)).toBe(false)

    // Trashed list
    const trashed = characterRepo.listTrashed()
    expect(trashed.some((c) => c.id === char.id)).toBe(true)

    // Restore
    characterRepo.restore(char.id)
    expect(characterRepo.list().some((c) => c.id === char.id)).toBe(true)
  })

  it('creates acts (chats) and manages message variants', async () => {
    const { initDb, chatRepo, messageRepo, characterRepo } = await import('./webDb')
    await initDb()

    const char = characterRepo.create({
      name: 'Act Tester',
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
      firstMessage: 'Hello',
      notes: ''
    })
    const chat = chatRepo.create({
      characterId: char.id,
      personaId: null,
      impersonatingCharacterId: null,
      scenarioId: null,
      scenarioMilestoneIndex: 0,
      priorSummary: null,
      storylineId: null,
      collaborativeMode: false,
      tags: ['test'],
      directorsNotes: '',
      inFictionDate: null,
      groupCharacterIds: [],
      universeId: null,
      isSkit: false,
      skitLength: null,
      moodPreset: 'slow-burn',
      contentIntensity: 'standard',
      title: 'Test Act',
      modelId: 'anthropic/claude-3.5-sonnet',
      rpMode: 'narrative',
      samplerSettings: {
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 500,
        contextLength: 4000
      }
    })

    expect(chat.title).toBe('Test Act')
    expect(chat.moodPreset).toBe('slow-burn')

    // Add message
    const msg = messageRepo.create({
      chatId: chat.id,
      role: 'assistant',
      content: 'Hello there.'
    })
    expect(msg.content).toBe('Hello there.')
    expect(msg.variants).toEqual(['Hello there.'])

    // Add variant (regeneration)
    const updatedMsg = messageRepo.addVariant(msg.id, 'Greetings traveler.')
    expect(updatedMsg.content).toBe('Greetings traveler.')
    expect(updatedMsg.variants.length).toBe(2)
    expect(updatedMsg.activeVariantIndex).toBe(1)

    // Switch variant
    const switched = messageRepo.setActiveVariant(msg.id, 0)
    expect(switched.content).toBe('Hello there.')
    expect(switched.activeVariantIndex).toBe(0)
  })
})
