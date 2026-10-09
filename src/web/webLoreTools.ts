import type { LoreEntryType } from '@shared/types'
import { LORE_ENTRY_TYPES } from '@shared/loreEntryTypes'
import { CLERICAL_MODEL_ID } from '@shared/presets'
import { getCompletion } from './webOpenRouter'
import { parseJsonObject } from './webWritingTools'

const MAX_PROMPT_CHARS = 12000

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

export async function fetchUrlAsText(url: string): Promise<string> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error("That doesn't look like a valid URL.")
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http/https URLs are supported.')
  }

  try {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`Failed to fetch (${res.status} ${res.statusText})`)
    }
    const html = await res.text()
    const infobox = extractFandomInfobox(html)
    return `${infobox}${stripTags(html)}`
  } catch (err: any) {
    // Check for CORS restriction in browser
    if (err.name === 'TypeError' || (err.message && err.message.includes('Failed to fetch'))) {
      throw new Error(
        `Cross-origin request blocked by the target site (${parsed.hostname}). In the web version, please copy the text from the page and paste it directly into the box!`
      )
    }
    throw err
  }
}

export async function structureLoreText(
  entryType: LoreEntryType,
  rawText: string
): Promise<{ title: string; description: string; keywords: string[]; fields: Record<string, string> }> {
  const typeDef = LORE_ENTRY_TYPES[entryType]
  const fieldGuide = typeDef.fields.map((f) => `- ${f.key}: ${f.label} — ${f.hint}`).join('\n')
  const fieldKeys = typeDef.fields.map((f) => f.key)

  const prompt =
    `Extract structured facts from the reference text below for a "${typeDef.label}" lore entry.\n\n` +
    'Return ONLY a JSON object, no markdown code fences, no commentary, in exactly this shape:\n' +
    `{"title": string, "description": string, "keywords": string[], "fields": {${fieldKeys.map((k) => `"${k}": string`).join(', ')}}}\n\n` +
    'Guidelines:\n' +
    '- "title": the name of the person, place, faction, or concept.\n' +
    '- "description": 1-2 sentence overview of what/who this is.\n' +
    '- "keywords": 3-6 lowercase trigger words or phrases that should activate this lore in a chat (names, aliases, titles, key terms).\n' +
    `- "fields": values for the schema fields below. Only use facts actually present in the text — leave a field as "" rather than inventing something.\n\n` +
    `Field guide for ${typeDef.label}:\n${fieldGuide}\n\n` +
    `Reference text:\n"""\n${rawText.slice(0, MAX_PROMPT_CHARS)}\n"""`

  const responseText = await getCompletion(
    CLERICAL_MODEL_ID,
    [{ role: 'user', content: prompt }],
    { temperature: 0.2, topP: 1, maxTokens: 900 }
  )

  const parsed = parseJsonObject(responseText)

  const title = typeof parsed.title === 'string' ? parsed.title.trim() : ''
  const description = typeof parsed.description === 'string' ? parsed.description.trim() : ''
  const keywords = Array.isArray(parsed.keywords)
    ? parsed.keywords
        .filter((k: unknown): k is string => typeof k === 'string')
        .map((k: string) => k.trim().toLowerCase())
        .filter(Boolean)
    : []

  const rawFields = parsed.fields && typeof parsed.fields === 'object' ? parsed.fields : {}
  const fields: Record<string, string> = {}
  for (const key of fieldKeys) {
    const val = rawFields[key]
    fields[key] = typeof val === 'string' ? val.trim() : ''
  }

  return { title, description, keywords, fields }
}
