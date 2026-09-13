import type { CharacterInput, CustomPresetInput, LoreEntryInput, LorebookInput, SamplerSettings } from './types'
import { DEFAULT_SAMPLER_SETTINGS } from './types'
import { LORE_ENTRY_TYPES } from './loreEntryTypes'

export type ParsedLoreEntry = Omit<LoreEntryInput, 'lorebookId'>

/** If a source entry already carries our own entryType/fields shape (e.g. someone picked
 *  a starter-pack export through this importer by mistake), preserve it instead of
 *  flattening everything to "Other" with no structured fields. */
function detectNativeShape(e: any): { entryType: keyof typeof LORE_ENTRY_TYPES; fields: Record<string, string> } | null {
  if (typeof e.entryType !== 'string' || !(e.entryType in LORE_ENTRY_TYPES)) return null
  if (!e.fields || typeof e.fields !== 'object') return null
  const fields = Object.entries(e.fields as Record<string, unknown>).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      if (typeof value === 'string') acc[key] = value
      return acc
    },
    {}
  )
  return { entryType: e.entryType, fields }
}

export interface ParsedLorebook {
  lorebook: LorebookInput
  entries: ParsedLoreEntry[]
}

export interface ParsedCharacter {
  character: CharacterInput
  lorebook?: ParsedLorebook
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return ''
}

function joinLines(...parts: (string | undefined | null)[]): string {
  return parts.filter((p): p is string => !!p && p.trim().length > 0).join('\n\n')
}

const FIELD_KEYWORDS: { field: keyof CharacterInput; matches: string[] }[] = [
  { field: 'appearance', matches: ['appear', 'looks', 'physical'] },
  { field: 'personality', matches: ['person', 'trait', 'temperament'] },
  { field: 'speechStyle', matches: ['speech', 'voice', 'tone', 'dialect', 'accent'] },
  { field: 'background', matches: ['background', 'history', 'backstory', 'origin'] },
  { field: 'relationships', matches: ['relation', 'family', 'friend'] },
  { field: 'scenario', matches: ['scenario', 'setting', 'situation', 'world'] }
]

function matchAttributeField(key: string): keyof CharacterInput | null {
  const lower = key.toLowerCase()
  for (const { field, matches } of FIELD_KEYWORDS) {
    if (matches.some((m) => lower.includes(m))) return field
  }
  return null
}

/** Agnaistic-style persona: { kind: 'text' | 'attributes', attributes: { [key]: string[] } }. */
function parseAgnaisticPersona(persona: any): Partial<CharacterInput> {
  const out: Partial<CharacterInput> = {}
  if (!persona || typeof persona !== 'object') return out
  const attributes = persona.attributes
  if (!attributes || typeof attributes !== 'object') return out

  const notesLines: string[] = []
  for (const [key, value] of Object.entries(attributes)) {
    const text = Array.isArray(value) ? value.join(', ') : String(value ?? '')
    if (!text.trim()) continue
    if (key.toLowerCase() === 'text') {
      out.personality = joinLines(out.personality, text)
      continue
    }
    const field = matchAttributeField(key)
    if (field) {
      out[field] = joinLines(out[field] as string, text) as never
    } else {
      notesLines.push(`${key}: ${text}`)
    }
  }
  if (notesLines.length > 0) out.notes = joinLines(out.notes, notesLines.join('\n'))
  return out
}

/** Character Card V2/V3 embedded lorebook ("character_book"). */
function parseCharacterBook(book: any): ParsedLorebook | undefined {
  if (!book || typeof book !== 'object') return undefined
  const rawEntries = Array.isArray(book.entries)
    ? book.entries
    : book.entries && typeof book.entries === 'object'
      ? Object.values(book.entries)
      : []
  if (rawEntries.length === 0) return undefined

  const entries: ParsedLoreEntry[] = rawEntries.map((e: any, i: number) => {
    const keys: string[] = Array.isArray(e.keys)
      ? e.keys
      : Array.isArray(e.key)
        ? e.key
        : typeof e.key === 'string'
          ? [e.key]
          : []
    const native = detectNativeShape(e)
    return {
      title: firstNonEmptyString(e.name, e.comment, e.title, `Entry ${i + 1}`),
      entryType: native?.entryType ?? 'other',
      keywords: keys.filter((k) => typeof k === 'string' && k.trim()),
      description: firstNonEmptyString(e.content, e.entry, e.value),
      fields: native?.fields ?? {},
      enabled: e.enabled !== false && e.disable !== true
    }
  })

  return {
    lorebook: {
      name: firstNonEmptyString(book.name, 'Imported Lorebook'),
      description: firstNonEmptyString(book.description),
      isCanonSetting: false
    },
    entries
  }
}

/**
 * Parses a character JSON payload from Agnaistic's native export, a Character Card
 * V2/V3 export (SillyTavern/Chub/Agnaistic all support this shared spec), or a
 * loosely-shaped JSON blob, into our structured Character fields. Unrecognized
 * top-level string fields are preserved in `notes` rather than silently dropped.
 */
export function parseCharacterImport(raw: any): ParsedCharacter {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Not a valid character file')
  }

  // Character Card V2/V3 spec wraps everything under `data`.
  const isCardSpec = typeof raw.spec === 'string' && raw.spec.toLowerCase().includes('chara_card')
  const data = isCardSpec && raw.data ? raw.data : raw

  const name = firstNonEmptyString(data.name, data.char_name, data.title)
  if (!name) throw new Error('Character file has no name field')

  const character: CharacterInput = {
    name,
    avatarType: 'monogram',
    avatarPath: null,
    avatarEmoji: null,
    universeId: null,
    baseCharacterId: null,
    isWorldbuildingAssistant: false,
    tags: [],
    appearance: firstNonEmptyString(data.appearance, data.looks, data.physicalDescription),
    personality: firstNonEmptyString(data.personality, data.traits),
    speechStyle: firstNonEmptyString(data.speech, data.speechStyle, data.speech_style, data.voice),
    background: firstNonEmptyString(data.background, data.history, data.backstory),
    relationships: firstNonEmptyString(data.relationships, data.relations),
    scenario: firstNonEmptyString(data.scenario, data.world_scenario, data.setting),
    firstMessage: firstNonEmptyString(
      data.greeting,
      data.first_mes,
      data.firstMessage,
      data.first_message,
      data.mes
    ),
    notes: ''
  }

  // Agnaistic structured/attributes persona, if present, fills in gaps and unmatched
  // attributes go to notes.
  const fromPersona = parseAgnaisticPersona(data.persona)
  for (const [key, value] of Object.entries(fromPersona)) {
    const k = key as keyof CharacterInput
    if (k === 'notes') {
      character.notes = joinLines(character.notes, value as string)
    } else if (!character[k]) {
      ;(character as any)[k] = value
    }
  }

  // Card V2's `description` is typically one big freeform blob covering
  // appearance/personality/etc — keep it if we didn't get a personality elsewhere.
  const description = firstNonEmptyString(data.description)
  if (description) {
    if (!character.personality) character.personality = description
    else character.notes = joinLines(character.notes, `Description: ${description}`)
  }

  const exampleDialogue = firstNonEmptyString(data.mes_example, data.sampleChat, data.exampleDialogue)
  if (exampleDialogue) {
    character.notes = joinLines(character.notes, `Example dialogue:\n${exampleDialogue}`)
  }

  const creatorNotes = firstNonEmptyString(data.creator_notes, data.creatorNotes)
  if (creatorNotes) {
    character.notes = joinLines(character.notes, creatorNotes)
  }

  const lorebook = parseCharacterBook(data.character_book ?? data.characterBook ?? raw.character_book)

  return { character, lorebook }
}

/**
 * Parses a standalone lorebook export: Agnaistic "memory book" format
 * ({ name, description, entries: [{ name, entry, keywords, enabled }] }) or
 * SillyTavern World Info format ({ entries: { "0": { key, content, comment } } }).
 */
export function parseLorebookImport(raw: any): ParsedLorebook {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Not a valid lorebook file')
  }

  const rawEntries = Array.isArray(raw.entries)
    ? raw.entries
    : raw.entries && typeof raw.entries === 'object'
      ? Object.values(raw.entries)
      : []

  const entries: ParsedLoreEntry[] = rawEntries.map((e: any, i: number) => {
    const keys: string[] = Array.isArray(e.keywords)
      ? e.keywords
      : Array.isArray(e.keys)
        ? e.keys
        : Array.isArray(e.key)
          ? e.key
          : typeof e.key === 'string'
            ? [e.key]
            : []
    const native = detectNativeShape(e)
    return {
      title: firstNonEmptyString(e.name, e.comment, e.title, `Entry ${i + 1}`),
      entryType: native?.entryType ?? 'other',
      keywords: keys.filter((k) => typeof k === 'string' && k.trim()),
      description: firstNonEmptyString(e.entry, e.content, e.value),
      fields: native?.fields ?? {},
      enabled: e.enabled !== false && e.disable !== true
    }
  })

  return {
    lorebook: {
      name: firstNonEmptyString(raw.name, 'Imported Lorebook'),
      description: firstNonEmptyString(raw.description),
      isCanonSetting: !!raw.isCanonSetting
    },
    entries
  }
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const v of values) {
    if (typeof v === 'number' && !Number.isNaN(v)) return v
  }
  return undefined
}

/**
 * Parses a generation preset export (Agnaistic "Gen Preset", or similar
 * SillyTavern-style sampler config) into a model id + sampler settings.
 * Field names vary a lot between tools/versions, so many aliases are checked;
 * a model id that can't be found is left blank rather than guessed.
 */
export function parsePresetImport(raw: any): CustomPresetInput {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Not a valid preset file')
  }

  const name = firstNonEmptyString(raw.name, raw.label, raw.presetName, 'Imported Preset')

  const modelId = firstNonEmptyString(
    raw.model,
    raw.modelId,
    raw.openRouterModel,
    raw.registered?.openrouter?.model,
    raw.models?.openrouter,
    raw.thirdPartyModel
  )

  const samplerSettings: SamplerSettings = {
    temperature: firstNumber(raw.temp, raw.temperature) ?? DEFAULT_SAMPLER_SETTINGS.temperature,
    topP: firstNumber(raw.topP, raw.top_p) ?? DEFAULT_SAMPLER_SETTINGS.topP,
    maxTokens:
      firstNumber(raw.maxTokens, raw.max_tokens, raw.max_new_tokens, raw.genAmount) ??
      DEFAULT_SAMPLER_SETTINGS.maxTokens,
    contextLength:
      firstNumber(raw.maxContextLength, raw.max_context_length, raw.contextSize, raw.context) ??
      DEFAULT_SAMPLER_SETTINGS.contextLength
  }

  const topK = firstNumber(raw.topK, raw.top_k)
  if (topK !== undefined) samplerSettings.topK = topK

  const frequencyPenalty = firstNumber(raw.frequencyPenalty, raw.frequency_penalty)
  if (frequencyPenalty !== undefined) samplerSettings.frequencyPenalty = frequencyPenalty

  const presencePenalty = firstNumber(raw.presencePenalty, raw.presence_penalty)
  if (presencePenalty !== undefined) samplerSettings.presencePenalty = presencePenalty

  const repetitionPenalty = firstNumber(
    raw.repetitionPenalty,
    raw.repetition_penalty,
    raw.repPenalty,
    raw.rep_pen
  )
  if (repetitionPenalty !== undefined) samplerSettings.repetitionPenalty = repetitionPenalty

  return { name, modelId, samplerSettings }
}
