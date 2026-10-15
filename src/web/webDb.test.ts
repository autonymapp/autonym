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
  loadSession: vi.fn().mockResolvedValue(null),
  loadStoreFromCloud: vi.fn().mockResolvedValue({ status: 'empty' }),
  saveStoreToCloud: vi.fn().mockResolvedValue('ok'),
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

function makeCharacter(id: number, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name,
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
    createdAt: '2026-10-01T00:00:00.000Z',
    deletedAt: null,
    ...extra
  }
}

describe('webDb — startup never destroys user data', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useRealTimers()
  })

  it('never uploads while the cloud copy cannot be read', async () => {
    vi.useFakeTimers()
    const cloud = await import('./supabaseClient')
    vi.mocked(cloud.loadStoreFromCloud).mockResolvedValue({ status: 'error' })
    vi.mocked(cloud.saveStoreToCloud).mockClear()

    const { initDb, characterRepo } = await import('./webDb')
    await initDb()
    characterRepo.create({ ...makeCharacter(0, 'Offline Edit') } as any)
    await vi.advanceTimersByTimeAsync(5000)

    expect(cloud.saveStoreToCloud).not.toHaveBeenCalled()
    vi.mocked(cloud.loadStoreFromCloud).mockResolvedValue({ status: 'empty' })
  })

  it('still uploads when the cloud was reached but is empty', async () => {
    vi.useFakeTimers()
    const cloud = await import('./supabaseClient')
    vi.mocked(cloud.loadStoreFromCloud).mockResolvedValueOnce({ status: 'empty' })
    vi.mocked(cloud.saveStoreToCloud).mockClear()

    const { initDb } = await import('./webDb')
    await initDb()
    await vi.advanceTimersByTimeAsync(5000)

    expect(cloud.saveStoreToCloud).toHaveBeenCalled()
  })

  it('removes only the legacy seed characters and keeps everything else', async () => {
    const cloud = await import('./supabaseClient')
    const { emptyStore } = await import('./webDb')
    const stored = {
      ...emptyStore(),
      nextId: 10,
      characters: [makeCharacter(1, 'Nym', { tags: ['tutorial'] })],
      personas: [{ id: 2, name: 'Me', description: '', createdAt: '2026-10-01T00:00:00.000Z' }],
      lorebooks: [{ id: 3, name: 'My World', description: '', isCanonSetting: false, universeId: null }]
    }
    vi.mocked(cloud.loadStoreFromCloud).mockResolvedValueOnce({ status: 'ok', store: stored as any })

    const { initDb } = await import('./webDb')
    await initDb()
    const { store: after } = await import('./webDb')

    expect(after.characters).toHaveLength(0)
    expect(after.personas).toHaveLength(1)
    expect(after.lorebooks).toHaveLength(1)
    expect(after.seedCleanupDone).toBe(true)
  })

  it('does not touch a user-tagged "tutorial" character or a later character named Wren', async () => {
    const cloud = await import('./supabaseClient')
    const { emptyStore } = await import('./webDb')
    const stored = {
      ...emptyStore(),
      nextId: 10,
      seedCleanupDone: true,
      characters: [makeCharacter(1, 'Wren'), makeCharacter(2, 'Teacher', { tags: ['tutorial'] })]
    }
    vi.mocked(cloud.loadStoreFromCloud).mockResolvedValueOnce({ status: 'ok', store: stored as any })

    const { initDb } = await import('./webDb')
    await initDb()
    const { store: after } = await import('./webDb')

    expect(after.characters.map((c) => c.name).sort()).toEqual(['Teacher', 'Wren'])
  })

  it('merges another device\'s changes instead of overwriting them when uploading', async () => {
    vi.useFakeTimers()
    const cloud = await import('./supabaseClient')
    const { emptyStore } = await import('./webDb')
    const phoneCopy = {
      ...emptyStore(),
      nextId: 2,
      characters: [makeCharacter(1, 'Made on Phone')],
      seedCleanupDone: true,
      syncMeta: { stamps: { characters: { '1': '2026-10-15T10:00:00.000Z' } }, tombstones: {} }
    }
    vi.mocked(cloud.loadStoreFromCloud)
      .mockResolvedValueOnce({ status: 'empty' }) // startup on the PC
      .mockResolvedValue({ status: 'ok', store: phoneCopy as any, updatedAt: '2026-10-15T10:00:00Z' })
    vi.mocked(cloud.saveStoreToCloud).mockClear()

    const { initDb, characterRepo } = await import('./webDb')
    await initDb()
    characterRepo.create({ ...makeCharacter(0, 'Made on PC') } as any)
    await vi.advanceTimersByTimeAsync(5000)

    const uploads = vi.mocked(cloud.saveStoreToCloud).mock.calls
    const last = uploads[uploads.length - 1]
    expect(last[0].characters.map((c) => c.name).sort()).toEqual(['Made on PC', 'Made on Phone'])
    expect(last[1]).toBe('2026-10-15T10:00:00Z')
    expect(characterRepo.list().map((c) => c.name).sort()).toEqual(['Made on PC', 'Made on Phone'])
  })
})
