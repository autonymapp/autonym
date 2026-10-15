import type {
  Character,
  CharacterRelationship,
  Chat,
  ChatMessage,
  LoreEntry,
  Lorebook,
  Persona,
  Universe
} from './types'

/** The parts of the desktop and web stores the legacy seed cleanup reads and rewrites. */
export interface SeedCleanupStore {
  characters: Character[]
  personas: Persona[]
  chats: Chat[]
  messages: ChatMessage[]
  characterLorebooks: { characterId: number; lorebookId: number }[]
  characterRelationships: CharacterRelationship[]
  universes: Universe[]
  lorebooks: Lorebook[]
  loreEntries: LoreEntry[]
  /** Set once the one-time removal of legacy tutorial seed content has run. */
  seedCleanupDone?: boolean
}

const SEED_CHARACTER_NAMES = new Set(['Nym', 'Wren', 'Dorian Vance'])
const SEED_UNIVERSE_NAMES = new Set(['The Between', 'Thornwood'])
const SEED_PERSONA_NAMES = new Set(['A Wanderer'])

/**
 * Removes the demo cast older builds seeded on first launch (characters, their chats, the demo
 * persona) from stores that still carry it. Runs once per store: after that, anything the user
 * creates with the same names is left alone. Never removes anything else the user made, and
 * only removes a seed universe or its lorebook when no remaining character belongs to it.
 * Returns true when the store changed.
 */
export function removeLegacySeedContent(s: SeedCleanupStore): boolean {
  if (s.seedCleanupDone) return false
  s.seedCleanupDone = true

  const seedIds = new Set(s.characters.filter((c) => SEED_CHARACTER_NAMES.has(c.name)).map((c) => c.id))
  if (seedIds.size > 0) {
    s.characters = s.characters.filter((c) => !seedIds.has(c.id))
    const removedChatIds = new Set(s.chats.filter((ch) => seedIds.has(ch.characterId)).map((ch) => ch.id))
    s.chats = s.chats.filter((ch) => !removedChatIds.has(ch.id))
    s.messages = s.messages.filter((m) => !removedChatIds.has(m.chatId))
    s.characterLorebooks = s.characterLorebooks.filter((l) => !seedIds.has(l.characterId))
    s.characterRelationships = s.characterRelationships.filter(
      (r) => !seedIds.has(r.characterAId) && !seedIds.has(r.characterBId)
    )
  }

  const seedPersonaIds = new Set(s.personas.filter((p) => SEED_PERSONA_NAMES.has(p.name)).map((p) => p.id))
  if (seedPersonaIds.size > 0) {
    s.personas = s.personas.filter((p) => !seedPersonaIds.has(p.id))
    s.chats = s.chats.map((ch) =>
      ch.personaId !== null && seedPersonaIds.has(ch.personaId) ? { ...ch, personaId: null } : ch
    )
  }

  const usedUniverseIds = new Set(s.characters.map((c) => c.universeId).filter((id) => id !== null))
  const removableUniverseIds = new Set(
    s.universes.filter((u) => SEED_UNIVERSE_NAMES.has(u.name) && !usedUniverseIds.has(u.id)).map((u) => u.id)
  )
  if (removableUniverseIds.size > 0) {
    s.universes = s.universes.filter((u) => !removableUniverseIds.has(u.id))
    const removedLorebookIds = new Set(
      s.lorebooks
        .filter((l) => l.universeId !== null && removableUniverseIds.has(l.universeId) && l.name.includes('The Between'))
        .map((l) => l.id)
    )
    s.lorebooks = s.lorebooks.filter((l) => !removedLorebookIds.has(l.id))
    s.loreEntries = s.loreEntries.filter((e) => !removedLorebookIds.has(e.lorebookId))
  }

  return true
}
