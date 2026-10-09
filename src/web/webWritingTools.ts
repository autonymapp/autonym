import { CLERICAL_MODEL_ID } from '@shared/presets'
import { getCompletion } from './webOpenRouter'

export function parseJsonObject(raw: string): any {
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  }
  try {
    return JSON.parse(cleaned)
  } catch {
    const first = cleaned.indexOf('{')
    const last = cleaned.lastIndexOf('}')
    if (first !== -1 && last > first) {
      try {
        return JSON.parse(cleaned.slice(first, last + 1))
      } catch {
        return {}
      }
    }
    return {}
  }
}

export async function lookupSynonyms(word: string, context: string): Promise<string[]> {
  const trimmedWord = word.trim()
  if (!trimmedWord) return []

  const prompt =
    `Give 5-8 synonyms for the word "${trimmedWord}" as it's used in the sentence/passage below — ` +
    'fitting its specific sense there, not every possible meaning of the word. Prefer words that ' +
    "fit prose/roleplay writing. Return ONLY a JSON object, no commentary, in exactly this shape: " +
    '{"synonyms": string[]}\n\n' +
    `Passage:\n"""\n${context.slice(0, 2000)}\n"""`

  const responseText = await getCompletion(
    CLERICAL_MODEL_ID,
    [{ role: 'user', content: prompt }],
    { temperature: 0.3, topP: 1, maxTokens: 200 }
  )

  const parsed = parseJsonObject(responseText)
  if (!Array.isArray(parsed.synonyms)) return []
  return parsed.synonyms.filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
}

export type RemixDirection = 'detailed' | 'concise'

const REMIX_INSTRUCTIONS: Record<RemixDirection, string> = {
  detailed:
    'Rewrite the passage below to be more detailed and descriptive — add sensory detail, environment, ' +
    "body language, and pacing. Don't change what happens, who's involved, or the point of view, and " +
    "keep the same formatting convention already used in the passage (quotes for dialogue, asterisks " +
    'for action, tildes for thought, if present).',
  concise:
    'Rewrite the passage below to be more concise — trim it down to the essential dialogue and action, ' +
    "cutting filler and over-explaining. Don't change what happens, who's involved, or the point of " +
    'view, and keep the same formatting convention already used in the passage.'
}

export async function remixPassage(
  modelId: string,
  contextMessages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  passage: string,
  direction: RemixDirection
): Promise<string> {
  if (!modelId) throw new Error('Pick a model before using Remix.')
  const messages = [
    ...contextMessages,
    {
      role: 'system' as const,
      content:
        `${REMIX_INSTRUCTIONS[direction]} Return ONLY the rewritten passage — no commentary, no ` +
        'labels, no quotation marks around the whole thing.\n\n' +
        `Passage:\n"""\n${passage}\n"""`
    }
  ]
  const text = await getCompletion(modelId, messages, { temperature: 0.8, topP: 1, maxTokens: 700 })
  return text.trim()
}
