import type { LoreEntryType } from '@shared/types'
import { LORE_ENTRY_TYPES } from '@shared/loreEntryTypes'
import { CLERICAL_MODEL_ID } from '@shared/presets'
import { getCompletion } from './openrouter'

const MAX_FETCHED_CHARS = 20000
const MAX_PROMPT_CHARS = 12000

/** Strips tags/entities from a small HTML fragment down to plain text — shared by the
 *  full-page stripper and the infobox extractor below. */
function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ', ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Fandom (formerly Wikia) hosts the wiki for most game/anime/book/show fandoms — Supernatural,
 *  Harry Potter, Tolkien, FFXIV, Genshin, and virtually everything in between — and they all use
 *  the same stable "portable infobox" markup for a subject's key facts (race, affiliation, etc).
 *  Pulling those label/value pairs out explicitly, instead of letting them get flattened into the
 *  same noisy blob as nav/ads text, gives the model much cleaner signal to work from. Best-effort:
 *  returns '' for any page that isn't a Fandom infobox, which is the common case and already
 *  handled fine by the generic stripping below. */
export function extractFandomInfobox(html: string): string {
  const asideMatch = html.match(/<aside[^>]*class="[^"]*portable-infobox[^"]*"[^>]*>([\s\S]*?)<\/aside>/i)
  if (!asideMatch) return ''
  const infobox = asideMatch[1]

  const lines: string[] = []
  const titleMatch = infobox.match(/<h2[^>]*class="[^"]*pi-(?:item-)?title[^"]*"[^>]*>([\s\S]*?)<\/h2>/i)
  if (titleMatch) {
    const title = stripTags(titleMatch[1])
    if (title) lines.push(`Name: ${title}`)
  }

  const pairRegex =
    /<h3[^>]*class="[^"]*pi-data-label[^"]*"[^>]*>([\s\S]*?)<\/h3>\s*<div[^>]*class="[^"]*pi-data-value[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
  let pair: RegExpExecArray | null
  while ((pair = pairRegex.exec(infobox))) {
    const label = stripTags(pair[1])
    const value = stripTags(pair[2])
    if (label && value) lines.push(`${label}: ${value}`)
  }

  return lines.length > 0 ? `Infobox:\n${lines.join('\n')}\n\n` : ''
}

/** Fetches a URL and strips it down to plain-ish text — naive but good enough for a
 *  model to pick relevant facts out of a wiki page's noise (nav, ads, markup). */
export async function fetchUrlAsText(url: string): Promise<string> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('That doesn\'t look like a valid URL.')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http/https URLs are supported.')
  }

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Autonym/1.0)' }
  })
  if (!res.ok) throw new Error(`Failed to fetch that page (${res.status}).`)
  const html = await res.text()

  const infobox = extractFandomInfobox(html)

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()

  const combined = (infobox + text).trim()
  if (!combined) throw new Error('Could not extract any readable text from that page.')
  return combined.slice(0, MAX_FETCHED_CHARS)
}

export interface StructuredLoreResult {
  title: string
  description: string
  keywords: string[]
  fields: Record<string, string>
}

export function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()
}

/** Parses a model's JSON response defensively — some models add a stray sentence of preamble or
 *  commentary around the JSON object despite being told not to. Tries a clean parse first, then
 *  falls back to just the substring between the first "{" and the last "}". */
export function parseJsonObject(text: string): any {
  const cleaned = stripCodeFence(text)
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1))
      } catch {
        // fall through to the error below
      }
    }
    throw new Error("Couldn't parse the model's response as JSON — try again.")
  }
}

/** Asks the model to organize raw reference text into this entry type's guided fields. */
export async function structureLoreText(
  entryType: LoreEntryType,
  rawText: string
): Promise<StructuredLoreResult> {
  const spec = LORE_ENTRY_TYPES[entryType]
  const fieldKeys = [...spec.fields.map((f) => f.key), 'commonMistakes']
  const fieldGuide = spec.fields
    .map((f) => `- ${f.key}: ${f.label}${f.hint ? ` — ${f.hint}` : ''}`)
    .join('\n')

  const prompt =
    `Extract structured facts from the reference text below for a "${spec.label}" world-info entry.\n\n` +
    `Return ONLY a JSON object, no markdown code fences, no commentary, in exactly this shape:\n` +
    `{"title": string, "description": string, "keywords": string[], "fields": {${fieldKeys
      .map((k) => `"${k}": string`)
      .join(', ')}}}\n\n` +
    `Field guide:\n${fieldGuide}\n` +
    `- commonMistakes: things people commonly get wrong about this subject, if apparent from the text — leave "" if none apparent\n` +
    `- keywords: 3-6 short trigger words/phrases someone would type in chat that relate to this subject\n` +
    `- description: a short 1-2 sentence summary\n\n` +
    `Only use facts actually present in the text below. Leave a field as "" rather than inventing something the text doesn't support.\n\n` +
    `Reference text:\n"""\n${rawText.slice(0, MAX_PROMPT_CHARS)}\n"""`

  const responseText = await getCompletion(
    CLERICAL_MODEL_ID,
    [{ role: 'user', content: prompt }],
    { temperature: 0.2, topP: 1, maxTokens: 900 }
  )

  const parsed = parseJsonObject(responseText)

  return {
    title: typeof parsed.title === 'string' ? parsed.title : '',
    description: typeof parsed.description === 'string' ? parsed.description : '',
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.filter((k: unknown) => typeof k === 'string') : [],
    fields:
      parsed.fields && typeof parsed.fields === 'object'
        ? Object.entries(parsed.fields as Record<string, unknown>).reduce<Record<string, string>>(
            (acc, [key, value]) => {
              if (typeof value === 'string') acc[key] = value
              return acc
            },
            {}
          )
        : {}
  }
}
