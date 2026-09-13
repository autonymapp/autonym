import type { Character } from './types'

/** Matches a "**Name:**" (or plain "Name:") speaker cue at the very start of a Group Scene
 *  reply, so the message can be attributed to whichever cast member actually spoke it.
 *  Falls back to the act's primary character when no cue is found or it doesn't match anyone. */
export function detectSpeaker(content: string, character: Character, groupCharacters: Character[]): number | null {
  if (groupCharacters.length === 0) return null
  const match = content.match(/^\s*\*{0,2}([A-Za-z][\w' -]{0,40}?)\*{0,2}\s*:/)
  if (!match) return null
  const name = match[1].trim().toLowerCase()
  const speaker = [character, ...groupCharacters].find((c) => c.name.toLowerCase() === name)
  return speaker && speaker.id !== character.id ? speaker.id : null
}
