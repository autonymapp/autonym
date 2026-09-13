import type { Character } from './types'

/** Formats a character's full sheet as a readable Markdown file. */
export function formatCharacterAsSheet(character: Character): string {
  const sections: [string, string][] = [
    ['Appearance', character.appearance],
    ['Personality', character.personality],
    ['Speech Style', character.speechStyle],
    ['Background', character.background],
    ['Relationships', character.relationships],
    ['Scenario', character.scenario],
    ['First Message', character.firstMessage],
    ['Notes', character.notes]
  ]

  const body = sections
    .filter(([, value]) => value.trim().length > 0)
    .map(([heading, value]) => `## ${heading}\n\n${value}`)
    .join('\n\n')

  const tagLine = character.tags.length > 0 ? `\n\n_Tags: ${character.tags.join(', ')}_` : ''

  return `# ${character.name}${tagLine}\n\n${body}\n`
}
