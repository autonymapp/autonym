import { describe, expect, it } from 'vitest'
import { extractFandomInfobox, parseJsonObject } from './loreImport'

const FANDOM_PAGE = `
<html><body>
<aside class="portable-infobox pi-background-color-blue">
  <h2 class="pi-item pi-item-spacing pi-title">Thancred Waters</h2>
  <section class="pi-item pi-group pi-border-color">
    <div class="pi-item pi-data pi-item-spacing pi-border-color" data-source="race">
      <h3 class="pi-data-label pi-secondary-font">Race</h3>
      <div class="pi-data-value pi-font">Hyur</div>
    </div>
    <div class="pi-item pi-data pi-item-spacing pi-border-color" data-source="affiliation">
      <h3 class="pi-data-label pi-secondary-font">Affiliation</h3>
      <div class="pi-data-value pi-font"><a href="/wiki/Scions">Scions of the Seventh Dawn</a></div>
    </div>
  </section>
</aside>
<div class="mw-parser-output">Some unrelated nav and body text.</div>
</body></html>
`

describe('extractFandomInfobox', () => {
  it('extracts the title and label/value pairs from a Fandom portable-infobox', () => {
    const result = extractFandomInfobox(FANDOM_PAGE)
    expect(result).toContain('Name: Thancred Waters')
    expect(result).toContain('Race: Hyur')
    expect(result).toContain('Affiliation: Scions of the Seventh Dawn')
  })

  it('returns an empty string for a page with no Fandom infobox', () => {
    expect(extractFandomInfobox('<html><body><p>Just a regular page.</p></body></html>')).toBe('')
  })
})

describe('parseJsonObject', () => {
  it('parses a clean JSON response', () => {
    expect(parseJsonObject('{"fields": {"name": "Aria"}}')).toEqual({ fields: { name: 'Aria' } })
  })

  it('strips a markdown code fence', () => {
    expect(parseJsonObject('```json\n{"synonyms": ["quick", "fast"]}\n```')).toEqual({
      synonyms: ['quick', 'fast']
    })
  })

  it('recovers a JSON object buried in stray preamble/commentary', () => {
    expect(parseJsonObject('Sure, here you go:\n{"synonyms": ["brisk"]}\nHope that helps!')).toEqual({
      synonyms: ['brisk']
    })
  })

  it('throws a clear error when no JSON object can be found', () => {
    expect(() => parseJsonObject('I cannot help with that.')).toThrow(/as JSON/)
  })
})
