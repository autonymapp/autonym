import { app } from 'electron'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { logError } from './logger'
import { CHAT_PRESETS } from '@shared/presets'
import type {
  AvatarType,
  Character,
  CharacterInput,
  CharacterRelationship,
  CharacterRelationshipInput,
  Chat,
  ChatInput,
  ChatMessage,
  ChatMessageInput,
  CustomPreset,
  CustomPresetInput,
  JournalEntry,
  JournalEntryInput,
  LoreEntry,
  LoreEntryInput,
  Lorebook,
  LorebookInput,
  Persona,
  PersonaInput,
  RpMode,
  SamplerSettings,
  Scenario,
  ScenarioInput,
  Storyline,
  StorylineInput,
  Universe,
  UniverseInput
} from '@shared/types'

interface CharacterLorebookLink {
  characterId: number
  lorebookId: number
}

interface Store {
  nextId: number
  characters: Character[]
  personas: Persona[]
  lorebooks: Lorebook[]
  loreEntries: LoreEntry[]
  characterLorebooks: CharacterLorebookLink[]
  characterRelationships: CharacterRelationship[]
  chats: Chat[]
  messages: ChatMessage[]
  customPresets: CustomPreset[]
  scenarios: Scenario[]
  storylines: Storyline[]
  journalEntries: JournalEntry[]
  universes: Universe[]
}

function emptyStore(): Store {
  return {
    nextId: 1,
    characters: [],
    personas: [],
    lorebooks: [],
    loreEntries: [],
    characterLorebooks: [],
    characterRelationships: [],
    chats: [],
    customPresets: [],
    scenarios: [],
    storylines: [],
    journalEntries: [],
    messages: [],
    universes: []
  }
}

let store: Store
let dbPath: string

/** Writes to a sibling temp file then renames it over the real path — rename is atomic on the
 *  same filesystem, so a crash or power loss mid-write can never leave app-data.json truncated
 *  or half-written. A direct writeFileSync to the real path can't make that guarantee. */
function persist(): void {
  const tmpPath = `${dbPath}.tmp`
  writeFileSync(tmpPath, JSON.stringify(store, null, 2))
  renameSync(tmpPath, dbPath)
}

function nextId(): number {
  return store.nextId++
}

function startFresh(): void {
  store = emptyStore()
  persist()
  seedTutorialContent()
}

/** Returns true if the existing app-data.json loaded successfully. On a parse failure (a
 *  corrupted file — e.g. from a crash mid-write, though persist() now writes atomically to guard
 *  against that going forward), renames the bad file aside instead of destroying it, so nothing
 *  is silently lost and the app still boots instead of crashing before any window shows. */
function loadExistingStore(): boolean {
  try {
    store = { ...emptyStore(), ...JSON.parse(readFileSync(dbPath, 'utf-8')) }
    return true
  } catch (err) {
    logError('Failed to parse app-data.json — treating as corrupted', err)
    try {
      renameSync(dbPath, `${dbPath}.corrupt-${Date.now()}`)
    } catch (renameErr) {
      logError('Failed to rename corrupted app-data.json aside', renameErr)
    }
    return false
  }
}

export function initDb(): void {
  dbPath = join(app.getPath('userData'), 'app-data.json')
  if (existsSync(dbPath) && loadExistingStore()) {
    // Backfill fields added after some chats were already created.
    store.chats = store.chats.map((c) => ({
      ...c,
      impersonatingCharacterId: (c as any).impersonatingCharacterId ?? null,
      scenarioId: (c as any).scenarioId ?? null,
      scenarioMilestoneIndex: (c as any).scenarioMilestoneIndex ?? 0,
      priorSummary: (c as any).priorSummary ?? null,
      storylineId: (c as any).storylineId ?? null,
      collaborativeMode: (c as any).collaborativeMode ?? false,
      tags: (c as any).tags ?? [],
      directorsNotes: (c as any).directorsNotes ?? '',
      inFictionDate: (c as any).inFictionDate ?? null,
      groupCharacterIds: (c as any).groupCharacterIds ?? [],
      universeId: (c as any).universeId ?? null,
      isSkit: (c as any).isSkit ?? false,
      skitLength: (c as any).skitLength ?? null,
      moodPreset: (c as any).moodPreset ?? null,
      contentIntensity: (c as any).contentIntensity ?? 'standard',
      deletedAt: (c as any).deletedAt ?? null
    }))
    store.universes = store.universes ?? []
    // One-time migration: settingTag (free text) becomes a real Universe. Two characters
    // sharing the same settingTag string land in the same Universe rather than duplicating it.
    const universeIdByName = new Map<string, number>()
    for (const u of store.universes) universeIdByName.set(u.name, u.id)
    store.characters = store.characters.map((c) => {
      const { settingTag, ...rest } = c as any as Character & { settingTag?: string | null }
      let universeId: number | null = rest.universeId ?? null
      if (universeId === null && settingTag) {
        let existingId = universeIdByName.get(settingTag)
        if (existingId === undefined) {
          const universe = universeRepo.create({ name: settingTag, description: '' })
          existingId = universe.id
          universeIdByName.set(settingTag, existingId)
        }
        universeId = existingId
      }
      return {
        ...rest,
        avatarType: rest.avatarType ?? (rest.avatarPath ? 'image' : 'monogram'),
        avatarEmoji: rest.avatarEmoji ?? null,
        universeId,
        baseCharacterId: rest.baseCharacterId ?? null,
        isWorldbuildingAssistant: rest.isWorldbuildingAssistant ?? false,
        tags: rest.tags ?? [],
        deletedAt: rest.deletedAt ?? null
      }
    })
    store.messages = store.messages.map((m) => ({
      ...m,
      variants: (m as any).variants ?? [m.content],
      activeVariantIndex: (m as any).activeVariantIndex ?? 0,
      bookmarked: (m as any).bookmarked ?? false,
      speakerCharacterId: (m as any).speakerCharacterId ?? null,
      matchedLoreEntryIds: (m as any).matchedLoreEntryIds ?? []
    }))
    store.lorebooks = store.lorebooks.map((lb) => ({
      ...lb,
      isCanonSetting: (lb as any).isCanonSetting ?? false,
      universeId: (lb as any).universeId ?? null,
      deletedAt: (lb as any).deletedAt ?? null
    }))
    store.loreEntries = store.loreEntries.map((e) => {
      const old = e as any
      if (old.entryType) return e
      return {
        id: old.id,
        lorebookId: old.lorebookId,
        title: old.title,
        keywords: old.keywords,
        description: old.description ?? '',
        enabled: old.enabled,
        createdAt: old.createdAt,
        entryType: 'other' as const,
        fields: { appearance: old.appearance ?? '', history: old.history ?? '' }
      }
    })
    persist()
  } else {
    startFresh()
  }
  // One-time recovery: The Prompter got hard-deleted from a real user's save at some point
  // during testing. Since seeding only ever runs on a truly fresh install, restore it here
  // if it's missing, without touching anything else already in the store.
  if (!store.characters.some((c) => c.tags.includes('tutorial'))) {
    seedTutorialContent()
  }
}

const PROMPTER_FIRST_MESSAGE = `*A single lamp flickers in the wings, and a figure looks up from a stack of loose pages, waving you over with an ink-stained hand.*

"Ah — there you are. Come in, come in, mind the props.

I'm the Prompter. I've read every script that's ever come through this theater, so consider me your cue card for however long you need one.

Here's the shape of things: everything you do lives inside an Act — that's just what we call a single roleplay, a running conversation. You're in one with me right now, actually. Up in the sidebar you'll find your whole Cast — every character you create lives there, and you can open a fresh Act with any of them whenever the mood strikes.

If you ever want to give a story real teeth — a setting, a history, rules that don't bend — that's what a Lorebook is for. Drop in a few cue words, and the moment they come up in conversation, I'll quietly remember the details for you.

And if a story's got real shape to it — a beginning, a middle, somewhere it's heading — the Scenario Maker lets you lay out a Beat Sheet. I'll pace myself to it, one beat at a time, and I won't go running ahead to the ending before you're ready.

*They set down their pages and look at you properly now.*

"One more thing, and it matters more than all the rest: none of this works without a key. Head to Settings and paste in an OpenRouter key — that's what actually lets me speak. It won't cost more than pennies to get started, and the instructions are waiting right there.

Take your time getting settled. I'll be right here in the wings whenever you're ready to begin."`

/** Seeds one tutorial cast member and an act already started with them, so a brand-new
 *  install isn't a blank slate. Only runs once, the very first time the app launches
 *  (no existing app-data.json yet). */
function seedTutorialContent(): void {
  const preset = CHAT_PRESETS[0]

  const character = characterRepo.create({
    name: 'The Prompter',
    avatarType: 'emoji' as AvatarType,
    avatarPath: null,
    avatarEmoji: '📖',
    universeId: null,
    baseCharacterId: null,
    isWorldbuildingAssistant: false,
    tags: ['tutorial'],
    appearance:
      'A quiet figure who exists just offstage, half-lit by a single working lamp, sleeves rolled and one hand permanently smudged with ink from marking up scripts.',
    personality:
      "Warm, unflappable, quietly delighted by new stories. Speaks in theater metaphors without ever being pretentious about it. Patient with beginners, protective of pacing, allergic to spoilers.",
    speechStyle:
      "Calm and a little old-fashioned, like someone who's spent decades in the wings of a theater. Uses stage terms naturally — cues, beats, curtains, blocking — and slips easily between in-character warmth and plain, practical guidance.",
    background:
      "The Prompter has read every script that's ever come through this theater — every Act, every Cast member, every Beat Sheet. Their job is to make sure nothing gets lost, and to help new directors find their footing before the curtain rises on stories of their own.",
    relationships: '',
    scenario:
      "You've just stepped backstage at a theater that doesn't exist yet — this is where your own stories will be built. The Prompter is here to help you get your bearings before the curtain goes up.",
    firstMessage: PROMPTER_FIRST_MESSAGE,
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
    title: 'Meet the Prompter',
    modelId: preset.modelId,
    rpMode: 'narrative' as RpMode,
    samplerSettings: preset.samplerSettings
  })

  messageRepo.create({
    chatId: chat.id,
    role: 'assistant',
    content: character.firstMessage
  })
}

const now = () => new Date().toISOString()

export const characterRepo = {
  /** Excludes trashed characters and auto-created Universe co-writer characters — the latter
   *  exist only to run worldbuilding Acts and are never meant to be managed like a real character. */
  list(): Character[] {
    return store.characters
      .filter((c) => !c.deletedAt && !c.isWorldbuildingAssistant)
      .sort((a, b) => a.name.localeCompare(b.name))
  },
  get(id: number): Character | undefined {
    return store.characters.find((c) => c.id === id)
  },
  create(input: CharacterInput): Character {
    const character: Character = { ...input, id: nextId(), createdAt: now(), deletedAt: null }
    store.characters.push(character)
    persist()
    return character
  },
  update(id: number, input: CharacterInput): Character {
    const idx = store.characters.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Character not found')
    store.characters[idx] = { ...store.characters[idx], ...input }
    persist()
    return store.characters[idx]
  },
  /** Soft-delete — moves to Trash. Doesn't cascade to their chats/lorebook links/etc.,
   *  which simply become unreachable via the UI until the character is restored. */
  delete(id: number): void {
    const idx = store.characters.findIndex((c) => c.id === id)
    if (idx === -1) return
    store.characters[idx] = { ...store.characters[idx], deletedAt: now() }
    persist()
  },
  restore(id: number): void {
    const idx = store.characters.findIndex((c) => c.id === id)
    if (idx === -1) return
    store.characters[idx] = { ...store.characters[idx], deletedAt: null }
    persist()
  },
  listTrashed(): Character[] {
    return store.characters
      .filter((c) => !!c.deletedAt)
      .sort((a, b) => (b.deletedAt as string).localeCompare(a.deletedAt as string))
  },
  /** The real, unrecoverable delete — used by "Empty Trash." Cascades to everything
   *  that only makes sense in the context of this character. */
  permanentlyDelete(id: number): void {
    store.characters = store.characters
      .filter((c) => c.id !== id)
      .map((c) => (c.baseCharacterId === id ? { ...c, baseCharacterId: null } : c))
    const chatIds = store.chats.filter((c) => c.characterId === id).map((c) => c.id)
    store.chats = store.chats.filter((c) => c.characterId !== id)
    store.messages = store.messages.filter((m) => !chatIds.includes(m.chatId))
    store.characterLorebooks = store.characterLorebooks.filter((l) => l.characterId !== id)
    store.characterRelationships = store.characterRelationships.filter(
      (r) => r.characterAId !== id && r.characterBId !== id
    )
    store.storylines = store.storylines.filter((s) => s.characterId !== id)
    store.journalEntries = store.journalEntries.filter((j) => j.characterId !== id)
    store.universes = store.universes.map((u) =>
      u.coWriterCharacterId === id ? { ...u, coWriterCharacterId: null } : u
    )
    persist()
  },
  linkLorebook(characterId: number, lorebookId: number): void {
    if (
      !store.characterLorebooks.some(
        (l) => l.characterId === characterId && l.lorebookId === lorebookId
      )
    ) {
      store.characterLorebooks.push({ characterId, lorebookId })
      persist()
    }
  },
  unlinkLorebook(characterId: number, lorebookId: number): void {
    store.characterLorebooks = store.characterLorebooks.filter(
      (l) => !(l.characterId === characterId && l.lorebookId === lorebookId)
    )
    persist()
  },
  getLorebookIds(characterId: number): number[] {
    return store.characterLorebooks
      .filter((l) => l.characterId === characterId)
      .map((l) => l.lorebookId)
  }
}

export const relationshipRepo = {
  list(): CharacterRelationship[] {
    return [...store.characterRelationships]
  },
  listForCharacter(characterId: number): CharacterRelationship[] {
    return store.characterRelationships.filter(
      (r) => r.characterAId === characterId || r.characterBId === characterId
    )
  },
  getForPair(aId: number, bId: number): CharacterRelationship | undefined {
    return store.characterRelationships.find(
      (r) =>
        (r.characterAId === aId && r.characterBId === bId) ||
        (r.characterAId === bId && r.characterBId === aId)
    )
  },
  /** Creates or replaces the single relationship for this unordered pair. */
  upsert(input: CharacterRelationshipInput): CharacterRelationship {
    const existing = relationshipRepo.getForPair(input.characterAId, input.characterBId)
    if (existing) {
      const idx = store.characterRelationships.findIndex((r) => r.id === existing.id)
      store.characterRelationships[idx] = {
        ...existing,
        label: input.label,
        description: input.description
      }
      persist()
      return store.characterRelationships[idx]
    }
    const relationship: CharacterRelationship = { ...input, id: nextId(), createdAt: now() }
    store.characterRelationships.push(relationship)
    persist()
    return relationship
  },
  delete(id: number): void {
    store.characterRelationships = store.characterRelationships.filter((r) => r.id !== id)
    persist()
  }
}

export const personaRepo = {
  list(): Persona[] {
    return [...store.personas].sort((a, b) => a.name.localeCompare(b.name))
  },
  get(id: number): Persona | undefined {
    return store.personas.find((p) => p.id === id)
  },
  create(input: PersonaInput): Persona {
    const persona: Persona = { ...input, id: nextId(), createdAt: now() }
    store.personas.push(persona)
    persist()
    return persona
  },
  update(id: number, input: PersonaInput): Persona {
    const idx = store.personas.findIndex((p) => p.id === id)
    if (idx === -1) throw new Error('Persona not found')
    store.personas[idx] = { ...store.personas[idx], ...input }
    persist()
    return store.personas[idx]
  },
  delete(id: number): void {
    store.personas = store.personas.filter((p) => p.id !== id)
    store.chats = store.chats.map((c) => (c.personaId === id ? { ...c, personaId: null } : c))
    persist()
  }
}

export const lorebookRepo = {
  list(): Lorebook[] {
    return store.lorebooks.filter((l) => !l.deletedAt).sort((a, b) => a.name.localeCompare(b.name))
  },
  get(id: number): Lorebook | undefined {
    return store.lorebooks.find((l) => l.id === id)
  },
  create(input: LorebookInput): Lorebook {
    const lorebook: Lorebook = { ...input, id: nextId(), createdAt: now(), deletedAt: null }
    store.lorebooks.push(lorebook)
    persist()
    return lorebook
  },
  update(id: number, input: LorebookInput): Lorebook {
    const idx = store.lorebooks.findIndex((l) => l.id === id)
    if (idx === -1) throw new Error('Lorebook not found')
    store.lorebooks[idx] = { ...store.lorebooks[idx], ...input }
    persist()
    return store.lorebooks[idx]
  },
  /** Soft-delete — moves to Trash. Entries stay put, unreachable until restored. */
  delete(id: number): void {
    const idx = store.lorebooks.findIndex((l) => l.id === id)
    if (idx === -1) return
    store.lorebooks[idx] = { ...store.lorebooks[idx], deletedAt: now() }
    persist()
  },
  restore(id: number): void {
    const idx = store.lorebooks.findIndex((l) => l.id === id)
    if (idx === -1) return
    store.lorebooks[idx] = { ...store.lorebooks[idx], deletedAt: null }
    persist()
  },
  listTrashed(): Lorebook[] {
    return store.lorebooks
      .filter((l) => !!l.deletedAt)
      .sort((a, b) => (b.deletedAt as string).localeCompare(a.deletedAt as string))
  },
  permanentlyDelete(id: number): void {
    store.lorebooks = store.lorebooks.filter((l) => l.id !== id)
    store.loreEntries = store.loreEntries.filter((e) => e.lorebookId !== id)
    store.characterLorebooks = store.characterLorebooks.filter((l) => l.lorebookId !== id)
    persist()
  }
}

export const universeRepo = {
  list(): Universe[] {
    return store.universes.filter((u) => !u.deletedAt).sort((a, b) => a.name.localeCompare(b.name))
  },
  get(id: number): Universe | undefined {
    return store.universes.find((u) => u.id === id)
  },
  create(input: UniverseInput): Universe {
    const universe: Universe = {
      ...input,
      id: nextId(),
      coWriterCharacterId: null,
      createdAt: now(),
      deletedAt: null
    }
    store.universes.push(universe)
    persist()
    return universe
  },
  update(id: number, input: UniverseInput): Universe {
    const idx = store.universes.findIndex((u) => u.id === id)
    if (idx === -1) throw new Error('Universe not found')
    store.universes[idx] = { ...store.universes[idx], ...input }
    persist()
    return store.universes[idx]
  },
  setCoWriterCharacterId(id: number, coWriterCharacterId: number): Universe {
    const idx = store.universes.findIndex((u) => u.id === id)
    if (idx === -1) throw new Error('Universe not found')
    store.universes[idx] = { ...store.universes[idx], coWriterCharacterId }
    persist()
    return store.universes[idx]
  },
  /** Soft-delete — moves to Trash. Characters stay put, unassigned in the UI until restored. */
  delete(id: number): void {
    const idx = store.universes.findIndex((u) => u.id === id)
    if (idx === -1) return
    store.universes[idx] = { ...store.universes[idx], deletedAt: now() }
    persist()
  },
  restore(id: number): void {
    const idx = store.universes.findIndex((u) => u.id === id)
    if (idx === -1) return
    store.universes[idx] = { ...store.universes[idx], deletedAt: null }
    persist()
  },
  listTrashed(): Universe[] {
    return store.universes
      .filter((u) => !!u.deletedAt)
      .sort((a, b) => (b.deletedAt as string).localeCompare(a.deletedAt as string))
  },
  permanentlyDelete(id: number): void {
    store.universes = store.universes.filter((u) => u.id !== id)
    store.characters = store.characters.map((c) =>
      c.universeId === id ? { ...c, universeId: null } : c
    )
    store.chats = store.chats.map((c) => (c.universeId === id ? { ...c, universeId: null } : c))
    persist()
  }
}

export const loreEntryRepo = {
  listByLorebook(lorebookId: number): LoreEntry[] {
    return store.loreEntries
      .filter((e) => e.lorebookId === lorebookId)
      .sort((a, b) => a.title.localeCompare(b.title))
  },
  listByLorebooks(lorebookIds: number[]): LoreEntry[] {
    return store.loreEntries.filter((e) => lorebookIds.includes(e.lorebookId) && e.enabled)
  },
  get(id: number): LoreEntry | undefined {
    return store.loreEntries.find((e) => e.id === id)
  },
  create(input: LoreEntryInput): LoreEntry {
    const entry: LoreEntry = { ...input, id: nextId(), createdAt: now() }
    store.loreEntries.push(entry)
    persist()
    return entry
  },
  update(id: number, input: LoreEntryInput): LoreEntry {
    const idx = store.loreEntries.findIndex((e) => e.id === id)
    if (idx === -1) throw new Error('Lore entry not found')
    store.loreEntries[idx] = { ...store.loreEntries[idx], ...input }
    persist()
    return store.loreEntries[idx]
  },
  delete(id: number): void {
    store.loreEntries = store.loreEntries.filter((e) => e.id !== id)
    persist()
  }
}

export const chatRepo = {
  listByCharacter(characterId: number): Chat[] {
    return store.chats
      .filter((c) => c.characterId === characterId && !c.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },
  listAll(): Chat[] {
    return store.chats.filter((c) => !c.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },
  get(id: number): Chat | undefined {
    return store.chats.find((c) => c.id === id)
  },
  create(input: ChatInput): Chat {
    const chat: Chat = { ...input, id: nextId(), createdAt: now(), deletedAt: null }
    store.chats.push(chat)
    persist()
    return chat
  },
  setTags(id: number, tags: string[]): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = { ...store.chats[idx], tags }
    persist()
    return store.chats[idx]
  },
  setDirectorsNotes(id: number, directorsNotes: string): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = { ...store.chats[idx], directorsNotes }
    persist()
    return store.chats[idx]
  },
  setMood(id: number, moodPreset: Chat['moodPreset']): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = { ...store.chats[idx], moodPreset }
    persist()
    return store.chats[idx]
  },
  setContentIntensity(id: number, contentIntensity: Chat['contentIntensity']): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = { ...store.chats[idx], contentIntensity }
    persist()
    return store.chats[idx]
  },
  setFictionalDate(id: number, inFictionDate: string | null): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = { ...store.chats[idx], inFictionDate }
    persist()
    return store.chats[idx]
  },
  setGroupCharacterIds(id: number, groupCharacterIds: number[]): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = { ...store.chats[idx], groupCharacterIds }
    persist()
    return store.chats[idx]
  },
  updateSettings(
    id: number,
    modelId: string,
    samplerSettings: SamplerSettings,
    rpMode: RpMode
  ): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = { ...store.chats[idx], modelId, samplerSettings, rpMode }
    persist()
    return store.chats[idx]
  },
  rename(id: number, title: string): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = { ...store.chats[idx], title }
    persist()
    return store.chats[idx]
  },
  setImpersonation(id: number, impersonatingCharacterId: number | null): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = {
      ...store.chats[idx],
      impersonatingCharacterId,
      personaId: impersonatingCharacterId ? null : store.chats[idx].personaId
    }
    persist()
    return store.chats[idx]
  },
  setPersona(id: number, personaId: number | null): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = {
      ...store.chats[idx],
      personaId,
      impersonatingCharacterId: personaId ? null : store.chats[idx].impersonatingCharacterId
    }
    persist()
    return store.chats[idx]
  },
  setScenario(id: number, scenarioId: number | null): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = { ...store.chats[idx], scenarioId, scenarioMilestoneIndex: 0 }
    persist()
    return store.chats[idx]
  },
  setMilestoneIndex(id: number, scenarioMilestoneIndex: number): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = { ...store.chats[idx], scenarioMilestoneIndex }
    persist()
    return store.chats[idx]
  },
  setStoryline(id: number, storylineId: number | null): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = { ...store.chats[idx], storylineId }
    persist()
    return store.chats[idx]
  },
  setCollaborativeMode(id: number, collaborativeMode: boolean): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = { ...store.chats[idx], collaborativeMode }
    persist()
    return store.chats[idx]
  },
  /** Soft-delete — moves to Trash. Messages stay put, unreachable until restored. */
  delete(id: number): void {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) return
    store.chats[idx] = { ...store.chats[idx], deletedAt: now() }
    persist()
  },
  restore(id: number): void {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) return
    store.chats[idx] = { ...store.chats[idx], deletedAt: null }
    persist()
  },
  listTrashed(): Chat[] {
    return store.chats
      .filter((c) => !!c.deletedAt)
      .sort((a, b) => (b.deletedAt as string).localeCompare(a.deletedAt as string))
  },
  permanentlyDelete(id: number): void {
    store.chats = store.chats.filter((c) => c.id !== id)
    store.messages = store.messages.filter((m) => m.chatId !== id)
    persist()
  }
}

export const messageRepo = {
  listByChat(chatId: number): ChatMessage[] {
    return store.messages.filter((m) => m.chatId === chatId).sort((a, b) => a.id - b.id)
  },
  get(id: number): ChatMessage | undefined {
    return store.messages.find((m) => m.id === id)
  },
  create(input: ChatMessageInput): ChatMessage {
    const message: ChatMessage = {
      ...input,
      variants: input.variants ?? [input.content],
      activeVariantIndex: input.activeVariantIndex ?? 0,
      bookmarked: input.bookmarked ?? false,
      speakerCharacterId: input.speakerCharacterId ?? null,
      matchedLoreEntryIds: input.matchedLoreEntryIds ?? [],
      id: nextId(),
      createdAt: now()
    }
    store.messages.push(message)
    persist()
    return message
  },
  toggleBookmark(id: number): ChatMessage {
    const idx = store.messages.findIndex((m) => m.id === id)
    if (idx === -1) throw new Error('Message not found')
    store.messages[idx] = { ...store.messages[idx], bookmarked: !store.messages[idx].bookmarked }
    persist()
    return store.messages[idx]
  },
  listBookmarked(): ChatMessage[] {
    return store.messages.filter((m) => m.bookmarked).sort((a, b) => b.id - a.id)
  },
  searchAll(query: string): ChatMessage[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return store.messages
      .filter((m) => m.content.toLowerCase().includes(q))
      .sort((a, b) => b.id - a.id)
      .slice(0, 50)
  },
  /** Updates the currently-displayed text — also patches the active variant so a later
   *  swipe-away-and-back doesn't lose the edit. */
  setSpeaker(id: number, speakerCharacterId: number | null): ChatMessage {
    const idx = store.messages.findIndex((m) => m.id === id)
    if (idx === -1) throw new Error('Message not found')
    store.messages[idx] = { ...store.messages[idx], speakerCharacterId }
    persist()
    return store.messages[idx]
  },
  setMatchedLoreEntries(id: number, matchedLoreEntryIds: number[]): void {
    const idx = store.messages.findIndex((m) => m.id === id)
    if (idx === -1) return
    store.messages[idx] = { ...store.messages[idx], matchedLoreEntryIds }
    persist()
  },
  updateContent(id: number, content: string): void {
    const idx = store.messages.findIndex((m) => m.id === id)
    if (idx === -1) return
    const msg = store.messages[idx]
    const variants = [...msg.variants]
    variants[msg.activeVariantIndex] = content
    store.messages[idx] = { ...msg, content, variants }
    persist()
  },
  addVariant(id: number, content: string): ChatMessage {
    const idx = store.messages.findIndex((m) => m.id === id)
    if (idx === -1) throw new Error('Message not found')
    const msg = store.messages[idx]
    const variants = [...msg.variants, content]
    store.messages[idx] = { ...msg, content, variants, activeVariantIndex: variants.length - 1 }
    persist()
    return store.messages[idx]
  },
  setActiveVariant(id: number, index: number): ChatMessage {
    const idx = store.messages.findIndex((m) => m.id === id)
    if (idx === -1) throw new Error('Message not found')
    const msg = store.messages[idx]
    const clamped = Math.max(0, Math.min(index, msg.variants.length - 1))
    store.messages[idx] = { ...msg, content: msg.variants[clamped], activeVariantIndex: clamped }
    persist()
    return store.messages[idx]
  },
  delete(id: number): void {
    store.messages = store.messages.filter((m) => m.id !== id)
    persist()
  },
  /** Used by "Regenerate Whole Skit" to clear a chat back to a blank slate before rerunning
   *  generation from turn one. */
  deleteAllForChat(chatId: number): void {
    store.messages = store.messages.filter((m) => m.chatId !== chatId)
    persist()
  }
}

export const customPresetRepo = {
  list(): CustomPreset[] {
    return [...store.customPresets].sort((a, b) => a.name.localeCompare(b.name))
  },
  create(input: CustomPresetInput): CustomPreset {
    const preset: CustomPreset = { ...input, id: nextId(), createdAt: now() }
    store.customPresets.push(preset)
    persist()
    return preset
  },
  update(id: number, input: Partial<CustomPresetInput>): CustomPreset {
    const idx = store.customPresets.findIndex((p) => p.id === id)
    if (idx === -1) throw new Error('Style not found')
    store.customPresets[idx] = { ...store.customPresets[idx], ...input }
    persist()
    return store.customPresets[idx]
  },
  delete(id: number): void {
    store.customPresets = store.customPresets.filter((p) => p.id !== id)
    persist()
  }
}

export const scenarioRepo = {
  list(): Scenario[] {
    return [...store.scenarios].sort((a, b) => a.name.localeCompare(b.name))
  },
  get(id: number): Scenario | undefined {
    return store.scenarios.find((s) => s.id === id)
  },
  create(input: ScenarioInput): Scenario {
    const scenario: Scenario = { ...input, id: nextId(), createdAt: now() }
    store.scenarios.push(scenario)
    persist()
    return scenario
  },
  update(id: number, input: ScenarioInput): Scenario {
    const idx = store.scenarios.findIndex((s) => s.id === id)
    if (idx === -1) throw new Error('Scenario not found')
    store.scenarios[idx] = { ...store.scenarios[idx], ...input }
    persist()
    return store.scenarios[idx]
  },
  delete(id: number): void {
    store.scenarios = store.scenarios.filter((s) => s.id !== id)
    store.chats = store.chats.map((c) =>
      c.scenarioId === id ? { ...c, scenarioId: null, scenarioMilestoneIndex: 0 } : c
    )
    persist()
  }
}

export const storylineRepo = {
  listForCharacter(characterId: number): Storyline[] {
    return store.storylines
      .filter((s) => s.characterId === characterId)
      .sort((a, b) => a.name.localeCompare(b.name))
  },
  create(input: StorylineInput): Storyline {
    const storyline: Storyline = { ...input, id: nextId(), createdAt: now() }
    store.storylines.push(storyline)
    persist()
    return storyline
  },
  rename(id: number, name: string): Storyline {
    const idx = store.storylines.findIndex((s) => s.id === id)
    if (idx === -1) throw new Error('Storyline not found')
    store.storylines[idx] = { ...store.storylines[idx], name }
    persist()
    return store.storylines[idx]
  },
  delete(id: number): void {
    store.storylines = store.storylines.filter((s) => s.id !== id)
    store.chats = store.chats.map((c) => (c.storylineId === id ? { ...c, storylineId: null } : c))
    persist()
  }
}

export const journalRepo = {
  listForCharacter(characterId: number): JournalEntry[] {
    return store.journalEntries
      .filter((j) => j.characterId === characterId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },
  /** One entry per chat — regenerating replaces the existing entry for that chat. */
  upsertForChat(input: JournalEntryInput): JournalEntry {
    const existingIdx = store.journalEntries.findIndex((j) => j.chatId === input.chatId)
    if (existingIdx !== -1) {
      store.journalEntries[existingIdx] = {
        ...store.journalEntries[existingIdx],
        chatTitle: input.chatTitle,
        summary: input.summary
      }
      persist()
      return store.journalEntries[existingIdx]
    }
    const entry: JournalEntry = { ...input, id: nextId(), createdAt: now() }
    store.journalEntries.push(entry)
    persist()
    return entry
  },
  delete(id: number): void {
    store.journalEntries = store.journalEntries.filter((j) => j.id !== id)
    persist()
  }
}
