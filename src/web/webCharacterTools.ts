import { CHARACTER_FIELDS } from '@shared/characterFields'
import { CLERICAL_MODEL_ID } from '@shared/presets'
import type { Character, ChatMessage } from '@shared/types'
import { getCompletion } from './webOpenRouter'
import { parseJsonObject } from './webWritingTools'

const MAX_PROMPT_CHARS = 12000

export async function structureCharacterText(rawText: string): Promise<Record<string, string>> {
  const fieldGuide = CHARACTER_FIELDS.map((f) => `- ${f.key}: ${f.label} — ${f.hint}`).join('\n')
  const fieldKeys = CHARACTER_FIELDS.map((f) => f.key)

  const prompt =
    'Extract structured facts from the reference text below for a character sheet.\n\n' +
    'Return ONLY a JSON object, no markdown code fences, no commentary, in exactly this shape:\n' +
    `{"fields": {${fieldKeys.map((k) => `"${k}": string`).join(', ')}}}\n\n` +
    `Field guide:\n${fieldGuide}\n\n` +
    'Only use facts actually present in the text below — leave a field as "" rather than inventing ' +
    "something the text doesn't support. \"firstMessage\" should only be filled if the text " +
    'establishes enough of a voice to write one credibly in-character; otherwise leave it "". ' +
    '"scenario" should describe their current situation/setting as established in the text, if any.\n\n' +
    `Reference text:\n"""\n${rawText.slice(0, MAX_PROMPT_CHARS)}\n"""`

  const responseText = await getCompletion(
    CLERICAL_MODEL_ID,
    [{ role: 'user', content: prompt }],
    { temperature: 0.2, topP: 1, maxTokens: 900 }
  )

  const parsed = parseJsonObject(responseText)

  if (!parsed.fields || typeof parsed.fields !== 'object') return {}
  return Object.entries(parsed.fields as Record<string, unknown>).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      if (typeof value === 'string' && fieldKeys.includes(key as (typeof fieldKeys)[number])) acc[key] = value
      return acc
    },
    {}
  )
}

export type ExtractedCharacterDraft = {
  name: string
  appearance: string
  personality: string
  speechStyle: string
  background: string
  relationships: string
  scenario: string
  firstMessage: string
  notes: string
}

function hasProfile(character: Character): boolean {
  return Boolean(
    character.appearance.trim() ||
      character.personality.trim() ||
      character.speechStyle.trim() ||
      character.background.trim()
  )
}

export async function extractCharacterFromChat(
  history: ChatMessage[],
  modelId: string,
  baseCharacter: Character | null
): Promise<ExtractedCharacterDraft> {
  if (!modelId) throw new Error('Pick a model first.')

  const transcript = history
    .map((m) => `${m.role === 'user' ? 'User' : 'Partner'}: ${m.content}`)
    .join('\n')
    .slice(-MAX_PROMPT_CHARS)

  const baseContext =
    baseCharacter && hasProfile(baseCharacter)
      ? `For reference, this is ${baseCharacter.name}'s default profile outside this chat — only extract what THIS conversation specifically established or changed; personality and speech style likely carry over into an AU unless the conversation contradicts them:\n` +
        `Appearance: ${baseCharacter.appearance}\nPersonality: ${baseCharacter.personality}\n` +
        `Speech style: ${baseCharacter.speechStyle}\nBackground: ${baseCharacter.background}\n\n` +
        `If this looks like an alternate-universe take on ${baseCharacter.name} rather than a brand-new character, default "name" to "${baseCharacter.name} (AU)" unless the conversation used a different name.\n\n`
      : ''

  const prompt =
    'The conversation below is from a collaborative "Collaborative Mode" chat, where a user and an AI develop a character/story together rather than the AI staying fixed to pre-written canon. ' +
    "Identify the single most developed character in the conversation as it stands in THIS chat — not the user's own persona — and extract what's been established about them.\n\n" +
    baseContext +
    'Return ONLY a JSON object, no markdown code fences, no commentary, in exactly this shape:\n' +
    '{"name": string, "appearance": string, "personality": string, "speechStyle": string, "background": string, "relationships": string, "scenario": string, "firstMessage": string, "notes": string}\n\n' +
    'Leave a field as "" if the conversation doesn\'t establish it — don\'t invent details that weren\'t discussed. ' +
    '"scenario" should describe their current situation/setting as established in this chat. "firstMessage" should be a short in-character line they might open a new roleplay chat with, written in their established voice, only if enough voice is established to do so credibly (otherwise "").\n\n' +
    `Conversation:\n"""\n${transcript}\n"""`

  const responseText = await getCompletion(
    modelId,
    [{ role: 'user', content: prompt }],
    { temperature: 0.4, topP: 1, maxTokens: 900 }
  )

  const parsed = parseJsonObject(responseText)
  const str = (v: unknown): string => (typeof v === 'string' ? v : '')

  return {
    name: str(parsed.name),
    appearance: str(parsed.appearance),
    personality: str(parsed.personality),
    speechStyle: str(parsed.speechStyle),
    background: str(parsed.background),
    relationships: str(parsed.relationships),
    scenario: str(parsed.scenario),
    firstMessage: str(parsed.firstMessage),
    notes: str(parsed.notes)
  }
}
