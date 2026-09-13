export type AvatarType = 'image' | 'emoji' | 'monogram'

export interface Character {
  id: number
  name: string
  avatarType: AvatarType
  avatarPath: string | null
  avatarEmoji: string | null
  /** Which Universe this character belongs to, or null if unassigned. */
  universeId: number | null
  /** Set when this character is a linked variant of another (e.g. a canon FF14 version of an
   *  original character) — the referenced character must itself have baseCharacterId === null.
   *  Personality/speechStyle/relationships fall back to the base's value when left blank here;
   *  see resolveCharacterInheritance in characterInheritance.ts. */
  baseCharacterId: number | null
  /** Marks an auto-created co-writer character used only to run a Universe's worldbuilding
   *  sessions — excluded from the Cast grid and every character picker. */
  isWorldbuildingAssistant: boolean
  /** Free-form organizational labels — whatever the user wants (e.g. "villain", "wip"). */
  tags: string[]
  appearance: string
  personality: string
  speechStyle: string
  background: string
  relationships: string
  scenario: string
  firstMessage: string
  notes: string
  createdAt: string
  /** Set when soft-deleted (sits in Trash); null means active. */
  deletedAt: string | null
}

export type CharacterInput = Omit<Character, 'id' | 'createdAt' | 'deletedAt'>

export interface Persona {
  id: number
  name: string
  description: string
  createdAt: string
}

export type PersonaInput = Omit<Persona, 'id' | 'createdAt'>

export interface Lorebook {
  id: number
  name: string
  description: string
  /** True for an existing franchise/canon setting (a game, show, book, etc.) rather than
   *  something original — tells the AI to stick to stated facts instead of inventing lore. */
  isCanonSetting: boolean
  createdAt: string
  /** Set when soft-deleted (sits in Trash); null means active. */
  deletedAt: string | null
}

export type LorebookInput = Omit<Lorebook, 'id' | 'createdAt' | 'deletedAt'>

/** A top-level world/verse container — groups characters (including linked variants of the same
 *  character across different verses) and can host its own Collaborative Mode worldbuilding Acts. */
export interface Universe {
  id: number
  name: string
  description: string
  /** Lazily-created character used to run this Universe's worldbuilding Acts; null until the
   *  first "Start Worldbuilding Session" call. */
  coWriterCharacterId: number | null
  createdAt: string
  /** Set when soft-deleted (sits in Trash); null means active. */
  deletedAt: string | null
}

export type UniverseInput = Omit<Universe, 'id' | 'createdAt' | 'deletedAt' | 'coWriterCharacterId'>

export type LoreEntryType =
  | 'location'
  | 'character'
  | 'species'
  | 'item'
  | 'organization'
  | 'event'
  | 'concept'
  | 'other'

export interface LoreEntry {
  id: number
  lorebookId: number
  title: string
  entryType: LoreEntryType
  keywords: string[]
  description: string
  /** Answers to the entryType's guided questions, keyed by field id. */
  fields: Record<string, string>
  enabled: boolean
  createdAt: string
}

export type LoreEntryInput = Omit<LoreEntry, 'id' | 'createdAt'>

/** A reusable, pairwise relationship between two characters — shown on a relationship
 *  map and auto-injected into prompts whenever both characters are in the same chat. */
export interface CharacterRelationship {
  id: number
  characterAId: number
  characterBId: number
  label: string
  description: string
  createdAt: string
}

export type CharacterRelationshipInput = Omit<CharacterRelationship, 'id' | 'createdAt'>

export interface SamplerSettings {
  temperature: number
  topP: number
  maxTokens: number
  contextLength: number
  /** Optional advanced knobs, commonly found in Agnaistic/SillyTavern-style presets. */
  topK?: number
  frequencyPenalty?: number
  presencePenalty?: number
  repetitionPenalty?: number
}

export const DEFAULT_SAMPLER_SETTINGS: SamplerSettings = {
  temperature: 0.9,
  topP: 1,
  maxTokens: 512,
  contextLength: 8192
}

export interface CustomPreset {
  id: number
  name: string
  modelId: string
  samplerSettings: SamplerSettings
  createdAt: string
}

export type CustomPresetInput = Omit<CustomPreset, 'id' | 'createdAt'>

export type RpMode = 'narrative' | 'dm'

export const RP_MODE_LABELS: Record<RpMode, string> = {
  narrative: 'Story/Narrative RP',
  dm: 'Dialogue/Direct Message RP'
}

export type MoodPreset = 'slow-burn' | 'high-action' | 'cinematic' | 'slice-of-life'

export const MOOD_PRESET_LABELS: Record<MoodPreset, string> = {
  'slow-burn': 'Slow Burn',
  'high-action': 'High Action & Grit',
  cinematic: 'Cinematic & Atmospheric',
  'slice-of-life': 'Slice of Life / Banter'
}

export const MOOD_PRESET_HINTS: Record<MoodPreset, string> = {
  'slow-burn':
    'Prioritizes subtext, physical boundaries, and emotional hesitation. No premature confessions, sudden reconciliations, or rushed intimacy.',
  'high-action':
    'Shorter sentences, physical positioning and momentum, environmental danger, fast and urgent dialogue.',
  cinematic: 'Sensory detail — sound, weather, light — with slower conversational pacing and evocative prose.',
  'slice-of-life': 'Drops dramatic stakes for natural conversation, lighthearted humor, and comfortable pauses.'
}

export type ContentIntensity = 'standard' | 'mature' | 'explicit'

/** A reusable scene setup plus a loose, ordered roadmap of story beats to guide toward. */
export interface Scenario {
  id: number
  name: string
  description: string
  milestones: string[]
  createdAt: string
}

export type ScenarioInput = Omit<Scenario, 'id' | 'createdAt'>

/** A named grouping of chats for one character — a "storyline" or "arc" spanning
 *  multiple sessions, exportable as a single combined document. */
export interface Storyline {
  id: number
  characterId: number
  name: string
  createdAt: string
}

export type StorylineInput = Omit<Storyline, 'id' | 'createdAt'>

/** One auto-generated, upserted-per-chat summary entry in a character's journal —
 *  a running log of what's happened to them across every chat they appear in. */
export interface JournalEntry {
  id: number
  characterId: number
  chatId: number
  /** Denormalized so the journal still reads fine if the chat is later deleted. */
  chatTitle: string
  summary: string
  createdAt: string
}

export type JournalEntryInput = Omit<JournalEntry, 'id' | 'createdAt'>

export interface Chat {
  id: number
  characterId: number
  personaId: number | null
  /** A full Character the user is playing as, instead of (and taking priority over) personaId. */
  impersonatingCharacterId: number | null
  scenarioId: number | null
  /** Index into the attached scenario's milestones the story is currently working toward. */
  scenarioMilestoneIndex: number
  /** AI-generated recap of an earlier chat this one continues from, if any. */
  priorSummary: string | null
  storylineId: number | null
  /** When true, the AI treats this character's background/scenario as open rather than
   *  fixed canon — collaboratively developing a new setting/situation with the user
   *  instead of assuming their usual backstory applies. Their core personality/speech
   *  style/relationships still carry over. */
  collaborativeMode: boolean
  /** Free-form organizational labels for this chat. */
  tags: string[]
  /** Out-of-character instructions from the user for how this act should play out. */
  directorsNotes: string
  /** Free-text in-fiction date/time (e.g. "Day 3, Morning"), shown as current scene context. */
  inFictionDate: string | null
  /** Additional AI-played cast members sharing this act alongside the primary character —
   *  a "Group Scene". Empty for an ordinary one-on-one act. */
  groupCharacterIds: number[]
  /** Set when this Act is a Universe worldbuilding session, so a character later extracted from
   *  it can be pre-assigned to the same Universe. */
  universeId: number | null
  /** True for a Skit — a short, unattended-generation Act: the AI plays every turn (optionally
   *  across a Group Scene cast) with no persisted user messages driving it, then reads back like
   *  a finished short story rather than a chat transcript. */
  isSkit: boolean
  /** Target turn count for a Skit's generation run — 'short' aims for ~8 assistant turns,
   *  'medium' ~14. Null for an ordinary (non-Skit) Act. */
  skitLength: 'short' | 'medium' | null
  /** One-click pacing steering for this Act, on top of rpMode — null means no extra steering. */
  moodPreset: 'slow-burn' | 'high-action' | 'cinematic' | 'slice-of-life' | null
  /** How permissive the system prompt is about mature content. 'standard' adds no extra
   *  instruction (today's default behavior); model choice matters far more than this setting for
   *  whether mature content actually works — see the hint text next to its UI control. */
  contentIntensity: 'standard' | 'mature' | 'explicit'
  title: string
  modelId: string
  rpMode: RpMode
  samplerSettings: SamplerSettings
  createdAt: string
  /** Set when soft-deleted (sits in Trash); null means active. */
  deletedAt: string | null
}

export type ChatInput = Omit<Chat, 'id' | 'createdAt' | 'deletedAt'>

export type MessageRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: number
  chatId: number
  role: MessageRole
  content: string
  /** Every generated attempt for this message slot (assistant messages only, otherwise [content]). */
  variants: string[]
  activeVariantIndex: number
  bookmarked: boolean
  createdAt: string
  /** In a Group Scene, which character spoke this message — null means the act's primary
   *  character (or, for a user message, is unused). Detected from a "**Name:**" speaker cue
   *  at generation time; irrelevant for ordinary one-on-one acts. */
  speakerCharacterId: number | null
  /** Lorebook entries actually injected into context when this (assistant) message was
   *  generated — lets the UI show which world-info actually fired for this specific reply. */
  matchedLoreEntryIds: number[]
}

/** variants/activeVariantIndex/bookmarked default sensibly in messageRepo.create when omitted. */
export type ChatMessageInput = Omit<
  ChatMessage,
  | 'id'
  | 'createdAt'
  | 'variants'
  | 'activeVariantIndex'
  | 'bookmarked'
  | 'speakerCharacterId'
  | 'matchedLoreEntryIds'
> &
  Partial<
    Pick<
      ChatMessage,
      'variants' | 'activeVariantIndex' | 'bookmarked' | 'speakerCharacterId' | 'matchedLoreEntryIds'
    >
  >

export interface OpenRouterModel {
  id: string
  name: string
  contextLength: number
  promptPrice: string
  completionPrice: string
}

export interface StreamChunkEvent {
  chatId: number
  messageId: number
  delta: string
  done: boolean
  error?: string
}

export interface ApiKeyStatus {
  hasKey: boolean
}
