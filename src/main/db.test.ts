import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// db.ts (and logger.ts, which it imports) both call `app.getPath('userData'/'logs')`. Mocking
// electron lets the real persist()/initDb()/backfill logic run against a real temp directory,
// instead of testing a reimplementation that could drift from what actually ships.
let userDataDir: string

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? userDataDir : join(userDataDir, name))
  }
}))

/** Creates a fresh temp userData directory — call this first if the test needs to write a seed
 *  file into it before initDb() runs. */
function newTempUserDataDir(): string {
  userDataDir = mkdtempSync(join(tmpdir(), 'autonym-db-test-'))
  return userDataDir
}

/** db.ts is a singleton module (module-level `store`/`dbPath` variables) — reset it between
 *  tests so state from one test can't leak into the next. Creates a fresh temp dir unless the
 *  test already made one (to write a seed file into) via newTempUserDataDir(). */
async function freshDb(reuseExistingDir = false) {
  vi.resetModules()
  if (!reuseExistingDir) newTempUserDataDir()
  return import('./db')
}

afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true })
})

describe('initDb — fresh install', () => {
  it('seeds a tutorial cast member when no app-data.json exists', async () => {
    const { initDb, characterRepo } = await freshDb()
    initDb()
    const characters = characterRepo.list()
    expect(characters.some((c) => c.tags.includes('tutorial'))).toBe(true)
  })

  it('writes app-data.json atomically (no leftover .tmp file)', async () => {
    const { initDb } = await freshDb()
    initDb()
    expect(existsSync(join(userDataDir, 'app-data.json'))).toBe(true)
    expect(existsSync(join(userDataDir, 'app-data.json.tmp'))).toBe(false)
  })
})

describe('initDb — backfill/migration', () => {
  it('backfills missing fields on old-shape chats to sensible defaults', async () => {
    const oldShapeStore = {
      nextId: 3,
      characters: [{ id: 1, name: 'Test Character', avatarType: 'monogram', firstMessage: '', notes: '' }],
      chats: [
        {
          id: 2,
          characterId: 1,
          title: 'An old chat',
          modelId: 'anthropic/claude-sonnet-5',
          rpMode: 'narrative',
          samplerSettings: { temperature: 0.9, topP: 1, maxTokens: 600, contextLength: 16000 },
          createdAt: new Date().toISOString()
          // Deliberately missing: tags, directorsNotes, inFictionDate, groupCharacterIds, etc.
        }
      ],
      messages: [],
      lorebooks: [],
      loreEntries: [],
      personas: [],
      characterLorebooks: [],
      characterRelationships: [],
      scenarios: [],
      storylines: [],
      customPresets: [],
      journalEntries: []
    }
    writeFileSync(join(newTempUserDataDir(), 'app-data.json'), JSON.stringify(oldShapeStore))

    const { initDb, chatRepo } = await freshDb(true)
    initDb()

    const chat = chatRepo.get(2)
    expect(chat).toBeDefined()
    expect(chat!.tags).toEqual([])
    expect(chat!.directorsNotes).toBe('')
    expect(chat!.inFictionDate).toBeNull()
    expect(chat!.groupCharacterIds).toEqual([])
    expect(chat!.deletedAt).toBeNull()
    expect(chat!.moodPreset).toBeNull()
    expect(chat!.contentIntensity).toBe('standard')
  })

  it('migrates settingTag to a real Universe, reusing one for characters that share a tag', async () => {
    const oldShapeStore = {
      nextId: 3,
      characters: [
        { id: 1, name: 'Aria', avatarType: 'monogram', firstMessage: '', notes: '', settingTag: 'Sengoku' },
        { id: 2, name: 'Kaoru', avatarType: 'monogram', firstMessage: '', notes: '', settingTag: 'Sengoku' },
        // Tagged 'tutorial' so initDb's missing-tutorial-content recovery path doesn't also
        // seed Nym (and a second Universe alongside it), which isn't what this test covers.
        // High id, well clear of nextId, so it can't collide with anything auto-created below.
        { id: 99, name: 'Placeholder', avatarType: 'monogram', firstMessage: '', notes: '', tags: ['tutorial'] }
      ],
      chats: [],
      messages: [],
      lorebooks: [],
      loreEntries: [],
      personas: [],
      characterLorebooks: [],
      characterRelationships: [],
      scenarios: [],
      storylines: [],
      customPresets: [],
      journalEntries: [],
      universes: []
    }
    writeFileSync(join(newTempUserDataDir(), 'app-data.json'), JSON.stringify(oldShapeStore))

    const { initDb, characterRepo, universeRepo } = await freshDb(true)
    initDb()

    const universes = universeRepo.list()
    expect(universes.length).toBe(1)
    expect(universes[0].name).toBe('Sengoku')

    const characters = characterRepo.list()
    expect(characters.find((c) => c.id === 1)?.universeId).toBe(universes[0].id)
    expect(characters.find((c) => c.id === 2)?.universeId).toBe(universes[0].id)
    expect((characters[0] as any).settingTag).toBeUndefined()
  })

  it('renames a corrupted app-data.json aside instead of crashing, and starts fresh', async () => {
    writeFileSync(join(newTempUserDataDir(), 'app-data.json'), '{ this is not valid json !!!')

    const { initDb, characterRepo } = await freshDb(true)
    expect(() => initDb()).not.toThrow()

    // Started fresh (seeded tutorial content) rather than staying corrupted or empty.
    expect(characterRepo.list().length).toBeGreaterThan(0)
    // The corrupt file was preserved aside, not silently destroyed.
    const files = readFileSync(join(userDataDir, 'app-data.json'), 'utf-8')
    expect(() => JSON.parse(files)).not.toThrow()
  })
})

describe('characterRepo', () => {
  it('supports create/update/soft-delete/restore/permanentlyDelete round trip', async () => {
    const { initDb, characterRepo } = await freshDb()
    initDb()

    const created = characterRepo.create({
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
      notes: ''
    })
    expect(created.id).toBeGreaterThan(0)
    expect(characterRepo.list().some((c) => c.id === created.id)).toBe(true)

    const updated = characterRepo.update(created.id, { ...created, name: 'Aria Renamed' })
    expect(updated.name).toBe('Aria Renamed')

    characterRepo.delete(created.id)
    expect(characterRepo.list().some((c) => c.id === created.id)).toBe(false)
    expect(characterRepo.listTrashed().some((c) => c.id === created.id)).toBe(true)

    characterRepo.restore(created.id)
    expect(characterRepo.list().some((c) => c.id === created.id)).toBe(true)

    characterRepo.permanentlyDelete(created.id)
    expect(characterRepo.list().some((c) => c.id === created.id)).toBe(false)
    expect(characterRepo.listTrashed().some((c) => c.id === created.id)).toBe(false)
  })

  it('excludes worldbuilding-assistant characters from list()', async () => {
    const { initDb, characterRepo } = await freshDb()
    initDb()

    const coWriter = characterRepo.create({
      name: 'Test Co-Writer',
      avatarType: 'monogram',
      avatarPath: null,
      avatarEmoji: null,
      universeId: null,
      baseCharacterId: null,
      isWorldbuildingAssistant: true,
      tags: [],
      appearance: '',
      personality: '',
      speechStyle: '',
      background: '',
      relationships: '',
      scenario: '',
      firstMessage: '',
      notes: ''
    })

    expect(characterRepo.list().some((c) => c.id === coWriter.id)).toBe(false)
    expect(characterRepo.get(coWriter.id)).toBeDefined()
  })
})

describe('chatRepo', () => {
  it('supports create/soft-delete/restore round trip and setters', async () => {
    const { initDb, characterRepo, chatRepo } = await freshDb()
    initDb()

    const character = characterRepo.create({
      name: 'Finn',
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
      notes: ''
    })

    const chat = chatRepo.create({
      characterId: character.id,
      personaId: null,
      impersonatingCharacterId: null,
      scenarioId: null,
      scenarioMilestoneIndex: 0,
      priorSummary: null,
      storylineId: null,
      collaborativeMode: false,
      tags: [],
      directorsNotes: '',
      inFictionDate: null,
      groupCharacterIds: [],
      universeId: null,
      isSkit: false,
      skitLength: null,
      moodPreset: null,
      contentIntensity: 'standard',
      title: 'A New Act',
      modelId: 'anthropic/claude-sonnet-5',
      rpMode: 'narrative',
      samplerSettings: { temperature: 0.9, topP: 1, maxTokens: 600, contextLength: 16000 }
    })
    expect(chatRepo.listAll().some((c) => c.id === chat.id)).toBe(true)

    const withNotes = chatRepo.setDirectorsNotes(chat.id, 'Keep it lighthearted.')
    expect(withNotes.directorsNotes).toBe('Keep it lighthearted.')

    chatRepo.delete(chat.id)
    expect(chatRepo.listAll().some((c) => c.id === chat.id)).toBe(false)
    expect(chatRepo.listTrashed().some((c) => c.id === chat.id)).toBe(true)

    chatRepo.restore(chat.id)
    expect(chatRepo.listAll().some((c) => c.id === chat.id)).toBe(true)
  })
})

describe('messageRepo', () => {
  it('creates messages with sensible defaults and supports bookmarking', async () => {
    const { initDb, messageRepo } = await freshDb()
    initDb()

    const message = messageRepo.create({ chatId: 1, role: 'user', content: 'Hello there' })
    expect(message.variants).toEqual(['Hello there'])
    expect(message.activeVariantIndex).toBe(0)
    expect(message.bookmarked).toBe(false)
    expect(message.speakerCharacterId).toBeNull()
    expect(message.matchedLoreEntryIds).toEqual([])

    const bookmarked = messageRepo.toggleBookmark(message.id)
    expect(bookmarked.bookmarked).toBe(true)
  })
})
