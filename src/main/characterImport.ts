import { CHARACTER_FIELDS } from '@shared/characterFields'
import { CLERICAL_MODEL_ID } from '@shared/presets'
import { getCompletion } from './openrouter'
import { parseJsonObject } from './loreImport'

const MAX_PROMPT_CHARS = 12000

/** Asks the model to organize raw reference text (a wiki page, notes, anything) into this app's
 *  guided character-sheet fields — the same fields CharacterForm.tsx edits, kept in sync via the
 *  shared CHARACTER_FIELDS spec. Mirrors structureLoreText in loreImport.ts, minus the
 *  lore-specific keywords/commonMistakes concepts that don't apply to a character sheet. */
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
