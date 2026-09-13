import type { Character, ChatMessage } from '@shared/types'
import { getCompletion } from './openrouter'
import { parseJsonObject } from './loreImport'

const MAX_PROMPT_CHARS = 12000

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

/** Asks the model to pull a character profile out of a collaborative-mode conversation —
 *  either a wholly invented character, or an AU take on an existing one — for the user to
 *  review and save as a new character card. Never overwrites the original. */
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
