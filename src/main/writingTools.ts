import { CLERICAL_MODEL_ID } from '@shared/presets'
import { getCompletion } from './openrouter'
import { parseJsonObject } from './loreImport'

/** Looks up synonyms for one word as it's used in `context` (the composer draft it came from, for
 *  sense disambiguation) — a lookup task, not creative writing, so it always uses the hidden
 *  clerical model regardless of which model the Act itself is set to. */
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

/** Rewrites a passage (typically the user's own composer draft) to be more detailed or more
 *  concise. Unlike the clerical lookup tools, this genuinely is creative writing — it should sound
 *  like the same scene — so the caller passes the Act's own assembled prompt messages so the
 *  rewrite has the same character/scene context, and uses the Act's own model. */
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
