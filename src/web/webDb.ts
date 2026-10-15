import type {
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
import { removeLegacySeedContent } from '@shared/legacySeedCleanup'
import { loadLocalStore, saveLocalStore } from './webStorage'
import { loadSession, loadStoreFromCloud, saveStoreToCloud, subscribeToCloudChanges } from './supabaseClient'
import { buildBaseline, mergeStores, stampChanges, type Baseline, type SyncMeta } from './syncMerge'

export interface CharacterLorebookLink {
  characterId: number
  lorebookId: number
}

export interface Store {
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
  /** Set once the one-time removal of legacy tutorial seed content has run. */
  seedCleanupDone?: boolean
  /** Per-record change times used to merge this store with other devices' copies. */
  syncMeta?: SyncMeta
}

export function emptyStore(): Store {
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

export let store: Store = emptyStore()

const listeners: Set<() => void> = new Set()

export function onStoreChange(callback: () => void): () => void {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}

function notifyChange(): void {
  listeners.forEach((cb) => {
    try {
      cb()
    } catch (e) {
      console.error('Store change listener error:', e)
    }
  })
}

export function setStore(newStore: Store, shouldPersist = true): void {
  store = backfill(newStore)
  if (shouldPersist) {
    persist()
  }
  notifyChange()
}

let syncTimer: ReturnType<typeof setTimeout> | null = null
let syncing = false
let syncRequested = false
// Serialized records as of the last stamp, used to find which records changed since.
let baseline: Baseline = new Map()
// Bumped on every local save, so a sync can tell whether edits landed while it was uploading.
let localVersion = 0

export function persist(): void {
  localVersion++
  saveLocalStore(store)
  scheduleSync()
}

function scheduleSync(delayMs = 1000): void {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    syncNow().catch((err) => console.warn('Supabase cloud sync failed:', err))
  }, delayMs)
}

/** Records local edits as dated changes, so they survive a merge with another device's copy. */
function stampLocalEdits(): void {
  baseline = stampChanges(store, baseline)
}

/**
 * Uploads this device's changes: reads the cloud copy, merges it record by record with the
 * local store, and writes the result only if nobody else wrote in between (retrying if they did).
 */
export async function syncNow(): Promise<void> {
  if (syncing) {
    syncRequested = true
    return
  }
  syncing = true
  let retryLater = false
  try {
    stampLocalEdits()
    if (!store.syncMeta?.pending) return
    saveLocalStore(store)

    for (let attempt = 0; attempt < 3; attempt++) {
      const cloud = await loadStoreFromCloud()
      // Unreadable cloud: its contents are unknown, so keep changes on this device (still marked
      // pending) and only upload after a later read succeeds.
      if (cloud.status === 'unavailable') return
      if (cloud.status === 'error') {
        retryLater = true
        return
      }

      const startVersion = localVersion
      stampLocalEdits()
      const merged = cloud.status === 'ok' ? mergeStores(store, backfill(cloud.store)) : store
      const upload: Store = { ...merged, syncMeta: { ...merged.syncMeta!, pending: false } }
      const result = await saveStoreToCloud(upload, cloud.status === 'ok' ? cloud.updatedAt : null)
      if (result === 'error') {
        retryLater = true
        return
      }
      if (result === 'conflict') continue

      if (localVersion === startVersion) {
        store = upload
      } else {
        // Edits landed during the upload: keep them on top of what was uploaded and go again.
        stampLocalEdits()
        store = mergeStores(store, upload)
        syncRequested = true
      }
      baseline = buildBaseline(store)
      saveLocalStore(store)
      notifyChange()
      return
    }
    syncRequested = true
  } finally {
    syncing = false
    if (syncRequested) {
      syncRequested = false
      scheduleSync()
    } else if (retryLater) {
      scheduleSync(30_000)
    }
  }
}

/**
 * New ids start from the current time in milliseconds, so records created on two synced devices
 * (both counting up from the same nextId while apart) don't end up with the same id. Still
 * increasing, so sorting by id keeps creation order.
 */
function nextId(): number {
  const id = Math.max(store.nextId, Date.now())
  store.nextId = id + 1
  return id
}

const now = () => new Date().toISOString()

export const characterRepo = {
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
    notifyChange()
    return character
  },
  update(id: number, input: CharacterInput): Character {
    const idx = store.characters.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Character not found')
    store.characters[idx] = { ...store.characters[idx], ...input }
    persist()
    notifyChange()
    return store.characters[idx]
  },
  delete(id: number): void {
    const idx = store.characters.findIndex((c) => c.id === id)
    if (idx === -1) return
    store.characters[idx] = { ...store.characters[idx], deletedAt: now() }
    persist()
    notifyChange()
  },
  restore(id: number): void {
    const idx = store.characters.findIndex((c) => c.id === id)
    if (idx === -1) return
    store.characters[idx] = { ...store.characters[idx], deletedAt: null }
    persist()
    notifyChange()
  },
  listTrashed(): Character[] {
    return store.characters
      .filter((c) => !!c.deletedAt)
      .sort((a, b) => (b.deletedAt as string).localeCompare(a.deletedAt as string))
  },
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
    notifyChange()
  },
  linkLorebook(characterId: number, lorebookId: number): void {
    if (
      !store.characterLorebooks.some(
        (l) => l.characterId === characterId && l.lorebookId === lorebookId
      )
    ) {
      store.characterLorebooks.push({ characterId, lorebookId })
      persist()
      notifyChange()
    }
  },
  unlinkLorebook(characterId: number, lorebookId: number): void {
    store.characterLorebooks = store.characterLorebooks.filter(
      (l) => !(l.characterId === characterId && l.lorebookId === lorebookId)
    )
    persist()
    notifyChange()
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
      notifyChange()
      return store.characterRelationships[idx]
    }
    const relationship: CharacterRelationship = { ...input, id: nextId(), createdAt: now() }
    store.characterRelationships.push(relationship)
    persist()
    notifyChange()
    return relationship
  },
  delete(id: number): void {
    store.characterRelationships = store.characterRelationships.filter((r) => r.id !== id)
    persist()
    notifyChange()
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
    notifyChange()
    return persona
  },
  update(id: number, input: PersonaInput): Persona {
    const idx = store.personas.findIndex((p) => p.id === id)
    if (idx === -1) throw new Error('Persona not found')
    store.personas[idx] = { ...store.personas[idx], ...input }
    persist()
    notifyChange()
    return store.personas[idx]
  },
  delete(id: number): void {
    store.personas = store.personas.filter((p) => p.id !== id)
    store.chats = store.chats.map((c) => (c.personaId === id ? { ...c, personaId: null } : c))
    persist()
    notifyChange()
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
    notifyChange()
    return lorebook
  },
  update(id: number, input: LorebookInput): Lorebook {
    const idx = store.lorebooks.findIndex((l) => l.id === id)
    if (idx === -1) throw new Error('Lorebook not found')
    store.lorebooks[idx] = { ...store.lorebooks[idx], ...input }
    persist()
    notifyChange()
    return store.lorebooks[idx]
  },
  delete(id: number): void {
    const idx = store.lorebooks.findIndex((l) => l.id === id)
    if (idx === -1) return
    store.lorebooks[idx] = { ...store.lorebooks[idx], deletedAt: now() }
    persist()
    notifyChange()
  },
  restore(id: number): void {
    const idx = store.lorebooks.findIndex((l) => l.id === id)
    if (idx === -1) return
    store.lorebooks[idx] = { ...store.lorebooks[idx], deletedAt: null }
    persist()
    notifyChange()
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
    notifyChange()
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
    notifyChange()
    return universe
  },
  update(id: number, input: UniverseInput): Universe {
    const idx = store.universes.findIndex((u) => u.id === id)
    if (idx === -1) throw new Error('Universe not found')
    store.universes[idx] = { ...store.universes[idx], ...input }
    persist()
    notifyChange()
    return store.universes[idx]
  },
  setCoWriterCharacterId(id: number, coWriterCharacterId: number): Universe {
    const idx = store.universes.findIndex((u) => u.id === id)
    if (idx === -1) throw new Error('Universe not found')
    store.universes[idx] = { ...store.universes[idx], coWriterCharacterId }
    persist()
    notifyChange()
    return store.universes[idx]
  },
  delete(id: number): void {
    const idx = store.universes.findIndex((u) => u.id === id)
    if (idx === -1) return
    store.universes[idx] = { ...store.universes[idx], deletedAt: now() }
    persist()
    notifyChange()
  },
  restore(id: number): void {
    const idx = store.universes.findIndex((u) => u.id === id)
    if (idx === -1) return
    store.universes[idx] = { ...store.universes[idx], deletedAt: null }
    persist()
    notifyChange()
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
    notifyChange()
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
    notifyChange()
    return entry
  },
  update(id: number, input: LoreEntryInput): LoreEntry {
    const idx = store.loreEntries.findIndex((e) => e.id === id)
    if (idx === -1) throw new Error('Lore entry not found')
    store.loreEntries[idx] = { ...store.loreEntries[idx], ...input }
    persist()
    notifyChange()
    return store.loreEntries[idx]
  },
  delete(id: number): void {
    store.loreEntries = store.loreEntries.filter((e) => e.id !== id)
    persist()
    notifyChange()
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
    notifyChange()
    return chat
  },
  setTags(id: number, tags: string[]): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = { ...store.chats[idx], tags }
    persist()
    notifyChange()
    return store.chats[idx]
  },
  setDirectorsNotes(id: number, directorsNotes: string): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = { ...store.chats[idx], directorsNotes }
    persist()
    notifyChange()
    return store.chats[idx]
  },
  setMood(id: number, moodPreset: Chat['moodPreset']): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = { ...store.chats[idx], moodPreset }
    persist()
    notifyChange()
    return store.chats[idx]
  },
  setContentIntensity(id: number, contentIntensity: Chat['contentIntensity']): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = { ...store.chats[idx], contentIntensity }
    persist()
    notifyChange()
    return store.chats[idx]
  },
  setFictionalDate(id: number, inFictionDate: string | null): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = { ...store.chats[idx], inFictionDate }
    persist()
    notifyChange()
    return store.chats[idx]
  },
  setGroupCharacterIds(id: number, groupCharacterIds: number[]): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = { ...store.chats[idx], groupCharacterIds }
    persist()
    notifyChange()
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
    notifyChange()
    return store.chats[idx]
  },
  rename(id: number, title: string): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = { ...store.chats[idx], title }
    persist()
    notifyChange()
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
    notifyChange()
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
    notifyChange()
    return store.chats[idx]
  },
  setScenario(id: number, scenarioId: number | null): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = { ...store.chats[idx], scenarioId, scenarioMilestoneIndex: 0 }
    persist()
    notifyChange()
    return store.chats[idx]
  },
  setMilestoneIndex(id: number, scenarioMilestoneIndex: number): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = { ...store.chats[idx], scenarioMilestoneIndex }
    persist()
    notifyChange()
    return store.chats[idx]
  },
  setStoryline(id: number, storylineId: number | null): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = { ...store.chats[idx], storylineId }
    persist()
    notifyChange()
    return store.chats[idx]
  },
  setCollaborativeMode(id: number, collaborativeMode: boolean): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = { ...store.chats[idx], collaborativeMode }
    persist()
    notifyChange()
    return store.chats[idx]
  },
  setPriorSummary(id: number, priorSummary: string | null): Chat {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Chat not found')
    store.chats[idx] = { ...store.chats[idx], priorSummary }
    persist()
    notifyChange()
    return store.chats[idx]
  },
  fork(chatId: number, uptoMessageId: number | null): Chat {
    const sourceChat = chatRepo.get(chatId)
    if (!sourceChat) throw new Error('Source chat not found')
    const forkedChat = chatRepo.create({
      ...sourceChat,
      title: `${sourceChat.title} (Fork)`
    })

    const sourceMessages = messageRepo.listByChat(chatId)
    for (const msg of sourceMessages) {
      if (uptoMessageId !== null && msg.id > uptoMessageId) break
      messageRepo.create({
        chatId: forkedChat.id,
        role: msg.role,
        content: msg.content,
        variants: [...msg.variants],
        activeVariantIndex: msg.activeVariantIndex,
        bookmarked: false,
        speakerCharacterId: msg.speakerCharacterId,
        matchedLoreEntryIds: [...msg.matchedLoreEntryIds]
      })
    }
    return forkedChat
  },
  delete(id: number): void {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) return
    store.chats[idx] = { ...store.chats[idx], deletedAt: now() }
    persist()
    notifyChange()
  },
  restore(id: number): void {
    const idx = store.chats.findIndex((c) => c.id === id)
    if (idx === -1) return
    store.chats[idx] = { ...store.chats[idx], deletedAt: null }
    persist()
    notifyChange()
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
    notifyChange()
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
      excludedFromContext: false,
      id: nextId(),
      createdAt: now()
    }
    store.messages.push(message)
    persist()
    notifyChange()
    return message
  },
  toggleBookmark(id: number): ChatMessage {
    const idx = store.messages.findIndex((m) => m.id === id)
    if (idx === -1) throw new Error('Message not found')
    store.messages[idx] = { ...store.messages[idx], bookmarked: !store.messages[idx].bookmarked }
    persist()
    notifyChange()
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
  setSpeaker(id: number, speakerCharacterId: number | null): ChatMessage {
    const idx = store.messages.findIndex((m) => m.id === id)
    if (idx === -1) throw new Error('Message not found')
    store.messages[idx] = { ...store.messages[idx], speakerCharacterId }
    persist()
    notifyChange()
    return store.messages[idx]
  },
  setMatchedLoreEntries(id: number, matchedLoreEntryIds: number[]): void {
    const idx = store.messages.findIndex((m) => m.id === id)
    if (idx === -1) return
    store.messages[idx] = { ...store.messages[idx], matchedLoreEntryIds }
    persist()
    notifyChange()
  },
  updateContent(id: number, content: string): void {
    const idx = store.messages.findIndex((m) => m.id === id)
    if (idx === -1) return
    const msg = store.messages[idx]
    const variants = [...msg.variants]
    variants[msg.activeVariantIndex] = content
    store.messages[idx] = { ...msg, content, variants }
    persist()
    notifyChange()
  },
  addVariant(id: number, content: string): ChatMessage {
    const idx = store.messages.findIndex((m) => m.id === id)
    if (idx === -1) throw new Error('Message not found')
    const msg = store.messages[idx]
    const variants = [...msg.variants, content]
    store.messages[idx] = { ...msg, content, variants, activeVariantIndex: variants.length - 1 }
    persist()
    notifyChange()
    return store.messages[idx]
  },
  setActiveVariant(id: number, index: number): ChatMessage {
    const idx = store.messages.findIndex((m) => m.id === id)
    if (idx === -1) throw new Error('Message not found')
    const msg = store.messages[idx]
    const clamped = Math.max(0, Math.min(index, msg.variants.length - 1))
    store.messages[idx] = { ...msg, content: msg.variants[clamped], activeVariantIndex: clamped }
    persist()
    notifyChange()
    return store.messages[idx]
  },
  delete(id: number): void {
    store.messages = store.messages.filter((m) => m.id !== id)
    persist()
    notifyChange()
  },
  markExcludedFromContext(chatId: number, uptoMessageId: number): void {
    store.messages = store.messages.map((m) =>
      m.chatId === chatId && m.id <= uptoMessageId ? { ...m, excludedFromContext: true } : m
    )
    persist()
    notifyChange()
  },
  deleteAllForChat(chatId: number): void {
    store.messages = store.messages.filter((m) => m.chatId !== chatId)
    persist()
    notifyChange()
  }
}

export const customPresetRepo = {
  list(): CustomPreset[] {
    return [...store.customPresets].sort((a, b) => a.name.localeCompare(b.name))
  },
  get(id: number): CustomPreset | undefined {
    return store.customPresets.find((p) => p.id === id)
  },
  create(input: CustomPresetInput): CustomPreset {
    const preset: CustomPreset = { ...input, id: nextId(), createdAt: now() }
    store.customPresets.push(preset)
    persist()
    notifyChange()
    return preset
  },
  update(id: number, input: Partial<CustomPresetInput>): CustomPreset {
    const idx = store.customPresets.findIndex((p) => p.id === id)
    if (idx === -1) throw new Error('Style not found')
    store.customPresets[idx] = { ...store.customPresets[idx], ...input }
    persist()
    notifyChange()
    return store.customPresets[idx]
  },
  delete(id: number): void {
    store.customPresets = store.customPresets.filter((p) => p.id !== id)
    persist()
    notifyChange()
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
    notifyChange()
    return scenario
  },
  update(id: number, input: ScenarioInput): Scenario {
    const idx = store.scenarios.findIndex((s) => s.id === id)
    if (idx === -1) throw new Error('Scenario not found')
    store.scenarios[idx] = { ...store.scenarios[idx], ...input }
    persist()
    notifyChange()
    return store.scenarios[idx]
  },
  delete(id: number): void {
    store.scenarios = store.scenarios.filter((s) => s.id !== id)
    store.chats = store.chats.map((c) =>
      c.scenarioId === id ? { ...c, scenarioId: null, scenarioMilestoneIndex: 0 } : c
    )
    persist()
    notifyChange()
  }
}

export const storylineRepo = {
  listForCharacter(characterId: number): Storyline[] {
    return store.storylines
      .filter((s) => s.characterId === characterId)
      .sort((a, b) => a.name.localeCompare(b.name))
  },
  get(id: number): Storyline | undefined {
    return store.storylines.find((s) => s.id === id)
  },
  create(input: StorylineInput): Storyline {
    const storyline: Storyline = { ...input, id: nextId(), createdAt: now() }
    store.storylines.push(storyline)
    persist()
    notifyChange()
    return storyline
  },
  rename(id: number, name: string): Storyline {
    const idx = store.storylines.findIndex((s) => s.id === id)
    if (idx === -1) throw new Error('Storyline not found')
    store.storylines[idx] = { ...store.storylines[idx], name }
    persist()
    notifyChange()
    return store.storylines[idx]
  },
  delete(id: number): void {
    store.storylines = store.storylines.filter((s) => s.id !== id)
    store.chats = store.chats.map((c) => (c.storylineId === id ? { ...c, storylineId: null } : c))
    persist()
    notifyChange()
  }
}

export const journalRepo = {
  listForCharacter(characterId: number): JournalEntry[] {
    return store.journalEntries
      .filter((j) => j.characterId === characterId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },
  get(id: number): JournalEntry | undefined {
    return store.journalEntries.find((j) => j.id === id)
  },
  upsertForChat(input: JournalEntryInput): JournalEntry {
    const existingIdx = store.journalEntries.findIndex((j) => j.chatId === input.chatId)
    if (existingIdx !== -1) {
      store.journalEntries[existingIdx] = {
        ...store.journalEntries[existingIdx],
        chatTitle: input.chatTitle,
        summary: input.summary
      }
      persist()
      notifyChange()
      return store.journalEntries[existingIdx]
    }
    const entry: JournalEntry = { ...input, id: nextId(), createdAt: now() }
    store.journalEntries.push(entry)
    persist()
    notifyChange()
    return entry
  },
  delete(id: number): void {
    store.journalEntries = store.journalEntries.filter((j) => j.id !== id)
    persist()
    notifyChange()
  }
}

export const statsRepo = {
  overview() {
    const activeChats = store.chats.filter((c) => !c.deletedAt)
    const activeChatIds = new Set(activeChats.map((c) => c.id))
    const messages = store.messages.filter((m) => activeChatIds.has(m.chatId))
    const totalMessages = messages.length
    const totalWords = messages.reduce(
      (acc, m) => acc + (m.content ? m.content.trim().split(/\s+/).filter(Boolean).length : 0),
      0
    )

    const charStats = new Map<
      number,
      { characterId: number; characterName: string; messageCount: number; wordCount: number }
    >()
    for (const c of store.characters.filter((c) => !c.deletedAt)) {
      charStats.set(c.id, { characterId: c.id, characterName: c.name, messageCount: 0, wordCount: 0 })
    }
    for (const chat of activeChats) {
      const entry = charStats.get(chat.characterId)
      if (entry) {
        const chatMsgs = store.messages.filter((m) => m.chatId === chat.id)
        entry.messageCount += chatMsgs.length
        entry.wordCount += chatMsgs.reduce(
          (acc, m) => acc + (m.content ? m.content.trim().split(/\s+/).filter(Boolean).length : 0),
          0
        )
      }
    }
    return {
      totalMessages,
      totalWords,
      perCharacter: Array.from(charStats.values()).sort((a, b) => b.wordCount - a.wordCount),
      streakDays: 1
    }
  }
}

function backfill(raw: any): Store {
  const s = { ...emptyStore(), ...raw }
  if (!s.nextId) s.nextId = 1
  s.characters = (s.characters || []).map((c: any) => ({
    avatarType: 'monogram',
    avatarPath: null,
    avatarEmoji: null,
    universeId: null,
    baseCharacterId: null,
    isWorldbuildingAssistant: false,
    tags: [],
    relationships: '',
    scenario: '',
    deletedAt: null,
    ...c
  }))
  s.chats = (s.chats || []).map((c: any) => ({
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
    deletedAt: null,
    ...c
  }))
  s.messages = (s.messages || []).map((m: any) => ({
    variants: [m.content || ''],
    activeVariantIndex: 0,
    bookmarked: false,
    speakerCharacterId: null,
    matchedLoreEntryIds: [],
    excludedFromContext: false,
    ...m
  }))
  s.universes = (s.universes || []).map((u: any) => ({
    coWriterCharacterId: null,
    deletedAt: null,
    ...u
  }))
  s.lorebooks = (s.lorebooks || []).map((l: any) => ({
    deletedAt: null,
    universeId: null,
    isCanonSetting: false,
    ...l
  }))
  return s
}

/**
 * Called right after signing in, before the app reloads: everything on this device is queued for
 * upload, so it is merged into the account's cloud copy instead of being replaced by it.
 */
export function queueLocalDataForUpload(): Promise<void> {
  ;(store.syncMeta ??= { stamps: {}, tombstones: {} }).pending = true
  return saveLocalStore(store)
}

export async function initDb(): Promise<void> {
  await loadSession()
  const cloud = await loadStoreFromCloud()
  const localData = await loadLocalStore()
  const local = localData && localData.nextId ? backfill(localData) : null
  if (cloud.status === 'error') {
    console.warn('Could not reach cloud sync; keeping changes on this device until it is reachable.')
  }

  if (cloud.status === 'ok') {
    const remote = backfill(cloud.store)
    // Changes this device made that never reached the cloud are merged in, not thrown away.
    store = local?.syncMeta?.pending ? mergeStores(local, remote) : remote
  } else {
    store = local ?? emptyStore()
    // The cloud was reached but is empty: this device's data becomes the first cloud copy.
    if (cloud.status === 'empty') (store.syncMeta ??= { stamps: {}, tombstones: {} }).pending = true
  }
  baseline = buildBaseline(store)
  saveLocalStore(store)

  if (removeLegacySeedContent(store)) persist()
  if (store.syncMeta?.pending) scheduleSync(0)

  subscribeToCloudChanges((remoteStore) => {
    stampLocalEdits()
    store = mergeStores(store, backfill(remoteStore))
    baseline = buildBaseline(store)
    saveLocalStore(store)
    notifyChange()
    if (store.syncMeta?.pending) scheduleSync()
  })

  // A PWA can be closed at any moment: date and upload pending edits as soon as it's hidden.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') return
      stampLocalEdits()
      saveLocalStore(store)
      if (store.syncMeta?.pending) syncNow().catch(() => {})
    })
  }
}
